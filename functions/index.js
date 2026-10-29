import { applicationDefault, initializeApp } from "firebase-admin/app"
import { createHash } from "node:crypto"
import { getAuth } from "firebase-admin/auth"
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore"
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https"
import { productionHosts, productionKey, developmentKey, validateCaptchaProperties } from "./captcha.js"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore"
import { error as logError, info as logInfo } from "firebase-functions/logger"
import { workspaceLicenseActive } from "./license-access.js"

initializeApp()

const db = getFirestore()
const region = "asia-southeast1"

const captchaCredential = applicationDefault()

// Public endpoint: verification happens before Firebase Authentication.
export const verifyCaptcha = onRequest({ region, cors: true, invoker: "public" }, async (request, response) => {
  const fail = (status, reason) => {
    logError("CAPTCHA verification rejected", { status, reason })
    return response.status(status).json({ success: false, reason })
  }
  response.set("Cache-Control", "no-store")
  response.type("application/json")
  const development = process.env.CAPTCHA_DEBUG === "true"
  if (development) logInfo("CAPTCHA request", {
    method: request.method, path: request.path,
    tokenExists: typeof request.body?.token === "string" && !!request.body.token,
  })
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED: use POST")
  let origin
  try {
    origin = new URL(request.get("origin"))
  } catch {
    return fail(400, "DOMAIN_MISMATCH: request Origin is missing or invalid")
  }
  const hostname = origin.hostname.toLowerCase()
  const production = productionHosts.includes(hostname)
  const developmentHosts = ["localhost", "127.0.0.1", ...(process.env.CAPTCHA_DEV_HOSTNAMES || "").split(",").map(host => host.trim().toLowerCase()).filter(Boolean)]
  if ((!production && !developmentHosts.includes(hostname)) ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(hostname)))) {
    return fail(400, `DOMAIN_MISMATCH: ${hostname} is not in CAPTCHA_DEV_HOSTNAMES or the production allowlist`)
  }
  const token = request.body?.token
  if (typeof token !== "string" || !token.trim()) return fail(400, "MISSING: complete the CAPTCHA")
  if (token.length > 8192) return fail(400, "INVALID_TOKEN: token is too long")
  const siteKey = production ? productionKey : developmentKey
  if (request.body?.siteKey !== siteKey) return fail(400, "KEY_MISMATCH: site key does not match request hostname")
  try {
    const credential = await captchaCredential.getAccessToken()
    const result = await fetch("https://recaptchaenterprise.googleapis.com/v1/projects/smartcutpre/assessments", {
      method: "POST",
      headers: { Authorization: `Bearer ${credential.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ event: { token, siteKey } }),
      signal: AbortSignal.timeout(10000),
    })
    const assessment = await result.json()
    if (development) logInfo("CAPTCHA Google response (safe fields only)", {
      status: result.status,
      tokenProperties: assessment.tokenProperties,
      errorStatus: assessment.error?.status,
      // Do not log the full assessment: event contains the token.
    })
    if (!result.ok) {
      const detail = assessment.error
      logError("CAPTCHA Google API error", { status: result.status, errorMessage: detail?.message })
      return fail(500, "CAPTCHA verification service error")
    }
    const reason = validateCaptchaProperties(assessment.tokenProperties, hostname)
    if (reason) return fail(400, reason)
    const hash = createHash("sha256").update(token).digest("hex")
    try {
      await db.doc(`loginCaptchaTokens/${hash}`).create({ expiresAt: Timestamp.fromMillis(Date.now() + 300000) })
    } catch (error) {
      if (error.code === 6 || error.code === "already-exists") return fail(400, "DUPE: CAPTCHA already used")
      throw error
    }
    return response.json({ success: true })
  } catch (error) {
    // Never log request bodies, tokens, credentials, or authorization headers.
    logError("CAPTCHA verification service error", { errorMessage: error.message, code: error.code })
    return fail(500, "CAPTCHA verification service error")
  }
})

export const notifyManagersOfBooking = onDocumentCreated({
  document: "shops/{shopId}/appointments/{appointmentId}",
  region,
  retry: true,
}, async (event) => {
  const booking = event.data?.data()
  if (!booking?.customerId || booking.createdBy !== booking.customerId || booking.status !== "Pending") return
  const { shopId, appointmentId } = event.params
  const managers = await db.collection(`shops/${shopId}/members`).where("role", "==", "Manager").get()
  await Promise.all(managers.docs.map(async (manager) => {
    const notification = db.doc(`shops/${shopId}/notifications/booking_${appointmentId}_${manager.id}`)
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(notification)).exists) return
      transaction.create(notification, {
        userId: manager.id,
        type: "appointment-booked",
        title: "New appointment request",
        message: `${booking.client} requested ${booking.service} on ${booking.date} at ${booking.time}${booking.provider ? ` with ${booking.provider}` : ""}. Review this booking in Appointments.`,
        appointmentId,
        customerName: booking.client,
        service: booking.service,
        date: booking.date,
        time: booking.time,
        provider: booking.provider || "",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
  }))
})

const plans = Object.freeze({
  starter: {
    name: "Starter",
    amount: 99,
  },
  professional: {
    name: "Professional",
    amount: 399,
  },
  business: {
    name: "Business",
    amount: 599,
  },
})

function addBillingMonth(date) {
  const manilaOffset = 8 * 60 * 60 * 1000
  const next = new Date(date.getTime() + manilaOffset)
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  next.setUTCDate(Math.min(day, lastDay))
  return new Date(next.getTime() - manilaOffset)
}

function subscriptionPeriodEnd(data) {
  const end = data?.currentPeriodEnd?.toDate?.()
  if (end instanceof Date && Number.isFinite(end.getTime())) return end
  const startedAt = data?.trialStartedAt?.toDate?.()
  return startedAt instanceof Date && Number.isFinite(startedAt.getTime())
    ? new Date(startedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    : undefined
}

async function requireManager(request, allowLocked = false) {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Sign in before managing your shop.")

  const shopId = String(request.data?.shopId || "")
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(shopId))
    throw new HttpsError("invalid-argument", "Choose a valid shop workspace.")
  const memberRef = db.doc(`shops/${shopId}/members/${request.auth.uid}`)
  const [identity, profile] = await Promise.all([
    db.doc(`users/${request.auth.uid}`).get(), memberRef.get(),
  ])
  if (identity.data()?.role === "Administrator")
    return { ref: memberRef, data: () => identity.data() }
  if (!["Administrator", "Manager"].includes(profile.data()?.role))
    throw new HttpsError(
      "permission-denied",
      "Only an Administrator or Manager can manage this shop.",
    )
  if (!allowLocked) {
    const access = await db.doc(`shops/${shopId}/settings/access`).get()
    if (!workspaceLicenseActive(access.data()))
      throw new HttpsError("permission-denied", "This shop's subscription is expired or its workspace is locked.")
  }
  return profile
}

export const addExistingStaff = onCall({ region }, async (request) => {
  try {
    const actor = await requireManager(request)
    const shopId = actor.ref.parent.parent.id
    const email = String(request.data?.email || "").trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpsError("invalid-argument", "Enter a valid staff email address.")
    let staff
    try {
      staff = await getAuth().getUserByEmail(email)
    } catch (error) {
      if (error.code === "auth/user-not-found")
        throw new HttpsError("not-found", "No eligible Service Provider account was found for this email.")
      throw error
    }
    if (staff.disabled || staff.uid === request.auth.uid)
      throw new HttpsError("failed-precondition", "No eligible Service Provider account was found for this email.")
    const profileRef = db.doc(`users/${staff.uid}`)
    const memberRef = db.doc(`shops/${shopId}/members/${staff.uid}`)
    const teamRef = db.doc(`shops/${shopId}/team/${staff.uid}`)
    const membershipsQuery = db.collectionGroup("members").where("uid", "==", staff.uid)
    return await db.runTransaction(async (transaction) => {
      const [identity, actorSnapshot, shop, profile, member, team, memberships] = await Promise.all([
        transaction.get(db.doc(`users/${request.auth.uid}`)),
        transaction.get(actor.ref), transaction.get(db.doc(`shops/${shopId}`)),
        transaction.get(profileRef), transaction.get(memberRef), transaction.get(teamRef),
        transaction.get(membershipsQuery),
      ])
      if (identity.data()?.role !== "Administrator" && (!actorSnapshot.exists || !["Administrator", "Manager"].includes(actorSnapshot.data().role)))
        throw new HttpsError("permission-denied", "Your shop management access has changed. Sign in again.")
      if (!shop.exists)
        throw new HttpsError("failed-precondition", "Finish creating your shop before adding staff.")
      const data = profile.data()
      if (!profile.exists || data.role !== "Service Provider" ||
        typeof data.name !== "string" || data.name.trim().length < 2 || data.name.length > 120 ||
        typeof data.email !== "string" || data.email.toLowerCase() !== email)
        throw new HttpsError("failed-precondition", "No eligible Service Provider account was found for this email. An Administrator must configure its staff profile first.")
      const assignedElsewhere = [data.shopId, data.activeShopId].some((id) => id && id !== shopId) ||
        memberships.docs.some((record) => /^shops\/[^/]+\/members\/[^/]+$/.test(record.ref.path) &&
          record.ref.parent.parent.id !== shopId &&
          ["Service Provider", "Manager", "Administrator"].includes(record.data().role))
      if (assignedElsewhere)
        throw new HttpsError("failed-precondition", "This Service Provider is assigned to another shop. Adding staff cannot transfer existing assignments or records.")
      if (member.exists && member.data().role !== "Service Provider")
        throw new HttpsError("failed-precondition", "This account has another role in your shop. Only an Administrator can change assigned roles.")
      if (member.exists && team.exists && team.data().role === "Service Provider" && team.data().active === true &&
        data.shopId === shopId && data.activeShopId === shopId)
        return { added: false, name: data.name }
      transaction.update(profileRef, { shopId, activeShopId: shopId, updatedAt: FieldValue.serverTimestamp() })
      if (!member.exists)
        transaction.create(memberRef, { uid: staff.uid, name: data.name, email: data.email, role: "Service Provider", joinedAt: FieldValue.serverTimestamp() })
      else
        transaction.update(memberRef, { name: data.name, email: data.email, updatedAt: FieldValue.serverTimestamp() })
      transaction.set(teamRef, { name: data.name, role: "Service Provider", active: true, updatedAt: FieldValue.serverTimestamp() })
      return { added: true, name: data.name }
    })
  } catch (error) {
    if (error instanceof HttpsError) throw error
    logError("addExistingStaff failed", {
      code: error?.code || "unknown",
      message: error?.message || "Unknown backend error",
      shopId: String(request.data?.shopId || ""),
      actorUid: request.auth?.uid || "",
    })
    if ((error?.code === 9 || error?.code === "failed-precondition") &&
      /index/i.test(error?.message || ""))
      throw new HttpsError("failed-precondition", "Staff lookup requires the members.uid Firestore index. Ask your Administrator to deploy firestore:indexes and wait until the index is ready before retrying.")
    if ([7, "permission-denied", "auth/insufficient-permission"].includes(error?.code))
      throw new HttpsError("failed-precondition", "The staff-assignment backend lacks Firebase permissions. Ask your Administrator to check the deployed function’s service-account access to Authentication and Firestore.")
    throw new HttpsError("internal", "Staff could not be added. Ask your Administrator to check the addExistingStaff function logs and verify that the latest function and Firestore indexes are deployed.")
  }
})

export const updateShopSpecialties = onDocumentWritten(
  { region, document: "shops/{shopId}/services/{serviceId}", retry: true },
  async (event) => {
    const shopRef = db.doc(`shops/${event.params.shopId}`)
    const menu = db.collection(`shops/${event.params.shopId}/services`).where("status", "==", "Active")
    await db.runTransaction(async (transaction) => {
      const [shop, services] = await Promise.all([transaction.get(shopRef), transaction.get(menu)])
      if (!shop.exists) return
      const categories = [...new Set(services.docs.map((item) => item.data().category).filter((value) => typeof value === "string" && value))].sort().slice(0, 30)
      if (JSON.stringify(shop.data().serviceCategories || []) === JSON.stringify(categories)) return
      transaction.update(shopRef, { serviceCategories: categories, updatedAt: FieldValue.serverTimestamp() })
    })
  },
)

export const activateStarterTrial = onCall({ region }, async (request) => {
  const profile = await requireManager(request, true)
  const shopId = profile.ref.parent.parent.id
  const subscriptionRef = db.doc(`shops/${shopId}/settings/subscription`)
  const trialRef = db.doc(`shops/${shopId}/subscriptionTrials/starter`)
  const accessRef = db.doc(`shops/${shopId}/settings/access`)

  await db.runTransaction(async (transaction) => {
    const [subscription, trial, access] = await Promise.all([
      transaction.get(subscriptionRef),
      transaction.get(trialRef),
      transaction.get(accessRef),
    ])
    if (subscription.exists || trial.exists)
      throw new HttpsError(
        "already-exists",
        "The workspace has already used a subscription or Starter trial.",
      )
    if (access.exists) throw new HttpsError("failed-precondition", "An Administrator has already configured workspace access.")

    const startedAt = new Date()
    const currentPeriodEnd = new Date(
      startedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
    )
    const payload = {
      amount: 0,
      billingCycle: "month",
      currency: "PHP",
      currentPeriodEnd: Timestamp.fromDate(currentPeriodEnd),
      normalAmount: plans.starter.amount,
      paymentMethod: "Free trial",
      plan: plans.starter.name,
      planId: "starter",
      startedBy: request.auth.uid,
      status: "Trial",
      trialDays: 7,
      trialStartedAt: Timestamp.fromDate(startedAt),
      updatedAt: FieldValue.serverTimestamp(),
    }
    transaction.create(trialRef, {
      planId: "starter",
      startedAt: Timestamp.fromDate(startedAt),
      startedBy: request.auth.uid,
      startedByName: profile.data()?.name || "",
    })
    transaction.create(subscriptionRef, payload)
    transaction.create(accessRef, {
      planId: "starter", status: "Trial", trialStartedAt: Timestamp.fromDate(startedAt),
      manualLocked: false, reason: "", updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp(),
    })
  })

  return { activated: true }
})

export const submitSubscriptionPayment = onCall({ region }, async (request) => {
  const profile = await requireManager(request, true)
  const shopId = profile.ref.parent.parent.id
  const planId = String(request.data?.planId || "")
  const plan = plans[planId]
  const receiptUrl = String(request.data?.receiptUrl || "")
  const receiptPublicId = String(request.data?.receiptPublicId || "")
  if (!/^https:\/\/res\.cloudinary\.com\/dijbiwcbo\/image\/upload\/[^\s?#]+$/.test(receiptUrl) || !receiptPublicId || receiptPublicId.length > 300)
    throw new HttpsError("invalid-argument", "Upload a valid receipt screenshot before submitting.")
  const transactionReference = String(
    request.data?.transactionReference || "",
  )
    .trim()
    .toUpperCase()

  if (!plan)
    throw new HttpsError("invalid-argument", "Choose a valid SmartCut plan.")
  if (!/^[A-Z0-9-]{6,40}$/.test(transactionReference))
    throw new HttpsError(
      "invalid-argument",
      "Enter a valid GCash transaction reference.",
    )

  const requestRef = db.doc(
    `shops/${shopId}/subscriptionPaymentRequests/${transactionReference}`,
  )
  const referenceRef = db.doc(`subscriptionReferences/${transactionReference}`)
  await db.runTransaction(async (transaction) => {
    const [existingRequest, existingReference] = await Promise.all([transaction.get(requestRef), transaction.get(referenceRef)])
    if (existingRequest.exists || existingReference.exists)
      throw new HttpsError(
        "already-exists",
        "This GCash transaction reference has already been submitted.",
      )
    transaction.create(referenceRef, { shopId, submittedBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() })
    transaction.create(requestRef, {
      shopId,
      amount: plan.amount,
      currency: "PHP",
      paymentMethod: "GCash",
      plan: plan.name,
      planId,
      status: "Pending",
      submittedBy: request.auth.uid,
      submittedByName:
        profile.data()?.name || request.auth.token.email || "Workspace member",
      transactionReference,
      receiptUrl,
      receiptPublicId,
      createdAt: FieldValue.serverTimestamp(),
    })
  })

  return { requestId: requestRef.id }
})

export const approveSubscriptionPayment = onCall(
  { region },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Sign in before approving payments.")
    const profile = await requireManager(request, true)
    const shopId = profile.ref.parent.parent.id
    if (profile.data()?.role !== "Administrator")
      throw new HttpsError(
        "permission-denied",
        "Only an Administrator can approve subscription payments.",
      )

    const requestId = String(request.data?.requestId || "")
    if (!/^[A-Z0-9-]{6,40}$/.test(requestId))
      throw new HttpsError("invalid-argument", "Invalid payment request.")

    const requestRef = db.doc(`shops/${shopId}/subscriptionPaymentRequests/${requestId}`)
    const paymentRef = db.doc(`shops/${shopId}/subscriptionPayments/${requestId}`)
    const subscriptionRef = db.doc(`shops/${shopId}/settings/subscription`)
    const accessRef = db.doc(`shops/${shopId}/settings/access`)
    await db.runTransaction(async (transaction) => {
      const [paymentRequest, existingPayment, subscription, access] =
        await Promise.all([
          transaction.get(requestRef),
          transaction.get(paymentRef),
          transaction.get(subscriptionRef),
          transaction.get(accessRef),
        ])
      const paymentData = paymentRequest.data()
      if (!paymentRequest.exists || paymentData?.status !== "Pending")
        throw new HttpsError(
          "failed-precondition",
          "This payment request is no longer pending.",
        )

      const plan = plans[paymentData.planId]
      if (
        !plan ||
        plan.name !== paymentData.plan ||
        plan.amount !== paymentData.amount ||
        paymentData.currency !== "PHP" ||
        paymentData.transactionReference !== requestId ||
        existingPayment.exists
      )
        throw new HttpsError(
          "failed-precondition",
          "The payment request does not match a current plan.",
        )

      const now = new Date()
      const existingEnd = subscriptionPeriodEnd(subscription.data())
      const periodStart =
        existingEnd instanceof Date && existingEnd > now ? existingEnd : now
      const currentPeriodEnd = addBillingMonth(periodStart)
      const payment = {
        amount: plan.amount,
        approvedBy: request.auth.uid,
        currency: "PHP",
        currentPeriodEnd: Timestamp.fromDate(currentPeriodEnd),
        paidAt: FieldValue.serverTimestamp(),
        paymentMethod: "GCash",
        plan: plan.name,
        planId: paymentData.planId,
        reference: paymentData.transactionReference,
        requestId,
        status: "Paid",
        submittedBy: paymentData.submittedBy,
      }

      transaction.create(paymentRef, payment)
      transaction.set(subscriptionRef, {
        ...payment,
        billingCycle: "month",
        currentPeriodStart: Timestamp.fromDate(periodStart),
        status: "Active",
        manualLocked: access.data()?.manualLocked === true,
        lockReason: access.data()?.reason || "",
        updatedBy: request.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(accessRef, {
        planId: paymentData.planId, status: "Active", expiresAt: Timestamp.fromDate(currentPeriodEnd),
        manualLocked: access.data()?.manualLocked === true, reason: access.data()?.reason || "",
        updatedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.update(requestRef, {
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: request.auth.uid,
        status: "Approved",
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    return { activated: true }
  },
)

export const expireSubscription = onSchedule(
  { region, schedule: "every 60 minutes", timeZone: "Asia/Manila" },
  async () => {
    const subscriptions = await db.collectionGroup("settings").where("status", "in", ["Active", "Trial"]).get()
    for (const record of subscriptions.docs) {
      if (!/^shops\/[^/]+\/settings\/subscription$/.test(record.ref.path)) continue
      await db.runTransaction(async (transaction) => {
        const subscription = await transaction.get(record.ref)
        const data = subscription.data()
        const periodEnd = subscriptionPeriodEnd(data)
        if (!subscription.exists || !["Active", "Trial"].includes(data?.status) ||
          !(periodEnd instanceof Date) || periodEnd.getTime() > Date.now()) return
        transaction.update(record.ref, {
          expiredAt: FieldValue.serverTimestamp(), status: "Expired", updatedAt: FieldValue.serverTimestamp(),
        })
      })
    }
  },
)
