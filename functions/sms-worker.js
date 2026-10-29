// Standalone Node process, NOT a Firebase Cloud Function (Spark-compatible).
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore"
import { isCustomerBooking, sendOwnerSms } from "./owner-sms.js"
import { ownerSmsRoute } from "./owner-sms-route.js"

const required = (name) => {
  if (!process.env[name]) throw new Error(`Missing server environment variable: ${name}`)
  return process.env[name]
}
const shopId = required("SMS_SHOP_ID")
const start = new Date(required("SMS_START_AT"))
if (!Number.isFinite(start.getTime())) throw new Error("SMS_START_AT must be an ISO timestamp")
const config = {
  endpoint: required("PHILSMS_SEND_URL"),
  token: required("PHILSMS_API_TOKEN"),
  senderId: required("PHILSMS_SENDER_ID"),
}
initializeApp({ credential: applicationDefault(), projectId: "smartcutpre" })
const db = getFirestore()
const shop = db.collection("shops").doc(shopId)
const shopSnapshot = await shop.get()
if (!shopSnapshot.exists) throw new Error("Configured shop does not exist; owner SMS disabled")
// Keep SMS_START_AT fixed across restarts: pending bookings are replayed safely.
const query = shop.collection("appointments")
  .where("createdAt", ">=", Timestamp.fromDate(start))
const inFlight = new Set()

async function processBooking(snapshot) {
  if (inFlight.has(snapshot.id)) return
  const booking = snapshot.data()
  if (!isCustomerBooking(booking) || ["Cancelled", "Rejected"].includes(booking.status)) return
  inFlight.add(snapshot.id)
  const delivery = shop.collection("smsDeliveries").doc(snapshot.id)
  try {
    const [currentShop, membership, smsSettings] = await Promise.all([
      shop.get(),
      shop.collection("members").doc(booking.customerId).get(),
      shop.collection("settings").doc("sms").get(),
    ])
    if (!currentShop.exists) return
    if (membership.data()?.role !== "Customer") return
    const route = ownerSmsRoute(shopId, smsSettings.data(), booking.createdAt)
    if (!route) return
    const claimed = await db.runTransaction(async (transaction) => {
      const previous = await transaction.get(delivery)
      if (previous.exists) return false
      transaction.create(delivery, {
        appointmentId: snapshot.id,
        status: "sending",
        createdAt: FieldValue.serverTimestamp(),
        recipient: route.phone,
        shopId,
      })
      return true
    })
    if (!claimed) return
    try {
      await sendOwnerSms({ ...config, phone: route.phone }, booking)
    } catch {
      // Timeout/rejection is ambiguous: never auto-resend a possibly delivered SMS.
      await delivery.update({
        status: "needs_review",
        updatedAt: FieldValue.serverTimestamp(),
      })
      console.error("Owner SMS needs provider-dashboard review", { appointmentId: snapshot.id })
      return
    }
    await delivery.update({
      status: "accepted",
      updatedAt: FieldValue.serverTimestamp(),
    })
    console.info("PhilSMS accepted owner alert", { appointmentId: snapshot.id })
  } finally {
    inFlight.delete(snapshot.id)
  }
}

const unsubscribe = query.onSnapshot((snapshot) => {
  for (const change of snapshot.docChanges()) {
    if (change.type === "removed") continue
    void processBooking(change.doc).catch(() => {
      // Do not log upstream responses, credentials, customer data, or phone numbers.
      console.error("Owner SMS processing failed; check server configuration and delivery ledger")
      // Supervisor restart replays the query; a claimed send is never automatically repeated.
      unsubscribe()
      process.exit(1)
    })
  }
}, () => {
  console.error("SMS Firestore listener failed; restart worker after checking backend credentials")
  process.exit(1)
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    unsubscribe()
    process.exit(0)
  })
}
console.info("Owner SMS listener connected; awaiting customer bookings")
