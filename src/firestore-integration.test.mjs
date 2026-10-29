import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { billingPlans, billingDeadline, addBillingMonth, manilaDueDate } from "./subscription-access.mjs"
import { normalizeFacebookPageUrl } from "./facebook-page.mjs"
import { normalizeWalkInInput } from "./walk-ins.mjs"
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing"
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocsFromServer,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  runTransaction,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
}
const domainCode = ts.transpileModule(
  readFileSync(new URL("./domain.ts", import.meta.url), "utf8"),
  { compilerOptions },
).outputText
const domain = await import(
  `data:text/javascript;base64,${Buffer.from(domainCode).toString("base64")}`
)
const managerDateCode = ts.transpileModule(
  readFileSync(new URL("./manager-date-edit.ts", import.meta.url), "utf8"), { compilerOptions },
).outputText
const managerDate = await import(`data:text/javascript;base64,${Buffer.from(managerDateCode).toString("base64")}`)
const recordEditCode = ts.transpileModule(
  readFileSync(new URL("./admin-records.ts", import.meta.url), "utf8"), { compilerOptions },
).outputText
const recordEdit = await import(`data:text/javascript;base64,${Buffer.from(recordEditCode).toString("base64")}`)
const firebaseSource = readFileSync(
  new URL("./firebase.ts", import.meta.url),
  "utf8",
)
function compile(start, end) {
  return ts
    .transpileModule(
      firebaseSource.slice(
        firebaseSource.indexOf(start),
        firebaseSource.indexOf(end),
      ),
      { compilerOptions },
    )
    .outputText.replace(/export /g, "")
}
const operations = [
  compile("export async function editAdminShopRecord(", "export async function deleteShopRecord("),
  compile("async function createWalkInQuote(", "export async function editManagerRecordDate("),
  compile("export async function deleteShopRecord(", "export async function claimWalkIn("),
  compile("export async function editManagerRecordDate(", "export async function readAdminShopRecord("),
  compile("export async function saveBusinessSettings(", "export async function createPayrollStatement("),
  compile("export async function submitSubscriptionPayment(", "export async function updateTeamMemberName("),
  compile(
    "export async function createAppointment(",
    "export async function assignAppointmentProvider(",
  ),
  compile(
    "export async function assignAppointmentProvider(",
    "export function subscribeProviderAppointments(",
  ),
  compile(
    "export async function updateAppointmentStatus(",
    "export async function submitAppointmentReview(",
  ),
  compile(
    "export async function checkoutAppointment(",
    "export function subscribeNotifications(",
  ),
  compile(
    "export async function submitFeedback(",
    "export async function markNotificationsRead(",
  ),
].join("\n")

const quoteCleanup = new WeakMap()
function actor(environment, uid, transform = (_, data) => data) {
  const db = environment
    .authenticatedContext(uid, { email: `${uid}@example.test` })
    .firestore()
  const cleanup = quoteCleanup.get(environment) || new Set()
  quoteCleanup.set(environment, cleanup)
  const ui = {
    ...domain,
    TEMPORARY_MANAGER_RECORD_DELETION: true,
    ...managerDate, recordEditFields: recordEdit.recordEditFields, normalizeAdminEdit: recordEdit.normalizeAdminEdit,
    adminRecordTime: recordEdit.adminRecordTime, adminBookingSlots: recordEdit.adminBookingSlots,
    billingPlans, billingDeadline, addBillingMonth, manilaDueDate,
    normalizeFacebookPageUrl, normalizeWalkInInput, getDoc, getDocFromServer, getDocsFromServer, writeBatch,
    deleteDoc: (reference) => {
      const pending = deleteDoc(reference)
      cleanup.add(pending)
      void pending.finally(() => cleanup.delete(pending)).catch(() => {})
      return pending
    },
    db,
    collection,
    doc,
    serverTimestamp,
    Timestamp,
    runTransaction: (_, operation) =>
      runTransaction(db, (transaction) =>
        operation({
          get: (reference) => transaction.get(reference),
          set: (reference, data) =>
            transaction.set(reference, transform(reference, data)),
          update: (reference, data) =>
            transaction.update(reference, transform(reference, data)),
          delete: (reference) => transaction.delete(reference),
        }),
      ),
    currentUser: () => ({ uid }),
    businessId: () => "test-shop",
    shopDoc: (shop, name, id) => doc(db, "shops", shop, name, id),
    shopCollection: (shop, name) => collection(db, "shops", shop, name),
  }
  const methods = new Function(
    "ui",
    `const { ${Object.keys(ui).join(",")} } = ui; ${operations};
    return { createAppointment, assignAppointmentProvider, updateAppointmentStatus, checkoutAppointment,
      submitSubscriptionPayment, approveSubscriptionPayment, manageShopSubscription, saveBusinessSettings,
      submitFeedback, reviewFeedback, editManagerRecordDate, editAdminShopRecord, deleteShopRecord, createPaidWalkIn };`,
  )(ui)
  return { db, ...methods }
}

async function seed(environment) {
  // App cleanup intentionally does not delay payment acknowledgement. Wait for
  // those requests before resetting synthetic fixtures, never by sleeping.
  await Promise.allSettled([...(quoteCleanup.get(environment) || [])])
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const profiles = [
      ["customer", "Customer", "Test Customer"],
      ["manager", "Manager", "Test Manager"],
      ["one", "Service Provider", "Provider One"],
      ["two", "Service Provider", "Provider Two"],
    ]
    for (const [uid, role, name] of profiles) {
      await setDoc(doc(db, "users", uid), {
        uid,
        name,
        email: `${uid}@example.test`,
        role,
        activeShopId: "test-shop",
        shopId: "test-shop",
      })
      await setDoc(doc(db, "shops", "test-shop", "members", uid), {
        uid,
        name,
        role,
        email: `${uid}@example.test`,
      })
      if (role === "Service Provider")
        await setDoc(doc(db, "shops", "test-shop", "team", uid), {
          name,
          role,
          active: true,
        })
    }
    await setDoc(doc(db, "shops", "test-shop"), {
      ownerId: "manager",
      name: "Test Shop",
      managerName: "Test Manager",
      location: "",
      description: "",
      serviceCategories: [],
      logoUrl: "",
      active: true,
      acceptingCustomers: true,
    })
    await setDoc(doc(db, "shops", "test-shop", "services", "facial"), {
      name: "Facial Cleansing",
      category: "Facial",
      amount: 300,
      durationMinutes: 60,
      status: "Active",
    })
    await setDoc(doc(db, "shops", "test-shop", "settings", "business"), {
      name: "Test Shop",
      shopType: "team",
      bookingSchemaVersion: 2,
      timezone: "Asia/Manila",
      open: "09:00",
      close: "17:00",
      openingMinute: 540,
      closingMinute: 1020,
      currency: "PHP",
    })
    await setDoc(doc(db, "shops", "test-shop", "settings", "access"), {
      planId: "professional", status: "Active", manualLocked: false,
      expiresAt: Timestamp.fromDate(new Date("2100-01-01T00:00:00Z")),
      reason: "", updatedBy: "admin", updatedAt: Timestamp.now(),
    })
  })
}

const input = {
  client: "Test Customer",
  customerId: "customer",
  serviceId: "facial",
  providerId: "",
  date: "2099-10-13",
  time: "09:30",
  notes: "",
}
async function bookingId(manager) {
  const snapshot = await getDocs(
    collection(manager.db, "shops", "test-shop", "appointments"),
  )
  assert.equal(snapshot.size, 1)
  return snapshot.docs[0].id
}
const bookingRef = (db, id) => doc(db, "shops", "test-shop", "appointments", id)

// This suite talks only to an explicitly enabled local demo-project emulator.
// Without it, the ordinary test command skips this suite rather than contacting production.
test(
  "Firestore emulator validates actual booking, assignment, and payment transactions",
  {
    skip: !process.env.FIRESTORE_EMULATOR_HOST,
  },
  async (t) => {
    const environment = await initializeTestEnvironment({
      projectId: "demo-smartcut-audit",
      firestore: {
        rules: readFileSync(
          process.env.SMARTCUT_TEST_RULES_PATH || new URL("../firestore.rules", import.meta.url),
          "utf8",
        ),
      },
    })
    try {
      await t.test("multi-service walk-ins require specific providers and support Cash/E-wallet without partial ledgers", async () => {
        await seed(environment)
        const cents = Array.from({ length: 50 }, (_, index) => [19999, 29999, 49999, 90799][index] ?? 1001 + index)
        await environment.withSecurityRulesDisabled(async (context) => {
          for (const [index, price] of cents.entries())
            await setDoc(doc(context.firestore(), "shops", "test-shop", "services", `multi-${index}`), {
              name: `Service ${index}`, amount: price / 100, status: "Active", durationMinutes: 20,
            })
        })
        const manager = actor(environment, "manager")
        for (const count of [1, 3, 4, 5, 6, 10, 25, 50]) {
          for (const providerId of ["one", "two"]) {
            const id = `multi-${count}-${providerId}`
            const serviceIds = Array.from({ length: count }, (_, index) => `multi-${index}`)
            const expected = cents.slice(0, count).reduce((sum, price) => sum + price, 0)
            await assertSucceeds(manager.createPaidWalkIn(id, {
              client: "Multi-service customer", email: "", phone: "", serviceIds,
              requestedProviderId: providerId, method: count % 2 ? "Cash" : "E-wallet", quotedTotal: expected / 100,
            }))
            const visit = (await getDoc(doc(manager.db, "shops", "test-shop", "walkins", id))).data()
            const payment = (await getDoc(doc(manager.db, "shops", "test-shop", "payments", id))).data()
            const sale = (await getDoc(doc(manager.db, "shops", "test-shop", "sales", id))).data()
            assert.equal(visit.serviceIds.length, count)
            assert.equal(visit.serviceNames.length, count)
            assert.equal(visit.amountCents, expected)
            assert.equal(visit.providerId, providerId)
            assert.deepEqual(payment, sale)
            if (count === 4) assert.equal(visit.amount, 1907.96)
            // Retrying the stable form ID does not duplicate payment.
            await assertSucceeds(manager.createPaidWalkIn(id, {
              client: "Multi-service customer", email: "", phone: "", serviceIds,
              requestedProviderId: providerId, method: count % 2 ? "Cash" : "E-wallet", quotedTotal: expected / 100,
            }))
          }
        }
        const six = {
          client: "Six services", email: "", phone: "",
          serviceIds: Array.from({ length: 6 }, (_, index) => `multi-${index}`),
          requestedProviderId: "manager", method: "Cash",
          quotedTotal: cents.slice(0, 6).reduce((sum, price) => sum + price, 0) / 100,
        }
        await environment.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "shops", "test-shop", "team", "manager"), {
            name: "Test Manager", role: "Service Provider", active: true,
          })
          await setDoc(doc(context.firestore(), "shops", "test-shop", "settings", "business"), {
            shopType: "solo", managerProviderId: "manager",
          }, { merge: true })
        })
        await assertSucceeds(manager.createPaidWalkIn("solo-six", six))
        await assert.rejects(manager.createPaidWalkIn("solo-unassigned", { ...six, requestedProviderId: "" }), /specific active service provider/)
        await environment.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "users", "admin"), { role: "Administrator", name: "Global Admin" })
          await setDoc(doc(context.firestore(), "shops", "test-shop", "settings", "access"), { manualLocked: true }, { merge: true })
        })
        await assertSucceeds(actor(environment, "admin").createPaidWalkIn("admin-six-locked", six))
      })
      await t.test("quote rules reject forged prices, unauthorized users and partial payment writes", async () => {
        await seed(environment)
        const quote = (walkInId) => ({
          walkInId, previousQuoteId: "", serviceId: "facial",
          serviceIds: ["facial"], serviceNames: ["Facial Cleansing"], serviceAmounts: [300],
          amountCents: 30000, createdBy: "manager", createdAt: serverTimestamp(), quotedAt: serverTimestamp(),
        })
        const manager = actor(environment, "manager")
        for (const change of [
          { amountCents: 1 }, { serviceAmounts: [1] }, { serviceNames: ["Forged"] },
          { serviceIds: ["facial", "facial"] }, { previousQuoteId: "missing" },
          { quotedAt: Timestamp.fromDate(new Date("2000-01-01")) },
        ])
          await assertFails(setDoc(doc(manager.db, "shops", "test-shop", "walkInQuotes", "forged"), { ...quote("forged"), ...change }))
        for (const uid of ["customer", "one"])
          await assertFails(setDoc(doc(actor(environment, uid).db, "shops", "test-shop", "walkInQuotes", uid), {
            ...quote(uid), createdBy: uid,
          }))
        const normal = { client: "Test Client", email: "", phone: "", serviceIds: ["facial"],
          requestedProviderId: "one", method: "Cash", quotedTotal: 300 }
        const tampered = actor(environment, "manager", (reference, data) => reference.path.includes("/walkins/")
          ? { ...data, amount: 1, amountCents: 100 } : data)
        await assertFails(tampered.createPaidWalkIn("tampered", normal))
        for (const name of ["walkins", "sales", "payments"])
          assert.equal((await getDoc(doc(manager.db, "shops", "test-shop", name, "tampered"))).exists(), false)
        // A valid quote cannot authorize a lone receipt without its paired visit/ledger.
        await assertFails(setDoc(doc(manager.db, "shops", "test-shop", "payments", "partial"), {
          type: "Walk-in", walkInId: "partial", client: "Test Client", customerId: "",
          service: "Facial Cleansing", serviceIds: ["facial"], providerId: "one", provider: "Provider One",
          amount: 300, amountCents: 30000, method: "Cash", status: "Paid", currency: "PHP",
          date: "2026-10-21", createdBy: "manager", createdAt: serverTimestamp(),
        }))
      })
      await t.test("rules reject blank walk-in providers and Card even when an old client bypasses form validation", async () => {
        await seed(environment)
        const normal = { client: "Test Client", email: "", phone: "", serviceIds: ["facial"],
          requestedProviderId: "one", method: "Cash", quotedTotal: 300 }
        const manager = actor(environment, "manager")
        await assert.rejects(manager.createPaidWalkIn("missing-provider", { ...normal, requestedProviderId: "" }), /specific active service provider/)
        await assert.rejects(manager.createPaidWalkIn("card-input", { ...normal, method: "Card" }), /Cash or E-wallet/)
        for (const mode of ["unassigned", "card"]) {
          const forged = actor(environment, "manager", (reference, data) => {
            if (!["walkins", "payments", "sales"].includes(reference.path.split("/").at(-2))) return data
            return mode === "card" ? { ...data, method: "Card" }
              : { ...data, providerId: "", provider: "Any available",
                ...(reference.path.includes("/walkins/") ? { requestedProviderId: "" } : {}) }
          })
          await assertFails(forged.createPaidWalkIn(mode, normal))
          for (const name of ["walkins", "sales", "payments"])
            assert.equal((await getDoc(doc(manager.db, "shops", "test-shop", name, mode))).exists(), false)
        }
      })
      await t.test("only Administrators and the shop owner can edit details; dates and times stay immutable", async () => {
        await seed(environment)
        await environment.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore()
          await setDoc(doc(db, "users", "admin"), { role: "Administrator", name: "Global Admin" })
          await setDoc(doc(db, "users", "other-manager"), { role: "Manager", name: "Not Owner" })
          await setDoc(doc(db, "shops", "test-shop", "members", "other-manager"), { role: "Manager", name: "Not Owner" })
        })
        const manager = actor(environment, "manager")
        const admin = actor(environment, "admin")
        const other = actor(environment, "other-manager")
        await manager.createPaidWalkIn("protected-record", { client: "Protected Client", email: "", phone: "",
          serviceIds: ["facial"], requestedProviderId: "one", method: "Cash", quotedTotal: 300 })
        const visitRef = doc(manager.db, "shops", "test-shop", "walkins", "protected-record")
        const original = { ...(await getDoc(visitRef)).data(), id: "protected-record" }
        const lines = [{ id: "facial", name: "Facial Cleansing", amount: "300" }]
        for (const api of [manager, admin]) {
          await assert.rejects(api.editManagerRecordDate("test-shop", "walkins", original, "2026-10-12"), /disabled/)
          await assert.rejects(api.editAdminShopRecord("test-shop", "walkins", original, { ...original, lines, date: "2026-10-12" }), /read-only/)
          for (const change of [{ date: "2026-10-12" }, { time: "18:14" }, { durationMinutes: 45 }]) {
            const write = writeBatch(api.db)
            for (const name of ["walkins", "sales", "payments"])
              write.update(doc(api.db, "shops", "test-shop", name, original.id), {
                ...change, editedByAdmin: api === manager ? "manager" : "admin",
                adminEditedAt: serverTimestamp(), updatedAt: serverTimestamp(),
              })
            await assertFails(write.commit())
          }
        }
        await assert.rejects(other.editAdminShopRecord("test-shop", "walkins", original, { ...original, lines, client: "Forged name" }), /shop's owner/)
        const forged = writeBatch(other.db)
        forged.update(doc(other.db, "shops", "test-shop", "walkins", original.id), {
          client: "Forged name", editedByAdmin: "other-manager", adminEditedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        await assertFails(forged.commit())
        for (const api of [manager, admin]) {
          const current = { ...(await getDoc(visitRef)).data(), id: original.id }
          await assertSucceeds(api.editAdminShopRecord("test-shop", "walkins", current, { ...current, lines, client: api === manager ? "Owner edit" : "Admin edit" }))
        }
        for (const name of ["walkins", "sales", "payments"]) {
          const saved = (await getDoc(doc(admin.db, "shops", "test-shop", name, original.id))).data()
          assert.equal(saved.client, "Admin edit")
          assert.equal(saved.date, original.date)
          assert.equal("time" in saved, false)
        }
      })
      await t.test("temporary record deletion denies partial/foreign writes and atomically removes paid booking mirrors and slots", async () => {
        await seed(environment)
        const customer = actor(environment, "customer")
        const manager = actor(environment, "manager")
        const provider = actor(environment, "one")
        await customer.createAppointment({ ...input, providerId: "one" }, ["one", "two"])
        const id = await bookingId(manager)
        await manager.updateAppointmentStatus(id, "Accepted")
        await manager.updateAppointmentStatus(id, "In Progress")
        await manager.updateAppointmentStatus(id, "Completed")
        await manager.checkoutAppointment(id, "Cash")
        const original = { ...(await getDoc(bookingRef(manager.db, id))).data(), id }
        const partial = writeBatch(manager.db)
        partial.delete(bookingRef(manager.db, id))
        await assertFails(partial.commit())
        const receiptOnly = writeBatch(manager.db)
        receiptOnly.delete(doc(manager.db, "shops", "test-shop", "payments", id))
        await assertFails(receiptOnly.commit())
        for (const denied of [customer, provider])
          await assert.rejects(denied.deleteShopRecord("test-shop", "appointments", original), /authorized Manager|permission|PERMISSION_DENIED/i)
        await assertSucceeds(manager.deleteShopRecord("test-shop", "appointments", original))
        for (const name of ["appointments", "sales", "payments"])
          assert.equal((await getDoc(doc(manager.db, "shops", "test-shop", name, id))).exists(), false)
        const calendar = (await getDoc(doc(manager.db, "shops", "test-shop", "appointmentSchedules", original.scheduleId))).data()
        assert.equal(Object.values(calendar.slots).includes(id), false)
      })
      await t.test("owner booking-detail corrections preserve date, time, duration, and holds", async () => {
        await seed(environment)
        const customer = actor(environment, "customer")
        const manager = actor(environment, "manager")
        await assertSucceeds(customer.createAppointment({ ...input, providerId: "one" }, ["one", "two"]))
        const id = await bookingId(manager)
        const original = { ...(await getDoc(bookingRef(manager.db, id))).data(), id }
        await assertSucceeds(manager.editAdminShopRecord("test-shop", "appointments", original, { ...original, notes: "Owner correction" }))
        const saved = (await getDoc(bookingRef(manager.db, id))).data()
        for (const key of ["date", "time", "durationMinutes", "startMinute", "slotKeys", "startsAt"])
          assert.deepEqual(saved[key], original[key])
        assert.equal(saved.notes, "Owner correction")
        const calendar = (await getDoc(doc(manager.db, "shops", "test-shop", "appointmentSchedules", original.scheduleId))).data()
        for (const key of original.slotKeys) assert.equal(calendar.slots[key], id)
        for (const change of [{ date: "2026-10-11" }, { startMinute: saved.startMinute + 15 }, { durationMinutes: 20 }]) {
          const write = writeBatch(manager.db)
          write.update(bookingRef(manager.db, id), { ...change, editedByAdmin: "manager", adminEditedAt: serverTimestamp(), updatedAt: serverTimestamp() })
          await assertFails(write.commit())
        }
      })
      await t.test("feedback is private to its sender and global Administrators, including locked shops", async () => {
        await seed(environment)
        await environment.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore()
          await setDoc(doc(db, "users", "admin"), { uid: "admin", name: "Test Admin", role: "Administrator" })
          await setDoc(doc(db, "shops", "test-shop", "settings", "access"), {
            status: "Active", manualLocked: true,
            expiresAt: Timestamp.fromDate(new Date("2100-01-01T00:00:00Z")),
          })
        })
        const admin = actor(environment, "admin")
        const input = { subject: "Screen issue", message: "The appointment screen will not load.", category: "Bug" }
        for (const uid of ["customer", "manager", "one"]) {
          const sender = actor(environment, uid)
          await assertSucceeds(sender.submitFeedback(input))
          await assertSucceeds(sender.submitFeedback({ ...input, shopId: "test-shop" }))
          const own = await assertSucceeds(getDocs(query(collection(sender.db, "feedback"), where("senderId", "==", uid))))
          assert.equal(own.size, 2)
          await assertFails(getDocs(collection(sender.db, "feedback")))
        }
        const inbox = await assertSucceeds(getDocs(collection(admin.db, "feedback")))
        assert.equal(inbox.size, 6)
        const customerReport = inbox.docs.find((record) => record.data().senderId === "customer")
        const customer = actor(environment, "customer")
        const manager = actor(environment, "manager")
        await assertSucceeds(getDoc(doc(customer.db, "feedback", customerReport.id)))
        await assertFails(getDoc(doc(manager.db, "feedback", customerReport.id)))
        await assertSucceeds(admin.reviewFeedback(customerReport.id, "Reviewed"))
        assert.equal((await getDoc(doc(customer.db, "feedback", customerReport.id))).data().status, "Reviewed")
        await assertSucceeds(admin.reviewFeedback(customerReport.id, "New"))
        const data = customerReport.data()
        await assertFails(setDoc(doc(customer.db, "feedback", "forged"), {
          ...data, senderId: "manager", createdAt: serverTimestamp(),
        }))
        await assertFails(setDoc(doc(customer.db, "feedback", "forged-shop"), {
          ...data, shopId: "unrelated-shop", shopName: "Unrelated Shop", createdAt: serverTimestamp(),
        }))
        await assertFails(setDoc(doc(customer.db, "feedback", customerReport.id), {
          ...data, status: "Reviewed", reviewedBy: "customer", updatedAt: serverTimestamp(),
        }))
        await assertFails(setDoc(doc(admin.db, "feedback", customerReport.id), {
          ...data, message: "Administrator cannot rewrite the report.", updatedAt: serverTimestamp(),
        }))
        const guest = environment.unauthenticatedContext().firestore()
        await assertFails(getDocs(collection(guest, "feedback")))
      })
      await t.test(
        "customer can reserve a 60-minute any-provider booking, including a new calendar",
        async () => {
          await seed(environment)
          const customer = actor(environment, "customer")
          const manager = actor(environment, "manager")
          await assertSucceeds(
            customer.createAppointment(input, ["one", "two"]),
          )
          const id = await bookingId(manager)
          const snapshot = await getDoc(bookingRef(customer.db, id))
          assert.equal(snapshot.data().providerId, "")
          assert.equal(snapshot.data().reservedProviderId, "one")
          assert.equal(snapshot.data().paymentStatus, "Unpaid")
        },
      )
      await t.test(
        "named provider reservations retain capacity and a third overlapping booking is rejected",
        async () => {
          await seed(environment)
          const customer = actor(environment, "customer")
          await assertSucceeds(
            customer.createAppointment({ ...input, providerId: "one" }),
          )
          await assertSucceeds(
            customer.createAppointment(input, ["one", "two"]),
          )
          await assert.rejects(
            customer.createAppointment(input, ["one", "two"]),
            /no capacity/,
          )
        },
      )
      await t.test(
        "management can book for a linked customer and create that customer's notification",
        async () => {
          for (const duration of [60, 240]) {
            await seed(environment)
            await environment.withSecurityRulesDisabled(async (context) => {
              await setDoc(
                doc(
                  context.firestore(),
                  "shops",
                  "test-shop",
                  "services",
                  "facial",
                ),
                {
                  name: "Facial Cleansing",
                  amount: 300,
                  durationMinutes: duration,
                  status: "Active",
                },
              )
            })
            const manager = actor(environment, "manager")
            await assertSucceeds(
              manager.createAppointment(input, ["one", "two"]),
            )
            const notifications = await getDocs(
              query(
                collection(
                  actor(environment, "customer").db,
                  "shops",
                  "test-shop",
                  "notifications",
                ),
                where("userId", "==", "customer"),
              ),
            )
            assert.equal(notifications.size, 1)
          }
        },
      )
      await t.test(
        "partial blocks and the maximum 240-minute service remain within the rules budget",
        async (durationTests) => {
          for (const duration of [1, 20, 45, 240]) {
            await durationTests.test(
              `${duration}-minute booking and assignment`,
              async () => {
                await seed(environment)
                await environment.withSecurityRulesDisabled(async (context) => {
                  await setDoc(
                    doc(
                      context.firestore(),
                      "shops",
                      "test-shop",
                      "services",
                      "facial",
                    ),
                    {
                      name: "Facial Cleansing",
                      amount: 300,
                      durationMinutes: duration,
                      status: "Active",
                    },
                  )
                })
                const customer = actor(environment, "customer")
                await assertSucceeds(
                  customer.createAppointment(input, ["one", "two"]),
                )
                const manager = actor(environment, "manager")
                const id = await bookingId(manager)
                await assertSucceeds(
                  manager.updateAppointmentStatus(id, "Accepted"),
                )
                await assertSucceeds(
                  manager.assignAppointmentProvider(id, "two"),
                )
              },
            )
          }
        },
      )
      await t.test(
        "malicious price changes and foreign calendar-slot values are rejected atomically",
        async () => {
          for (const mutation of [
            "price",
            "slot-owner",
            "slot-gap",
            "slot-comma",
            "slot-regex",
            "slot-duplicate",
            "missing-field",
          ]) {
            await seed(environment)
            const injectedKeys = ({
              "slot-comma": ["570,585", "600", "615", "630"],
              "slot-regex": ["570", "585", "600", ".*"],
              "slot-duplicate": ["570", "585", "585", "615"],
            })[mutation]
            const customer = actor(
              environment,
              "customer",
              (reference, data) => {
                if (injectedKeys && reference.path.includes("/appointments/"))
                  return { ...data, slotKeys: injectedKeys }
                if (injectedKeys && reference.path.includes("/appointmentSchedules/"))
                  return { ...data, slots: Object.fromEntries(injectedKeys.map((key) => [key, data.appointmentId])) }
                if (
                  reference.path.includes("/appointments/") &&
                  mutation === "price"
                )
                  return { ...data, amount: 1 }
                if (
                  reference.path.includes("/appointments/") &&
                  mutation === "slot-gap"
                )
                  return { ...data, slotKeys: ["570", "600", "615", "630"] }
                if (
                  reference.path.includes("/appointments/") &&
                  mutation === "missing-field"
                ) {
                  const value = { ...data }
                  delete value.notes
                  return value
                }
                if (reference.path.includes("/appointmentSchedules/")) {
                  const slots = { ...data.slots }
                  if (mutation === "slot-owner") slots["570"] = "someone-else"
                  if (mutation === "slot-gap") {
                    delete slots["585"]
                    slots["630"] = data.appointmentId
                  }
                  return { ...data, slots }
                }
                return data
              },
            )
            await assertFails(customer.createAppointment(input, ["one", "two"]))
            assert.equal(
              (
                await getDocs(
                  collection(
                    actor(environment, "manager").db,
                    "shops",
                    "test-shop",
                    "appointments",
                  ),
                )
              ).size,
              0,
            )
          }
        },
      )
      await t.test(
        "manager approval, provider claim, start, completion, and private payment work together",
        async () => {
          await seed(environment)
          const customer = actor(environment, "customer")
          const manager = actor(environment, "manager")
          const one = actor(environment, "one")
          const two = actor(environment, "two")
          await assertSucceeds(
            customer.createAppointment(input, ["one", "two"]),
          )
          const id = await bookingId(manager)
          const pool = query(
            collection(one.db, "shops", "test-shop", "appointments"),
            where("providerId", "==", ""),
            where("status", "==", "Accepted"),
            where("providerPreference", "==", "any"),
          )
          await assertSucceeds(getDocs(pool))
          await assertSucceeds(manager.updateAppointmentStatus(id, "Accepted"))
          assert.equal((await getDocs(pool)).size, 1)
          const heldCalendar = doc(
            one.db,
            "shops",
            "test-shop",
            "appointmentSchedules",
            `one_${input.date}`,
          )
          const held = await getDoc(heldCalendar)
          await assertFails(
            setDoc(heldCalendar, {
              ...held.data(),
              slots: { ...held.data().slots, 570: "not-the-owner" },
              updatedAt: serverTimestamp(),
            }),
          )
          await assertSucceeds(two.assignAppointmentProvider(id, "two"))
          await assertFails(getDoc(bookingRef(one.db, id)))
          await assertSucceeds(two.updateAppointmentStatus(id, "In Progress"))
          await assertSucceeds(two.updateAppointmentStatus(id, "Completed"))
          await assertSucceeds(two.checkoutAppointment(id, "Cash"))
          await assertFails(
            getDoc(doc(two.db, "shops", "test-shop", "payments", id)),
          )
          await assertFails(
            getDocs(collection(two.db, "shops", "test-shop", "sales")),
          )
          assert.equal(
            (await getDoc(bookingRef(customer.db, id))).data().paymentStatus,
            "Paid",
          )
          const payment = await getDoc(
            doc(manager.db, "shops", "test-shop", "payments", id),
          )
          assert.equal(payment.data().amount, 300)
          assert.equal(payment.data().providerId, "two")
        },
      )
      await t.test(
        "two concurrent provider claims produce exactly one assignment",
        async () => {
          await seed(environment)
          const manager = actor(environment, "manager")
          await actor(environment, "customer").createAppointment(input, [
            "one",
            "two",
          ])
          const id = await bookingId(manager)
          await manager.updateAppointmentStatus(id, "Accepted")
          const outcomes = await Promise.allSettled([
            actor(environment, "one").assignAppointmentProvider(id, "one"),
            actor(environment, "two").assignAppointmentProvider(id, "two"),
          ])
          assert.equal(
            outcomes.filter((outcome) => outcome.status === "fulfilled").length,
            1,
          )
          assert.ok(
            ["one", "two"].includes(
              (await getDoc(bookingRef(manager.db, id))).data().providerId,
            ),
          )
        },
      )
      await t.test(
        "rejection and cancellation release the reserved calendar blocks",
        async () => {
          for (const status of ["Rejected", "Cancelled"]) {
            await seed(environment)
            const manager = actor(environment, "manager")
            await actor(environment, "customer").createAppointment(input, [
              "one",
              "two",
            ])
            const id = await bookingId(manager)
            await assertSucceeds(manager.updateAppointmentStatus(id, status))
            const calendar = await getDoc(
              doc(
                manager.db,
                "shops",
                "test-shop",
                "appointmentSchedules",
                `one_${input.date}`,
              ),
            )
            assert.deepEqual(calendar.data().slots, {})
          }
        },
      )
      await t.test(
        "global administrators retain management access without a shop membership",
        async () => {
          await seed(environment)
          await environment.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "users", "admin"), {
              uid: "admin",
              role: "Administrator",
              name: "Test Admin",
              email: "admin@example.test",
              activeShopId: "test-shop",
            })
          })
          const admin = actor(environment, "admin")
          await assertSucceeds(
            admin.createAppointment({ ...input, customerId: "" }, [
              "one",
              "two",
            ]),
          )
          const id = await bookingId(admin)
          await assertSucceeds(admin.updateAppointmentStatus(id, "Accepted"))
          await assertSucceeds(admin.assignAppointmentProvider(id, "two"))
          await assertSucceeds(admin.updateAppointmentStatus(id, "In Progress"))
          await assertSucceeds(admin.updateAppointmentStatus(id, "Completed"))
          await assertSucceeds(admin.checkoutAppointment(id, "Cash"))
        },
      )
      await t.test("manager barber settings and customer booking acceptance use authorized atomic writes", async () => {
        await seed(environment)
        const manager = actor(environment, "manager")
        const settings = { name: "Test Shop", shopType: "team", managerWorksAsBarber: true,
          barberAvailable: true, open: "09:00", close: "17:00", openingMinute: 540, closingMinute: 1020 }
        await assertSucceeds(manager.saveBusinessSettings(settings))
        assert.equal((await getDoc(doc(manager.db, "shops", "test-shop", "team", "manager"))).data().active, true)
        await assertSucceeds(manager.saveBusinessSettings({ ...settings, barberAvailable: false }))
        await assertSucceeds(manager.saveBusinessSettings(settings))
        const customer = actor(environment, "customer")
        await assertSucceeds(customer.createAppointment({ ...input, providerId: "manager" }))
        const id = await bookingId(manager)
        await assertSucceeds(manager.updateAppointmentStatus(id, "Accepted"))
        const notifications = await getDocs(query(collection(customer.db, "shops", "test-shop", "notifications"), where("userId", "==", "customer")))
        assert.ok(notifications.docs.some((item) => item.data().title === "Appointment Accepted"))
        await assertSucceeds(manager.updateAppointmentStatus(id, "In Progress"))
        await assertSucceeds(manager.updateAppointmentStatus(id, "Completed"))
        await assertSucceeds(manager.checkoutAppointment(id, "Cash"))
      })
      await t.test("administrator membership can publish its own barber profile without changing its administrator role", async () => {
        await seed(environment)
        await environment.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "users", "admin"), { uid: "admin", name: "Test Admin", role: "Administrator" })
          await setDoc(doc(context.firestore(), "shops", "test-shop", "members", "admin"), { uid: "admin", name: "Test Admin", role: "Administrator" })
        })
        const admin = actor(environment, "admin")
        const settings = { name: "Test Shop", shopType: "team", managerWorksAsBarber: true,
          barberAvailable: true, open: "09:00", close: "17:00", openingMinute: 540, closingMinute: 1020 }
        await assertSucceeds(admin.saveBusinessSettings(settings))
        await assertSucceeds(admin.saveBusinessSettings({ ...settings, barberAvailable: false }))
        assert.equal((await getDoc(doc(admin.db, "shops", "test-shop", "members", "admin"))).data().role, "Administrator")
      })
      await t.test("paired notifications cannot authorize an unassigned provider to accept a booking", async () => {
        await seed(environment)
        const customer = actor(environment, "customer")
        const manager = actor(environment, "manager")
        await assertSucceeds(customer.createAppointment({ ...input, providerId: "one" }))
        const id = await bookingId(manager)
        const provider = actor(environment, "two")
        const batch = writeBatch(provider.db)
        batch.update(bookingRef(provider.db, id), { status: "Accepted", updatedAt: serverTimestamp(), acceptedAt: serverTimestamp() })
        batch.set(doc(collection(provider.db, "shops", "test-shop", "notifications")), {
          userId: "customer", title: "Appointment Accepted", message: "Not authorized",
          appointmentId: id, read: false, createdAt: serverTimestamp(),
        })
        await assertFails(batch.commit())
      })
      await t.test("locked managers retain isolated billing reads and submission; only admin approval restores operations", async () => {
        await seed(environment)
        await environment.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "users", "admin"), { uid: "admin", name: "Test Admin", role: "Administrator" })
          await setDoc(doc(context.firestore(), "shops", "test-shop", "settings", "access"), {
            planId: "professional", status: "Locked", manualLocked: false, reason: "",
            expiresAt: Timestamp.fromDate(new Date("2000-01-01T00:00:00Z")),
          })
        })
        const manager = actor(environment, "manager")
        const admin = actor(environment, "admin")
        for (const id of ["access", "business", "subscription"])
          await assertSucceeds(getDoc(doc(manager.db, "shops", "test-shop", "settings", id)))
        await assertFails(getDocs(collection(manager.db, "shops", "test-shop", "settings")))
        await assertFails(getDoc(doc(actor(environment, "one").db, "shops", "test-shop", "settings", "subscription")))
        await assertFails(getDoc(doc(manager.db, "shops", "another-shop", "settings", "subscription")))
        await assertSucceeds(manager.submitSubscriptionPayment("professional", "BILLTEST123", {
          imageUrl: "https://res.cloudinary.com/dijbiwcbo/image/upload/test.png", imagePublicId: "test",
        }))
        await assertSucceeds(getDocs(collection(manager.db, "shops", "test-shop", "subscriptionPaymentRequests")))
        await assert.rejects(manager.manageShopSubscription("business", "2099-12-12", false, ""), /Administrator/)
        await assert.rejects(manager.approveSubscriptionPayment("BILLTEST123"), /permission|Administrator/i)
        await assertFails(setDoc(doc(manager.db, "shops", "test-shop", "settings", "subscription"), {
          status: "Active", planId: "business", currentPeriodEnd: Timestamp.fromDate(new Date("2099-12-12")),
        }))
        await assertSucceeds(admin.approveSubscriptionPayment("BILLTEST123"))
        await assertSucceeds(getDocs(collection(manager.db, "shops", "test-shop", "appointments")))
        await assertSucceeds(admin.manageShopSubscription("professional", "2099-12-12", true, "Requirements"))
        await assertSucceeds(getDoc(doc(manager.db, "shops", "test-shop", "settings", "subscription")))
        await assertFails(getDocs(collection(manager.db, "shops", "test-shop", "appointments")))
      })
      await t.test("expired and manually locked licenses deny staff access but preserve administrator control and customer history", async () => {
        await seed(environment)
        const customer = actor(environment, "customer")
        const manager = actor(environment, "manager")
        await assertSucceeds(customer.createAppointment({ ...input, providerId: "one" }))
        const id = await bookingId(manager)
        await environment.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "users", "admin"), { uid: "admin", name: "Test Admin", role: "Administrator" })
          await setDoc(doc(context.firestore(), "shops", "test-shop", "settings", "access"), {
            planId: "professional", status: "Active", manualLocked: false, reason: "",
            expiresAt: Timestamp.fromDate(new Date("2000-01-01T00:00:00Z")),
          })
        })
        const admin = actor(environment, "admin")
        await assertFails(getDoc(bookingRef(manager.db, id)))
        await assertFails(getDoc(bookingRef(actor(environment, "one").db, id)))
        await assertSucceeds(getDoc(bookingRef(customer.db, id)))
        await assertSucceeds(getDoc(bookingRef(admin.db, id)))
        await assertFails(customer.createAppointment({ ...input, time: "15:00", providerId: "one" }))
        await assertSucceeds(getDoc(doc(manager.db, "shops", "test-shop", "settings", "subscription")))
        await environment.withSecurityRulesDisabled(async (context) => {
          await setDoc(doc(context.firestore(), "shops", "test-shop", "settings", "access"), {
            planId: "professional", status: "Active", manualLocked: true, reason: "Requirements not met",
            expiresAt: Timestamp.fromDate(new Date("2100-01-01T00:00:00Z")),
          })
        })
        await assertFails(getDoc(bookingRef(manager.db, id)))
        await assertSucceeds(getDoc(bookingRef(admin.db, id)))
      })
    } finally {
      await Promise.allSettled([...(quoteCleanup.get(environment) || [])])
      await environment.cleanup()
    }
  },
)
