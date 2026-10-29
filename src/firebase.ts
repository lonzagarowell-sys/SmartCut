import { deleteApp, initializeApp } from "firebase/app"
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
  type Transaction,
} from "firebase/firestore"
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithPopup,
  initializeAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  validatePassword,
  onIdTokenChanged,
  type User,
} from "firebase/auth"
import { getFunctions, httpsCallable } from "firebase/functions"
import { requiresCaptcha } from "./captcha-policy.mjs"
import { normalizeSmsNumber } from "./sms-phone.mjs"
import { normalizeWalkInInput, canClaimWalkIn, canAdvanceWalkIn } from "./walk-ins.mjs"
import { normalizeFacebookPageUrl } from "./facebook-page.mjs"
import { friendlyErrorMessage } from "./error-messages.mjs"
import { adminBookingSlots, normalizeAdminEdit, recordEditFields } from "./admin-records"
import { TEMPORARY_MANAGER_RECORD_DELETION } from "./record-deletion"
import { billingPlans, billingDeadline, addBillingMonth, manilaDueDate } from "./subscription-access.mjs"
import {
  bookingSlots,
  appointmentStatus,
  canChangeAppointment,
  canRecordAppointmentPayment,
  reservationProvider,
  canAssignBooking,
  moneyNumber,
  manilaDate,
  serviceIdentity,
  validateBooking,
  type BookingInput,
} from "./domain"

const app = initializeApp({
  apiKey: "AIzaSyDsfAvtCCB1fWH3x3AyHI-z6QGX5DCG6Ak",
  authDomain: "smartcutpre.firebaseapp.com",
  projectId: "smartcutpre",
  storageBucket: "smartcutpre.firebasestorage.app",
  messagingSenderId: "209237321567",
  appId: "1:209237321567:web:ec705c8245cf2b28e678ea",
})
export const db = getFirestore(app)
const auth = getAuth(app)
const functions = getFunctions(app, "asia-southeast1")
export type SmartCutRecord = {
  id: string
  rows?: string[]
  [key: string]: unknown
}
export type UserRole = "Administrator" | "Manager" | "Service Provider" | "Customer"
export type UserProfile = {
  uid: string
  name: string
  email: string
  role: UserRole
  shopId?: string
  activeShopId?: string
  joinedShopIds?: string[]
}
export type ShopProfile = {
  id: string
  name: string
  ownerId: string
  managerName: string
  location: string
  description: string
  serviceCategories: string[]
  logoUrl: string
  themeColor?: string
  active: boolean
  acceptingCustomers: boolean
  open?: string
  close?: string
  facebookUrl?: string
}
let activeBusinessId = ""
export function setBusinessContext(shopId: string) {
  activeBusinessId = shopId
}
function businessId() {
  currentUser()
  if (!activeBusinessId)
    throw new Error("Select a shop before opening its workspace.")
  return activeBusinessId
}
function shopDoc(shopId: string, name: string, id: string) {
  return doc(db, "shops", shopId, name, id)
}
function shopCollection(shopId: string, name: string) {
  return collection(db, "shops", shopId, name)
}
export function subscribeShop(
  shopId: string,
  callback: (shop: ShopProfile | null) => void,
  onError: (error: string) => void,
) {
  return onSnapshot(
    doc(db, "shops", shopId),
    (snapshot) => {
      callback(
        snapshot.exists()
          ? { ...snapshot.data(), id: snapshot.id } as ShopProfile
          : null,
      )
    },
    (error) => onError(friendlyError(error)),
  )
}
export function subscribeShopDirectory(
  joinedIds: string[],
  callback: (shops: ShopProfile[]) => void,
  onStatus: (status: SyncState, error?: string) => void,
) {
  const available = new Map<string, ShopProfile>()
  const joined = new Map<string, ShopProfile>()
  let directoryError = ""
  const reportError = (error: unknown) => {
    directoryError = friendlyError(error)
    onStatus("error", directoryError)
  }
  const emit = () =>
    callback(
      [...new Map([...available, ...joined]).values()].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    )
  onStatus("connecting")
  const stops = [
    onSnapshot(
      query(collection(db, "shops"), where("active", "==", true)),
      { includeMetadataChanges: true },
      (snapshot) => {
        available.clear()
        snapshot.docs.forEach((item) =>
          available.set(item.id, {
            ...item.data(),
            id: item.id,
          } as ShopProfile),
        )
        emit()
        if (directoryError) onStatus("error", directoryError)
        else onStatus(snapshotSyncState(snapshot.metadata))
      },
      reportError,
    ),
  ]
  for (const id of [...new Set(joinedIds)]) {
    stops.push(
      onSnapshot(
        doc(db, "shops", id),
        (snapshot) => {
          if (snapshot.exists())
            joined.set(id, { ...snapshot.data(), id } as ShopProfile)
          else joined.delete(id)
          emit()
        },
        reportError,
      ),
    )
  }
  return () => stops.forEach((stop) => stop())
}
export function subscribeAdministratorShops(
  callback: (shops: ShopProfile[]) => void,
  onStatus: (status: SyncState, error?: string) => void,
) {
  onStatus("connecting")
  return onSnapshot(collection(db, "shops"), { includeMetadataChanges: true }, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as ShopProfile))
      .sort((first, second) => first.name.localeCompare(second.name)))
    onStatus(snapshotSyncState(snapshot.metadata))
  }, (error) => onStatus("error", friendlyError(error)))
}
export async function selectAdministratorShop(shopId: string) {
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const profileRef = doc(db, "users", uid)
    const [profile, shop] = await Promise.all([
      transaction.get(profileRef), transaction.get(doc(db, "shops", shopId)),
    ])
    if (profile.data()?.role !== "Administrator")
      throw new Error("Only an Administrator can manage another shop.")
    if (!shop.exists()) throw new Error("This shop no longer exists.")
    transaction.update(profileRef, { activeShopId: shopId, updatedAt: serverTimestamp() })
  })
}
export async function selectCustomerShop(shopId: string) {
  const uid = currentUser().uid
  const profileRef = doc(db, "users", uid)
  const memberRef = shopDoc(shopId, "members", uid)
  const clientRef = shopDoc(shopId, "clients", uid)
  await runTransaction(db, async (transaction) => {
    const [profile, shop, member, client] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(doc(db, "shops", shopId)),
      transaction.get(memberRef),
      transaction.get(clientRef),
    ])
    const data = profile.data()
    if (data?.role !== "Customer")
      throw new Error("Shop selection is available to Customer accounts.")
    if (!shop.exists()) throw new Error("This shop is no longer available.")
    if (
      !member.exists() &&
      (!shop.data().active || !shop.data().acceptingCustomers)
    )
      throw new Error(
        "This shop is not accepting new customers. Choose another shop.",
      )
    if (!member.exists())
      transaction.set(memberRef, {
        uid,
        name: data.name,
        email: data.email,
        role: "Customer",
        joinedAt: serverTimestamp(),
      })
    else if (member.data().name !== data.name)
      transaction.update(memberRef, {
        name: data.name,
        updatedAt: serverTimestamp(),
      })
    if (!client.exists())
      transaction.set(clientRef, {
        name: data.name,
        email: data.email,
        phone: "",
        customerId: uid,
        notes: "",
        createdBy: uid,
        createdAt: serverTimestamp(),
      })
    transaction.update(profileRef, {
      activeShopId: shopId,
      joinedShopIds: [...new Set([...(data.joinedShopIds || []), shopId])],
      updatedAt: serverTimestamp(),
    })
  })
}
export async function createBusinessShop(input: {
  shopType: "team" | "solo"
  name: string
  location: string
  description: string
  serviceCategories: string[]
}) {
  const uid = currentUser().uid
  const profileRef = doc(db, "users", uid)
  await runTransaction(db, async (transaction) => {
    const [profile, existing] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(doc(db, "shops", uid)),
    ])
    const data = profile.data()
    if (!["Administrator", "Manager"].includes(data?.role))
      throw new Error("Only management accounts can create a shop.")
    if (existing.exists())
      throw new Error(
        "Your shop already exists. Ask your Administrator to restore its account association.",
      )
    const { shopType, ...directory } = input
    if (!["team", "solo"].includes(shopType)) throw new Error("Choose a shop type.")
    transaction.set(doc(db, "shops", uid), {
      ...directory,
      ownerId: uid,
      managerName: data!.name,
      logoUrl: "",
      active: true,
      acceptingCustomers: true,
      open: "09:00",
      close: "18:00",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(shopDoc(uid, "members", uid), {
      uid,
      name: data!.name,
      email: data!.email,
      role: data!.role,
      joinedAt: serverTimestamp(),
    })
    transaction.update(profileRef, {
      shopId: uid,
      activeShopId: uid,
      updatedAt: serverTimestamp(),
    })
    transaction.set(shopDoc(uid, "settings", "business"), {
      shopType,
      managerProviderId: uid,
      managerWorksAsBarber: shopType === "solo",
      onboardingComplete: false,
      name: input.name,
      address: input.location,
      description: input.description,
      email: "",
      phone: "",
      logoUrl: "",
      active: true,
      acceptingCustomers: true,
      open: "09:00",
      close: "18:00",
      openingMinute: 540,
      closingMinute: 1080,
      currency: "PHP",
      timezone: "Asia/Manila",
      bookingSchemaVersion: 2,
      updatedAt: serverTimestamp(),
    })
    if (shopType === "solo") transaction.set(shopDoc(uid, "team", uid), {
      name: data!.name, role: "Service Provider", active: true, updatedAt: serverTimestamp(),
    })
  })
}
export type TeamAccount = Omit<UserProfile, "role"> & { role: string }
export type TeamRole = Exclude<UserRole, "Customer">
export const teamRoles: TeamRole[] = [
  "Service Provider",
  "Manager",
  "Administrator",
]
export type SyncState = "connecting" | "connected" | "error"
function snapshotSyncState(metadata: { fromCache: boolean; hasPendingWrites: boolean }): SyncState {
  return metadata.fromCache || metadata.hasPendingWrites ? "connecting" : "connected"
}
export const roles: UserRole[] = [
  "Administrator",
  "Manager",
  "Service Provider",
  "Customer",
]

export function friendlyError(error: unknown): string {
  return friendlyErrorMessage(error)
}
function currentUser() {
  if (!auth.currentUser) throw new Error("Sign in before continuing.")
  return auth.currentUser
}
export function connectFirebase(
  onUser: (user: User | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, onUser)
}
export async function signInUser(email: string, password: string, captchaToken: string, rememberMe = false) {
  if (requiresCaptcha(window.location.hostname) && !captchaToken)
    throw new Error("Please complete the CAPTCHA before signing in.")
  // Frontend-only checkbox gate, explicitly requested. This token is not
  // server-verified and must not be treated as trusted anti-bot protection.
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
  return signInWithEmailAndPassword(auth, email.trim(), password)
}
export async function signInGoogle(captchaToken: string, rememberMe = false) {
  if (requiresCaptcha(window.location.hostname) && !captchaToken)
    throw new Error("Please complete the CAPTCHA before signing in.")
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: "select_account" })
  return signInWithPopup(auth, provider)
}
export function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email.trim())
}
export type AccountSecurity = {
  uid: string
  email: string
  passwordEnabled: boolean
  googleEnabled: boolean
}
export function subscribeAccountSecurity(
  callback: (security: AccountSecurity | null) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onIdTokenChanged(auth, (user) => callback(user ? {
    uid: user.uid,
    email: user.email || "",
    passwordEnabled: user.providerData.some((provider) => provider.providerId === "password"),
    googleEnabled: user.providerData.some((provider) => provider.providerId === "google.com"),
  } : null), (error) => onError(friendlyError(error)))
}

let changingOwnPassword = false
export async function changeOwnPassword(currentPassword: string, newPassword: string, confirmation: string): Promise<void> {
  if (changingOwnPassword) throw new Error("A password change is already in progress. Please wait.")
  changingOwnPassword = true
  try {
    if (![currentPassword, newPassword, confirmation].every((value) => typeof value === "string"))
      throw new Error("Enter valid password values.")
    if (!currentPassword || !newPassword || !confirmation)
      throw new Error("Enter your current password, new password, and confirmation.")
    if ([currentPassword, newPassword, confirmation].some((value) => value.length > 4096))
      throw new Error("The password is too long.")
    if (newPassword !== confirmation)
      throw new Error("Your new passwords do not match.")
    if (newPassword === currentPassword)
      throw new Error("Choose a new password different from your current password.")
    const user = currentUser()
    if (!user.email || !user.providerData.some((provider) => provider.providerId === "password"))
      throw new Error("This account does not have a SmartCut email/password login. Change your password through your sign-in provider.")
    const validation = await validatePassword(auth, newPassword)
    if (!validation.isValid) {
      const policy = validation.passwordPolicy.customStrengthOptions
      const requirements = [
        validation.meetsMinPasswordLength === false ? `at least ${policy.minPasswordLength || 6} characters` : "",
        validation.meetsMaxPasswordLength === false ? `no more than ${policy.maxPasswordLength || 4096} characters` : "",
        validation.containsLowercaseLetter === false ? "a lowercase letter" : "",
        validation.containsUppercaseLetter === false ? "an uppercase letter" : "",
        validation.containsNumericCharacter === false ? "a number" : "",
        validation.containsNonAlphanumericCharacter === false ? "an allowed symbol" : "",
      ].filter(Boolean)
      throw new Error(requirements.length
        ? `Your new password must meet these requirements: ${requirements.join(", ")}.`
        : "Your new password does not meet the account password policy.")
    }
    if (currentUser().uid !== user.uid)
      throw new Error("Your sign-in session changed. Sign in again before changing your password.")
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === "auth/invalid-credential" || code === "auth/wrong-password")
        throw new Error("Your current password is incorrect. Please try again.")
      throw error
    }
    if (currentUser().uid !== user.uid)
      throw new Error("Your sign-in session changed. Sign in again before changing your password.")
    await updatePassword(user, newPassword)
  } finally {
    changingOwnPassword = false
  }
}

export async function requestOwnPasswordReset(): Promise<void> {
  const user = currentUser()
  if (!user.email || !user.providerData.some((provider) => provider.providerId === "password"))
    throw new Error("Use your sign-in provider to manage this account's password.")
  await sendPasswordResetEmail(auth, user.email)
}
export function signOutUser() {
  setBusinessContext("")
  return signOut(auth)
}
export async function activateStarterTrial() {
  const shopId = businessId()
  const uid = currentUser().uid
  const subscriptionRef = shopDoc(shopId, "settings", "subscription")
  const trialRef = shopDoc(shopId, "subscriptionTrials", "starter")
  const accessRef = shopDoc(shopId, "settings", "access")
  await runTransaction(db, async (transaction) => {
    const [profile, subscription, trial, access] = await Promise.all([
      transaction.get(doc(db, "users", uid)),
      transaction.get(subscriptionRef),
      transaction.get(trialRef),
      transaction.get(accessRef),
    ])
    if (!["Administrator", "Manager"].includes(profile.data()?.role))
      throw new Error(
        "Only an Administrator or Manager can start the workspace trial.",
      )
    if (subscription.exists() || trial.exists())
      throw new Error(
        "This workspace has already used a subscription or its seven-day Starter trial.",
      )
    if (access.exists()) throw new Error("An Administrator has already configured this workspace's access. Ask them to review it.")
    transaction.set(trialRef, {
      planId: "starter",
      startedAt: serverTimestamp(),
      startedBy: uid,
      startedByName: profile.data()?.name || "",
    })
    transaction.set(subscriptionRef, {
      amount: 0,
      billingCycle: "month",
      currency: "PHP",
      normalAmount: 99,
      paymentMethod: "Free trial",
      plan: "Starter",
      planId: "starter",
      startedBy: uid,
      status: "Trial",
      trialDays: 7,
      trialStartedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(accessRef, {
      planId: "starter", status: "Trial", trialStartedAt: serverTimestamp(),
      manualLocked: false, reason: "", updatedBy: uid, updatedAt: serverTimestamp(),
    })
  })
}

const subscriptionPlans = {
  starter: { plan: "Starter", amount: 99 },
  professional: { plan: "Professional", amount: 399 },
  business: { plan: "Business", amount: 599 },
} as const

export async function submitSubscriptionPayment(
  planId: string,
  transactionReference: string,
  receipt: { imageUrl: string; imagePublicId: string },
) {
  const shopId = businessId()
  const reference = transactionReference.trim().toUpperCase()
  if (!Object.prototype.hasOwnProperty.call(billingPlans, planId))
    throw new Error("Choose a valid subscription plan.")
  if (!/^[A-Z0-9-]{6,40}$/.test(reference))
    throw new Error("Enter a valid GCash transaction reference.")
  if (!/^https:\/\/res\.cloudinary\.com\/dijbiwcbo\/image\/upload\/[^\s?#]+$/.test(receipt.imageUrl) ||
    !receipt.imagePublicId || receipt.imagePublicId.length > 300)
    throw new Error("Upload a valid GCash receipt screenshot.")
  const uid = currentUser().uid
  const requestRef = shopDoc(shopId, "subscriptionPaymentRequests", reference)
  await runTransaction(db, async (transaction) => {
    const [existing, actor] = await Promise.all([
      transaction.get(requestRef), transaction.get(doc(db, "users", uid)),
    ])
    if (existing.exists()) throw new Error("This GCash reference has already been submitted.")
    const plan = billingPlans[planId]
    transaction.set(doc(db, "subscriptionReferences", reference), { shopId, submittedBy: uid, createdAt: serverTimestamp() })
    transaction.set(requestRef, {
      shopId, planId, plan: plan.name, amount: plan.amount, currency: "PHP", paymentMethod: "GCash",
      status: "Pending", submittedBy: uid, submittedByName: String(actor.data()?.name || ""),
      transactionReference: reference, receiptUrl: receipt.imageUrl, receiptPublicId: receipt.imagePublicId,
      createdAt: serverTimestamp(),
    })
  })
  return { requestId: reference }
}

export async function approveSubscriptionPayment(requestId: string): Promise<{ locked: boolean }> {
  if (!/^[A-Z0-9-]{6,40}$/.test(requestId)) throw new Error("Choose a valid payment request.")
  const shopId = businessId()
  const uid = currentUser().uid
  return runTransaction(db, async (transaction) => {
    const requestRef = shopDoc(shopId, "subscriptionPaymentRequests", requestId)
    const paymentRef = shopDoc(shopId, "subscriptionPayments", requestId)
    const subRef = shopDoc(shopId, "settings", "subscription")
    const accessRef = shopDoc(shopId, "settings", "access")
    const [actor, request, payment, subscription, access, reference] = await Promise.all([
      transaction.get(doc(db, "users", uid)), transaction.get(requestRef), transaction.get(paymentRef),
      transaction.get(subRef), transaction.get(accessRef), transaction.get(doc(db, "subscriptionReferences", requestId)),
    ])
    if (actor.data()?.role !== "Administrator") throw new Error("Only a global Administrator can approve subscriptions.")
    const data = request.data()
    const plan = data && Object.prototype.hasOwnProperty.call(billingPlans, String(data.planId)) ? billingPlans[String(data.planId)] : undefined
    if (!data || data.status !== "Pending" || payment.exists() || !plan ||
      data.shopId !== shopId || data.plan !== plan.name || data.currency !== "PHP" || data.paymentMethod !== "GCash" ||
      data.amount !== plan.amount || data.transactionReference !== requestId ||
      reference.data()?.shopId !== shopId || reference.data()?.submittedBy !== data.submittedBy ||
      typeof data.receiptUrl !== "string" || !/^https:\/\/res\.cloudinary\.com\/dijbiwcbo\/image\/upload\/[^\s?#]+$/.test(data.receiptUrl) ||
      typeof data.receiptPublicId !== "string" || !data.receiptPublicId || data.receiptPublicId.length > 300)
      throw new Error("This payment is no longer pending or does not match the selected shop and plan.")
    const now = new Date()
    const previousEnd = billingDeadline(subscription.data())
    const end = addBillingMonth(previousEnd && previousEnd > now ? previousEnd : now)
    const manualLocked = access.exists()
      ? access.data()?.manualLocked === true
      : subscription.data()?.manualLocked === true
    const reason = manualLocked ? String(access.data()?.reason || subscription.data()?.lockReason || "Requirements must be reviewed by an Administrator.") : ""
    transaction.set(paymentRef, {
      requestId, reference: requestId, planId: data.planId, plan: plan.name, amount: plan.amount, currency: "PHP",
      paymentMethod: "GCash", status: "Paid", submittedBy: data.submittedBy, approvedBy: uid,
      paidAt: serverTimestamp(), currentPeriodEnd: Timestamp.fromDate(end),
    })
    writeAdminSubscription(transaction, shopId, uid, String(data.planId), end, manualLocked, reason, "GCash", requestId)
    transaction.update(requestRef, { status: "Approved", approvedBy: uid, approvedAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return { locked: manualLocked }
  })
}

function writeAdminSubscription(transaction: Transaction, shopId: string,
  uid: string, planId: string, end: Date, manualLocked: boolean, reason: string, method: string, reference = "") {
  const plan = billingPlans[planId]
  const status = end > new Date() ? "Active" : "Expired"
  transaction.set(shopDoc(shopId, "settings", "subscription"), {
    planId, plan: plan.name, amount: plan.amount, currency: "PHP", billingCycle: "month",
    status, currentPeriodStart: serverTimestamp(), currentPeriodEnd: Timestamp.fromDate(end),
    manualLocked, lockReason: reason, paymentMethod: method, reference, updatedBy: uid, updatedAt: serverTimestamp(),
  })
  transaction.set(shopDoc(shopId, "settings", "access"), {
    planId, status: status === "Active" ? "Active" : "Locked", expiresAt: Timestamp.fromDate(end),
    manualLocked, reason, updatedBy: uid, updatedAt: serverTimestamp(),
  })
  transaction.set(doc(shopCollection(shopId, "subscriptionEvents")), {
    action: method === "GCash" ? "Payment approved" : "Administrator adjustment",
    planId, expiresAt: Timestamp.fromDate(end), manualLocked, reason, reference,
    actorId: uid, createdAt: serverTimestamp(),
  })
}

export async function manageShopSubscription(planId: string, dueDate: string, manualLocked: boolean, reason: string, extendMonth = false) {
  if (!Object.prototype.hasOwnProperty.call(billingPlans, planId)) throw new Error("Choose a valid subscription plan.")
  if (reason.trim().length > 500) throw new Error("Keep the access reason within 500 characters.")
  const shopId = businessId()
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const [actor, previous] = await Promise.all([
      transaction.get(doc(db, "users", uid)), transaction.get(shopDoc(shopId, "settings", "subscription")),
    ])
    if (actor.data()?.role !== "Administrator") throw new Error("Only a global Administrator can manage subscriptions.")
    const now = new Date()
    const previousEnd = billingDeadline(previous.data())
    const end = extendMonth ? addBillingMonth(previousEnd && previousEnd > now ? previousEnd : now) : manilaDueDate(dueDate)
    writeAdminSubscription(transaction, shopId, uid, planId, end, manualLocked, reason.trim(), "Administrator")
  })
}

export async function rejectSubscriptionPayment(requestId: string, reason: string) {
  if (!reason.trim() || reason.length > 500) throw new Error("Enter a short rejection reason.")
  const shopId = businessId()
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const ref = shopDoc(shopId, "subscriptionPaymentRequests", requestId)
    const [actor, request] = await Promise.all([transaction.get(doc(db, "users", uid)), transaction.get(ref)])
    if (actor.data()?.role !== "Administrator") throw new Error("Only an Administrator can reject payment proof.")
    if (request.data()?.status !== "Pending") throw new Error("This request is no longer pending.")
    transaction.update(ref, { status: "Rejected", rejectionReason: reason.trim(), reviewedBy: uid, updatedAt: serverTimestamp() })
  })
}
export async function updateTeamMemberName(uid: string, name: string) {
  const shopId = businessId()
  const actorUid = currentUser().uid
  if (name.trim().length < 2 || name.trim().length > 120) throw new Error("Use a name between 2 and 120 characters.")
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", uid)
    const memberRef = shopDoc(shopId, "members", uid)
    const teamRef = shopDoc(shopId, "team", uid)
    const [actor, user, member, team, shop] = await Promise.all([
      transaction.get(doc(db, "users", actorUid)), transaction.get(userRef), transaction.get(memberRef),
      transaction.get(teamRef), transaction.get(doc(db, "shops", shopId)),
    ])
    if (actor.data()?.role !== "Administrator") throw new Error("Only a global Administrator can edit another member's name.")
    if (!user.exists() || !member.exists()) throw new Error("This account is not a registered member of the selected shop.")
    transaction.update(userRef, { name: name.trim(), updatedAt: serverTimestamp() })
    transaction.update(memberRef, { name: name.trim(), updatedAt: serverTimestamp() })
    if (team.exists()) transaction.update(teamRef, { name: name.trim(), updatedAt: serverTimestamp() })
    if (shop.data()?.ownerId === uid)
      transaction.update(doc(db, "shops", shopId), { managerName: name.trim(), updatedAt: serverTimestamp() })
  })
}

export function subscribeWorkspaceAccess(shopId: string, callback: (data: SmartCutRecord | null) => void, onStatus: (status: SyncState, error?: string) => void): Unsubscribe {
  onStatus("connecting")
  return onSnapshot(shopDoc(shopId, "settings", "access"), { includeMetadataChanges: true }, (snapshot) => {
    callback(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as SmartCutRecord : null)
    onStatus(snapshotSyncState(snapshot.metadata))
  }, (error) => { callback(null); onStatus("error", friendlyError(error)) })
}
export async function readWorkspaceAccess(shopId: string): Promise<SmartCutRecord | null> {
  const snapshot = await getDocFromServer(shopDoc(shopId, "settings", "access"))
  return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as SmartCutRecord : null
}
export function subscribeSubscriptionState(callback: (records: SmartCutRecord[]) => void, onStatus: (status: SyncState, error?: string) => void): Unsubscribe {
  const shopId = businessId()
  onStatus("connecting")
  return onSnapshot(shopDoc(shopId, "settings", "subscription"), { includeMetadataChanges: true }, (snapshot) => {
    callback(snapshot.exists() ? [{ ...snapshot.data(), id: snapshot.id } as SmartCutRecord] : [])
    onStatus(snapshotSyncState(snapshot.metadata))
  }, (error) => { callback([]); onStatus("error", friendlyError(error)) })
}

export async function reflectExistingSubscriptionAccess(shopId: string) {
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const accessRef = shopDoc(shopId, "settings", "access")
    const [access, sub] = await Promise.all([transaction.get(accessRef), transaction.get(shopDoc(shopId, "settings", "subscription"))])
    if (access.exists() || !sub.exists()) return
    const data = sub.data()!
    const deadline = billingDeadline(data)
    if (!deadline || !Object.prototype.hasOwnProperty.call(billingPlans, String(data.planId))) return
    transaction.set(accessRef, {
      planId: data.planId, status: data.status === "Trial" ? "Trial" : data.status === "Active" ? "Active" : "Locked",
      ...(data.status === "Trial" ? { trialStartedAt: data.trialStartedAt } : { expiresAt: Timestamp.fromDate(deadline) }),
      manualLocked: data.manualLocked === true, reason: String(data.lockReason || ""),
      updatedBy: uid, updatedAt: serverTimestamp(),
    })
  })
}
const profileInitializations = new Map<string, Promise<void>>()
async function ensureUserProfile(user: User, name?: string) {
  const pending = profileInitializations.get(user.uid)
  if (pending) {
    await pending
    if (!name) return
    return ensureUserProfile(user, name)
  }
  const initialization = initializeUserProfile(user, name)
  profileInitializations.set(user.uid, initialization)
  try {
    await initialization
  } finally {
    if (profileInitializations.get(user.uid) === initialization)
      profileInitializations.delete(user.uid)
  }
}
async function initializeUserProfile(user: User, name?: string) {
  if (!user.email)
    throw new Error("An email address is required to set up your account.")
  const profileRef = doc(db, "users", user.uid)
  const suggestedName = (
    name ||
    user.displayName ||
    user.email.split("@")[0]
  ).trim()
  const profileName = suggestedName.length >= 2 ? suggestedName : "Customer"
  const initialize = () => runTransaction(db, async (transaction) => {
    const profile = await transaction.get(profileRef)
    if (profile.exists()) {
      if (name && profile.data().name !== profileName)
        transaction.update(profileRef, {
          name: profileName,
          updatedAt: serverTimestamp(),
        })
      return
    }
    transaction.set(profileRef, {
      uid: user.uid,
      name: profileName,
      email: user.email,
      role: "Customer",
      createdAt: serverTimestamp(),
    })
  })
  try {
    await initialize()
  } catch (error) {
    if ((error as { code?: string }).code !== "already-exists") throw error
    await initialize()
  }
}
export async function registerCustomer(
  name: string,
  email: string,
  password: string,
  captchaToken = "",
) {
  // Use the same frontend-only gate and Figma preview exemption as sign-in.
  if (requiresCaptcha(window.location.hostname) && !captchaToken)
    throw new Error("Please complete the CAPTCHA before creating an account.")
  if (name.trim().length < 2)
    throw new Error("Enter your full name (at least 2 characters).")
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim().toLowerCase(),
    password,
  )
  await updateProfile(credential.user, { displayName: name.trim() })
  await ensureUserProfile(credential.user, name.trim())
  return credential.user
}
export function subscribeUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void,
  onError?: (error: string) => void,
): Unsubscribe {
  const user = currentUser()
  if (user.uid !== uid)
    throw new Error("You can only initialize your own account.")
  let active = true
  let stopProfile: Unsubscribe | undefined
  void ensureUserProfile(user)
    .then(() => {
      if (!active) return
      stopProfile = onSnapshot(
        doc(db, "users", uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          // A shop-selection transaction writes membership and profile together.
          // Do not open its workspace from an optimistic profile update.
          if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
          const data = snapshot.data()
          if (!data || !roles.includes(data.role)) {
            onError?.(
              data?.role === "Cashier"
                ? "The Cashier role has been removed. Ask an Administrator to migrate your account to Service Provider. Your existing sales and receipts remain unchanged."
                : "Your account needs a valid workspace role. Ask an Administrator or Manager to review your user profile.",
            )
            callback(null)
            return
          }
          onError?.("")
          callback({ ...data, uid } as UserProfile)
        },
        (error) => {
          if (!active) return
          onError?.(friendlyError(error))
          callback(null)
        },
      )
    })
    .catch((error) => {
      if (!active) return
      onError?.(friendlyError(error))
      callback(null)
    })
  return () => {
    active = false
    stopProfile?.()
  }
}
export function subscribeUsers(
  callback: (users: TeamAccount[]) => void,
  onError?: (message: string) => void,
  onStatus?: (status: SyncState) => void,
): Unsubscribe {
  const shopId = businessId()
  return onSnapshot(
    query(
      shopCollection(shopId, "members"),
      where("role", "in", teamRoles),
    ),
    { includeMetadataChanges: true },
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (item) => ({ ...item.data(), uid: item.id }) as TeamAccount,
        ),
      )
      onStatus?.(snapshotSyncState(snapshot.metadata))
    },
    (error) => onError?.(friendlyError(error)),
  )
}
export async function updateAccountProfile(name: string) {
  const shopId = businessId()
  if (name.trim().length < 2)
    throw new Error("Display name must contain at least 2 characters.")
  const user = currentUser()
  const batch = writeBatch(db)
  batch.update(doc(db, "users", user.uid), {
    name: name.trim(),
    updatedAt: serverTimestamp(),
  })
  const provider = await getDoc(shopDoc(shopId, "team", user.uid))
  const membership = await getDoc(shopDoc(shopId, "members", user.uid))
  if (provider.exists()) batch.update(provider.ref, { name: name.trim() })
  if (membership.exists()) batch.update(membership.ref, { name: name.trim(), updatedAt: serverTimestamp() })
  if (membership.data()?.role === "Customer") {
    const client = await getDoc(shopDoc(shopId, "clients", user.uid))
    if (client.exists() && client.data().customerId === user.uid)
      batch.update(client.ref, { name: name.trim(), updatedAt: serverTimestamp() })
  }
  if (shopId === user.uid && ["Administrator", "Manager"].includes(membership.data()?.role))
    batch.update(doc(db, "shops", shopId), { managerName: name.trim(), updatedAt: serverTimestamp() })
  await batch.commit()
  await updateProfile(user, { displayName: name.trim() })
}
export async function createTeamAccount(input: {
  name: string
  email: string
  password: string
  role: TeamRole
}): Promise<UserProfile> {
  const shopId = businessId()
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (name.length < 2 || name.length > 120)
    throw new Error("Enter a full name between 2 and 120 characters.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.")
  if (input.password.length < 8)
    throw new Error("Use a password with at least 8 characters.")
  if (!teamRoles.includes(input.role))
    throw new Error("Choose a valid team role.")
  const managerUid = currentUser().uid
  const managerProfile = await getDoc(doc(db, "users", managerUid))
  if (!["Administrator", "Manager"].includes(managerProfile.data()?.role))
    throw new Error(
      "Only an Administrator or Manager can create team accounts.",
    )
  if (
    managerProfile.data()?.role === "Manager" &&
    input.role !== "Service Provider"
  )
    throw new Error("Managers can only create Service Provider accounts.")
  const provisioningApp = initializeApp(
    app.options,
    `team-${crypto.randomUUID()}`,
  )
  let createdUser: User | null = null
  try {
    const provisioningAuth = initializeAuth(provisioningApp, {
      persistence: inMemoryPersistence,
    })
    const credential = await createUserWithEmailAndPassword(
      provisioningAuth,
      email,
      input.password,
    )
    createdUser = credential.user
    await updateProfile(createdUser, { displayName: name })
    if (auth.currentUser?.uid !== managerUid)
      throw new Error(
        "Your management session changed. Sign in again and retry.",
      )
    const profile: UserProfile = {
      uid: createdUser.uid,
      name,
      email,
      role: input.role,
      ...(input.role === "Service Provider" ? { shopId, activeShopId: shopId } : {}),
    }
    const batch = writeBatch(db)
    batch.set(doc(db, "users", createdUser.uid), {
      ...profile,
      createdBy: managerUid,
      createdAt: serverTimestamp(),
    })
    if (input.role === "Service Provider") {
      batch.set(shopDoc(shopId, "members", createdUser.uid), {
        uid: createdUser.uid, name, email, role: input.role, joinedAt: serverTimestamp(),
      })
      batch.set(shopDoc(shopId, "team", createdUser.uid), {
        name, role: input.role, active: true, updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
    return profile
  } catch (failure) {
    if (createdUser) {
      try {
        await deleteUser(createdUser)
      } catch {
        throw new Error(
          `${friendlyError(failure)} The Firebase login was created, but setup and automatic cleanup failed. Review Authentication user ${createdUser.uid} in the Firebase console before retrying.`,
        )
      }
    }
    throw failure
  } finally {
    await deleteApp(provisioningApp).catch(() => undefined)
  }
}

export async function updateUserRole(uid: string, role: UserRole) {
  const shopId = businessId()
  const actor = await getDoc(doc(db, "users", currentUser().uid))
  if (actor.data()?.role !== "Administrator")
    throw new Error("Only an Administrator can change assigned roles.")
  if (uid === currentUser().uid)
    throw new Error("Ask another Administrator to change your role.")
  if (!roles.includes(role)) throw new Error("Choose a valid role.")
  const profile = await getDoc(doc(db, "users", uid))
  if (!profile.exists()) throw new Error("Account not found.")
  const batch = writeBatch(db)
  batch.update(profile.ref, {
    role, shopId, activeShopId: shopId,
    ...(role === "Customer" ? { joinedShopIds: [...new Set([...(profile.data().joinedShopIds || []), shopId])] } : {}),
    updatedAt: serverTimestamp(),
  })
  batch.update(shopDoc(shopId, "members", uid), { role, updatedAt: serverTimestamp() })
  batch.set(shopDoc(shopId, "team", uid), {
    name: profile.data().name,
    role,
    active: role === "Service Provider",
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}
export async function addExistingStaff(email: string) {
  const shopId = businessId()
  const addStaff = httpsCallable<
    { shopId: string; email: string },
    { added: boolean; name: string }
  >(functions, "addExistingStaff")
  try {
    const result = await addStaff({ shopId, email: email.trim().toLowerCase() })
    return result.data
  } catch (error) {
    const code = (error as { code?: string }).code
    const message = (error as { message?: string }).message || ""
    if ((error as { code?: string }).code === "functions/not-found" &&
      /\bnot found\b/i.test((error as { message?: string }).message || ""))
      throw new Error("Add Existing Staff requires the latest Firebase functions and indexes to be deployed.")
    if (code === "functions/internal" && /^(internal(?:\s*\[\d+\])?)$/i.test(message.trim()))
      throw new Error("The staff-assignment function failed or could not be reached. Ask your Administrator to deploy the latest addExistingStaff function and Firestore indexes, then check its Firebase logs if the issue continues.")
    throw error
  }
}
export async function publishServiceProvider(uid: string) {
  const shopId = businessId()
  const actor = await getDoc(doc(db, "users", currentUser().uid))
  if (!["Administrator", "Manager"].includes(actor.data()?.role))
    throw new Error("Only an Administrator or Manager can publish providers.")
  const profile = await getDoc(shopDoc(shopId, "members", uid))
  if (!profile.exists() || profile.data().role !== "Service Provider")
    throw new Error("Only an existing Service Provider can be published.")
  await setDoc(shopDoc(shopId, "team", uid), {
    name: profile.data().name,
    role: "Service Provider",
    active: true,
    updatedAt: serverTimestamp(),
  })
}

export function subscribeRecords(
  name: string,
  callback: (records: SmartCutRecord[]) => void,
  onStatus?: (status: SyncState, error?: string) => void,
  scope?: "customer" | "provider",
): Unsubscribe {
  const shopId = businessId()
  onStatus?.("connecting")
  const source = scope
    ? query(
        shopCollection(shopId, name),
        where(
          scope === "provider" ? "providerId" : "customerId",
          "==",
          currentUser().uid,
        ),
      )
    : shopCollection(shopId, name)
  return onSnapshot(
    source,
    { includeMetadataChanges: true },
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (item) => ({ ...item.data(), id: item.id }) as SmartCutRecord,
        ),
      )
      onStatus?.(snapshotSyncState(snapshot.metadata))
    },
    (error) => {
      callback([])
      onStatus?.("error", friendlyError(error))
    },
  )
}
export async function createRecord(
  name: string,
  data: DocumentData,
): Promise<SmartCutRecord> {
  const shopId = businessId()
  if (name === "clients" && data.customerId) {
    const actor = await getDoc(doc(db, "users", currentUser().uid))
    if (actor.data()?.role !== "Administrator")
      throw new Error("Only an Administrator can link a record to a customer account.")
  }
  if (name === "services") {
    await ensureUniqueService(shopId, data)
    const identity = serviceIdentity(data.name, data.category)
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))
    const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    const reference = shopDoc(shopId, name, `service_${key}`)
    const payload = { ...data, createdBy: currentUser().uid, createdAt: serverTimestamp() }
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(reference)
      if (existing.exists()) throw new Error("This service already exists. Edit or reactivate the existing service instead.")
      transaction.set(reference, payload)
    })
    return { ...data, id: reference.id }
  }
  const reference = doc(shopCollection(shopId, name))
  const payload = {
    ...data,
    createdBy: currentUser().uid,
    createdAt: serverTimestamp(),
  }
  await setDoc(reference, payload)
  return { ...data, id: reference.id }
}
async function ensureUniqueService(shopId: string, data: DocumentData, exceptId = "") {
  const records = await getDocsFromServer(shopCollection(shopId, "services"))
  const identity = serviceIdentity(data.name, data.category)
  if (records.docs.some((record) => record.id !== exceptId && serviceIdentity(record.data().name, record.data().category) === identity))
    throw new Error("A service with this name and category already exists, including archived services. Edit or reactivate it instead.")
}
export async function updateRecord(
  name: string,
  id: string,
  data: DocumentData,
) {
  const shopId = businessId()
  if (name === "clients") {
    const user = currentUser()
    const [actor, customer] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDoc(shopDoc(shopId, "clients", id)),
    ])
    const customerId = customer.data()?.customerId || ""
    if (actor.data()?.role !== "Administrator" &&
      (customerId || data.customerId) &&
      !(customerId === user.uid && id === user.uid && actor.data()?.role === "Customer" &&
        Object.keys(data).every((key) => key === "name"))) {
      throw new Error("Customer account information can only be edited by its owner or an Administrator.")
    }
  }
  if (name === "services") await ensureUniqueService(shopId, data, id)
  await setDoc(shopDoc(shopId, name, id), { ...data, updatedAt: serverTimestamp() }, {
    merge: true,
  })
}
export async function removeRecord(name: string, id: string) {
  const shopId = businessId()
  await deleteDoc(shopDoc(shopId, name, id))
}

export async function createAppointment(input: BookingInput, availableProviderIds: string[] = []): Promise<void> {
  const shopId = businessId()
  validateBooking(input)
  const user = currentUser()
  const appointment = doc(shopCollection(shopId, "appointments"))
  const notification = doc(shopCollection(shopId, "notifications"))
  await runTransaction(db, async (transaction) => {
    const profile = await transaction.get(doc(db, "users", user.uid))
    const role = profile.data()?.role
    if (!["Administrator", "Manager", "Customer"].includes(role))
      throw new Error("Your role cannot create appointments.")
    if (role === "Customer") {
      const membership = await transaction.get(shopDoc(shopId, "members", user.uid))
      if (!membership.exists())
        throw new Error("Your account is not connected to this shop. Open Switch shop, select this shop again, then retry booking.")
      if (membership.data()?.role !== "Customer")
        throw new Error("Your account's role in this shop does not allow customer booking. Ask the manager to review your membership.")
      if (membership.data()?.name !== profile.data()?.name)
        throw new Error("Your customer name is out of sync with this shop. Open Switch shop and select this shop again to sync it before booking.")
    }
    const service = await transaction.get(shopDoc(shopId, "services", input.serviceId))
    if (!service.exists() || service.data().status !== "Active")
      throw new Error(
        "This service is no longer available. Refresh your selection.",
      )
    const settings = await transaction.get(shopDoc(shopId, "settings", "business"))
    if (role !== "Customer" && input.customerId) {
      const customer = await transaction.get(shopDoc(shopId, "members", input.customerId))
      if (!customer.exists() || customer.data().role !== "Customer")
        throw new Error("This customer has not connected with your shop. Ask them to select your shop, or book them as a walk-in without an account UID.")
    }
    const hours = settings.data()
    if (hours?.shopType === "solo" && input.providerId && input.providerId !== hours.managerProviderId)
      throw new Error("Solo shop bookings must use the manager’s barber profile.")
    if (hours?.bookingSchemaVersion !== 2)
      throw new Error(
        "An Administrator or Manager must finish business setup and legacy booking migration in Settings before new reservations are enabled.",
      )
    const durationMinutes = Number(service.data().durationMinutes)
    const amount = moneyNumber(service.data().amount)
    const slotKeys = bookingSlots(input.time, durationMinutes)
    if (hours?.open && hours?.close) {
      if (
        input.time < hours.open ||
        Number(slotKeys[0]) + durationMinutes >
          Number(hours.close.split(":")[0]) * 60 +
            Number(hours.close.split(":")[1])
      )
        throw new Error(
          "Choose a time within business hours, including the full service duration.",
        )
    }
    const ids = [...new Set(input.providerId ? [input.providerId] : availableProviderIds)]
      .filter((id) => id && (hours?.shopType !== "solo" || id === hours.managerProviderId))
    if (!ids.length) throw new Error("No active providers are available. Please contact the shop.")
    const candidates = await Promise.all(ids.map(async (id) => {
      const [team, calendar] = await Promise.all([
        transaction.get(shopDoc(shopId, "team", id)),
        transaction.get(shopDoc(shopId, "appointmentSchedules", `${id}_${input.date}`)),
      ])
      return { id, active: team.data()?.active, role: team.data()?.role,
        name: String(team.data()?.name || ""), slots: (calendar.data()?.slots || {}) as Record<string, string> }
    }))
    const heldProviderId = reservationProvider(candidates, slotKeys)
    if (!heldProviderId)
      throw new Error(
        input.providerId ? "This provider has an overlapping booking. Choose another time or provider."
          : "The shop has no capacity for the full service at this time. Please choose another time.",
      )
    const provider = candidates.find((candidate) => candidate.id === heldProviderId)!
    const scheduleId = `${heldProviderId}_${input.date}`
    const schedule = shopDoc(shopId, "appointmentSchedules", scheduleId)
    const slots = { ...provider.slots }
    slotKeys.forEach((key) => {
      slots[key] = appointment.id
    })
    transaction.set(appointment, {
      client: role === "Customer" ? profile.data()!.name : input.client.trim(),
      customerId: role === "Customer" ? user.uid : input.customerId || "",
      serviceId: input.serviceId,
      service: service.data().name,
      providerId: input.providerId,
      provider: input.providerId ? provider.name : "To be assigned at shop",
      ...(!input.providerId ? { providerPreference: "any", reservedProviderId: heldProviderId } : {}),
      date: input.date,
      time: input.time,
      startMinute: Number(slotKeys[0]),
      durationMinutes,
      amount,
      startsAt: Timestamp.fromDate(
        new Date(`${input.date}T${input.time}:00+08:00`),
      ),
      scheduleId,
      slotKeys,
      notes: input.notes.trim(),
      status: "Pending",
      paymentStatus: "Unpaid",
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    })
    transaction.set(schedule, {
      slots,
      appointmentId: appointment.id,
      updatedAt: serverTimestamp(),
    })
    transaction.set(notification, {
      userId: role === "Customer" ? user.uid : input.customerId || user.uid,
      title: "Appointment Submitted",
      message: "Your appointment request has been submitted and is waiting for manager approval.",
      appointmentId: appointment.id,
      read: false,
      createdAt: serverTimestamp(),
    })
  })
}
export async function assignAppointmentProvider(id: string, targetId: string) {
  const shopId = businessId()
  const uid = currentUser().uid
  const appointment = shopDoc(shopId, "appointments", id)
  await runTransaction(db, async (transaction) => {
    const [snapshot, actor, target, actorTeam] = await Promise.all([
      transaction.get(appointment),
      transaction.get(doc(db, "users", uid)),
      transaction.get(shopDoc(shopId, "team", targetId)),
      transaction.get(shopDoc(shopId, "team", uid)),
    ])
    const data = snapshot.data()
    if (!data || !canAssignBooking(actor.data()?.role || "", uid, data, targetId,
      actorTeam.data()?.active === true && actorTeam.data()?.role === "Service Provider"))
      throw new Error("This booking is no longer unassigned, or you cannot assign it.")
    if (target.data()?.active !== true || target.data()?.role !== "Service Provider")
      throw new Error("Choose an active service provider.")
    const oldSchedule = shopDoc(shopId, "appointmentSchedules", data.scheduleId)
    const scheduleId = `${targetId}_${data.date}`
    const newSchedule = shopDoc(shopId, "appointmentSchedules", scheduleId)
    const [oldCalendar, newCalendar] = await Promise.all([
      transaction.get(oldSchedule), transaction.get(newSchedule),
    ])
    const keys = data.slotKeys as string[]
    const oldSlots: Record<string, string> = { ...(oldCalendar.data()?.slots || {}) }
    const slots: Record<string, string> = { ...(newCalendar.data()?.slots || {}) }
    if (!keys?.length || keys.some((key) => oldSlots[key] !== id))
      throw new Error("The booking's capacity reservation needs manager review.")
    if (keys.some((key) => slots[key] && slots[key] !== id))
      throw new Error("That provider is booked at this time. Choose another available provider.")
    keys.forEach((key) => { slots[key] = id })
    if (data.scheduleId !== scheduleId) {
      keys.forEach((key) => { delete oldSlots[key] })
      transaction.set(oldSchedule, { slots: oldSlots, appointmentId: id, updatedAt: serverTimestamp() })
    }
    transaction.set(newSchedule, { slots, appointmentId: id, updatedAt: serverTimestamp() })
    transaction.update(appointment, {
      providerId: targetId, provider: target.data()!.name, reservedProviderId: targetId,
      scheduleId, assignedBy: uid, assignedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  })
}

export function subscribeProviderAppointments(
  callback: (records: SmartCutRecord[]) => void,
  onStatus: (status: SyncState, error?: string) => void,
): Unsubscribe {
  const shopId = businessId()
  const lists: SmartCutRecord[][] = [[], []]
  const statuses: SyncState[] = ["connecting", "connecting"]
  const errors: (string | undefined)[] = [undefined, undefined]
  onStatus("connecting")
  const sources = [
    query(shopCollection(shopId, "appointments"), where("providerId", "==", currentUser().uid)),
    query(shopCollection(shopId, "appointments"), where("providerId", "==", ""),
      where("status", "==", "Accepted"), where("providerPreference", "==", "any")),
  ]
  const emit = () => {
    // Prefer the newly assigned version while the unassigned query catches up.
    callback([...new Map([...lists[1], ...lists[0]].map((record) => [record.id, record])).values()])
    onStatus(statuses.includes("error") ? "error" :
      statuses.every((status) => status === "connected") ? "connected" : "connecting",
    errors.find(Boolean))
  }
  const stops = sources.map((source, index) => onSnapshot(source, { includeMetadataChanges: true },
    (snapshot) => {
      lists[index] = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as SmartCutRecord)
      statuses[index] = snapshotSyncState(snapshot.metadata)
      errors[index] = undefined
      emit()
    },
    (error) => {
      lists[index] = []
      statuses[index] = "error"
      errors[index] = friendlyError(error)
      emit()
    },
  ))
  return () => stops.forEach((stop) => stop())
}
export async function updateAppointmentStatus(id: string, status: string, reason = "") {
  const shopId = businessId()
  const appointment = shopDoc(shopId, "appointments", id)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(appointment)
    if (!snapshot.exists()) throw new Error("Appointment not found.")
    const data = snapshot.data()
    const user = currentUser()
    const profile = await transaction.get(doc(db, "users", user.uid))
    const provider = await transaction.get(shopDoc(shopId, "team", user.uid))
    if (status === "In Progress" && !data.providerId)
      throw new Error("Assign a service provider before starting the service.")
    if (!canChangeAppointment(profile.data()?.role || "", data.status, status, data.providerId === user.uid && provider.data()?.active === true && provider.data()?.role === "Service Provider", data.customerId === user.uid))
      throw new Error("Your role cannot perform this action at the current appointment stage.")
    if (reason.length > 1000) throw new Error("Keep the rejection reason under 1,000 characters.")
    const schedule = data.scheduleId
      ? shopDoc(shopId, "appointmentSchedules", data.scheduleId)
      : null
    const calendar =
      ["Cancelled", "Rejected"].includes(status) && schedule
        ? await transaction.get(schedule)
        : null
    if (calendar?.exists() && schedule) {
      const slots = { ...calendar.data().slots }
      ;(data.slotKeys as string[]).forEach((key) => {
        if (slots[key] === id) delete slots[key]
      })
      transaction.set(schedule, {
        slots,
        appointmentId: id,
        updatedAt: serverTimestamp(),
      })
    }
    const changes: Record<string, unknown> = { status, updatedAt: serverTimestamp() }
    if (status === "Accepted") changes.acceptedAt = serverTimestamp()
    if (status === "Rejected") { changes.rejectedAt = serverTimestamp(); changes.rejectionReason = reason.trim() }
    if (status === "In Progress") changes.startedAt = serverTimestamp()
    if (status === "Completed") changes.completedAt = serverTimestamp()
    transaction.update(appointment, changes)
    if (data.customerId) {
      const updates: Record<string, [string, string]> = {
        Accepted: ["Appointment Accepted", "Your appointment has been accepted by the manager."],
        Rejected: ["Appointment Rejected", "Unfortunately, your appointment request has been rejected."],
        "In Progress": ["Service Started", "Your service has started."],
        Completed: ["Service Completed", "Your service has been completed. Please rate your experience."],
        Cancelled: ["Appointment Cancelled", "Your appointment has been cancelled."],
      }
      const [title, message] = updates[status]
      transaction.set(doc(shopCollection(shopId, "notifications")), { userId: data.customerId, title, message, appointmentId: id, read: false, createdAt: serverTimestamp() })
    }
  })
}
export async function submitAppointmentReview(id: string, serviceRating: number, providerRating: number, comment: string) {
  if (![serviceRating, providerRating].every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) throw new Error("Select a 1–5 star rating for both your service and provider.")
  if (comment.length > 1000) throw new Error("Keep your feedback under 1,000 characters.")
  const shopId = businessId()
  const user = currentUser()
  await runTransaction(db, async (transaction) => {
    const appointment = shopDoc(shopId, "appointments", id)
    const review = shopDoc(shopId, "reviews", id)
    const [booking, existing, profile] = await Promise.all([transaction.get(appointment), transaction.get(review), transaction.get(doc(db, "users", user.uid))])
    const data = booking.data()
    if (!data || profile.data()?.role !== "Customer" || data.customerId !== user.uid || data.status !== "Completed" || existing.exists()) throw new Error("Only your completed, unreviewed appointment can be rated.")
    if (typeof data.providerId !== "string" || !data.providerId) throw new Error("This legacy appointment needs its service provider linked before it can be rated. Please contact the manager.")
    transaction.set(review, { appointmentId: id, customerId: user.uid, providerId: data.providerId, serviceId: data.serviceId || "", serviceRating, providerRating, rating: serviceRating, comment: comment.trim(), createdBy: user.uid, createdAt: serverTimestamp() })
    transaction.update(appointment, { status: "Rated", reviewId: id, ratedAt: serverTimestamp(), updatedAt: serverTimestamp() })
  })
}
export async function checkoutAppointment(id: string, method: string) {
  const shopId = businessId()
  if (!["Cash", "GCash", "Card", "Bank transfer"].includes(method))
    throw new Error("Select a payment method.")
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const appointment = shopDoc(shopId, "appointments", id)
    const payment = shopDoc(shopId, "payments", id)
    const [snapshot, actor] = await Promise.all([
      transaction.get(appointment),
      transaction.get(doc(db, "users", uid)),
    ])
    const data = snapshot.data()
    if (!data || !["Completed", "Rated"].includes(appointmentStatus(data.status)))
      throw new Error("Complete the service before recording payment.")
    if (data.paymentStatus === "Paid")
      throw new Error("This appointment has already been paid.")
    const role = actor.data()?.role || ""
    const provider = role === "Service Provider"
      ? await transaction.get(shopDoc(shopId, "team", uid)) : null
    if (!canRecordAppointmentPayment(role, data.status, data.paymentStatus,
      data.providerId === uid && provider?.data()?.active === true && provider?.data()?.role === "Service Provider"))
      throw new Error("Only management or the assigned active service provider can record this payment.")
    // Providers can create a receipt but cannot read financial collections.
    // The appointment is the transaction lock; rules also require absent receipts.
    if (role !== "Service Provider" && (await transaction.get(payment)).exists())
      throw new Error("This appointment has already been paid.")
    if (!Number.isFinite(data.amount) || data.amount < 0)
      throw new Error(
        "This legacy appointment needs a valid numeric amount before checkout.",
      )
    const payload = {
      appointmentId: id,
      client: data.client,
      customerId: data.customerId || "",
      service: data.service,
      providerId: data.providerId,
      provider: data.provider,
      amount: data.amount,
      method,
      status: "Paid",
      currency: "PHP",
      date: data.date,
      createdBy: uid,
      createdAt: serverTimestamp(),
    }
    transaction.set(payment, payload)
    transaction.set(shopDoc(shopId, "sales", id), payload)
    transaction.update(appointment, {
      paymentStatus: "Paid",
      updatedAt: serverTimestamp(),
    })
    if (data.customerId)
      transaction.set(doc(shopCollection(shopId, "notifications")), {
        userId: data.customerId,
        title: "Payment recorded",
        message: `${data.service} · PHP ${data.amount.toFixed(2)}.`,
        read: false,
        appointmentId: id,
        createdAt: serverTimestamp(),
      })
  })
}
export function subscribeNotifications(
  callback: (records: SmartCutRecord[]) => void,
  onStatus?: (status: SyncState, error?: string) => void,
) {
  const shopId = businessId()
  onStatus?.("connecting")
  return onSnapshot(
    query(
      shopCollection(shopId, "notifications"),
      where("userId", "==", currentUser().uid),
    ),
    { includeMetadataChanges: true },
    (snapshot) => {
      callback(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })))
      onStatus?.(snapshotSyncState(snapshot.metadata))
    },
    (error) => onStatus?.("error", friendlyError(error)),
  )
}

export function subscribeFeedback(role: UserRole, callback: (records: SmartCutRecord[]) => void,
  onStatus: (status: SyncState, error?: string) => void): Unsubscribe {
  const uid = currentUser().uid
  onStatus("connecting")
  const reports = collection(db, "feedback")
  const source = role === "Administrator" ? reports : query(reports, where("senderId", "==", uid))
  return onSnapshot(source, { includeMetadataChanges: true }, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as SmartCutRecord))
    onStatus(snapshotSyncState(snapshot.metadata))
  }, (error) => { callback([]); onStatus("error", friendlyError(error)) })
}

export async function submitFeedback(input: { subject: string; message: string; category: string; shopId?: string }) {
  const subject = input.subject.trim()
  const message = input.message.trim()
  if (subject.length < 2 || subject.length > 120 || message.length < 10 || message.length > 2000)
    throw new Error("Enter a subject of 2–120 characters and a message of 10–2,000 characters.")
  if (!["Bug", "Booking", "Payment", "Account", "Other"].includes(input.category))
    throw new Error("Choose a valid report category.")
  const uid = currentUser().uid
  const shopId = input.shopId || ""
  if (shopId.includes("/") || shopId.length > 128) throw new Error("Choose a valid shop for this report.")
  const report = doc(collection(db, "feedback"))
  await runTransaction(db, async (transaction) => {
    const profile = await transaction.get(doc(db, "users", uid))
    const actor = profile.data()
    if (!actor || !["Manager", "Service Provider", "Customer"].includes(actor.role))
      throw new Error("Feedback submission is available to Manager, Service Provider, and Customer accounts.")
    let shopName = ""
    if (shopId) {
      const [shop, member] = await Promise.all([
        transaction.get(doc(db, "shops", shopId)),
        transaction.get(shopDoc(shopId, "members", uid)),
      ])
      if (!shop.exists() || !member.exists())
        throw new Error("Select a shop you are connected to, or send a general app report.")
      shopName = String(shop.data().name)
    }
    transaction.set(report, {
      subject, message, category: input.category, shopId, shopName,
      senderId: uid, senderName: String(actor.name), senderRole: actor.role,
      status: "New", createdAt: serverTimestamp(),
    })
  })
}

export async function reviewFeedback(id: string, status: "New" | "Reviewed") {
  if (!id || id.includes("/") || id.length > 128 || !["New", "Reviewed"].includes(status))
    throw new Error("Choose a valid feedback report and status.")
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const report = doc(db, "feedback", id)
    const [profile, snapshot] = await Promise.all([
      transaction.get(doc(db, "users", uid)), transaction.get(report),
    ])
    if (profile.data()?.role !== "Administrator") throw new Error("Only an Administrator can review feedback.")
    if (!snapshot.exists()) throw new Error("This feedback report is no longer available.")
    transaction.update(report, { status, reviewedBy: uid, updatedAt: serverTimestamp() })
  })
}
export async function markNotificationsRead(records: SmartCutRecord[]) {
  const shopId = businessId()
  for (let offset = 0; offset < records.length; offset += 400) {
    const batch = writeBatch(db)
    records
      .slice(offset, offset + 400)
      .forEach((record) =>
        batch.update(shopDoc(shopId, "notifications", record.id), { read: true }),
      )
    await batch.commit()
  }
}
export async function saveBusinessSettings(data: DocumentData) {
  const facebookUrl = normalizeFacebookPageUrl(data.facebookUrl ?? "")
  if (facebookUrl === null) throw new Error("Enter a valid HTTPS Facebook page link, or leave it blank.")
  const shopId = businessId()
  const settings = await getDocFromServer(shopDoc(shopId, "settings", "business"))
  const previous = settings.data()
  const uid = currentUser().uid
  const profile = await getDoc(shopDoc(shopId, "members", uid))
  const team = await getDocsFromServer(shopCollection(shopId, "team"))
  if (!["team", "solo"].includes(data.shopType)) throw new Error("Choose a shop type.")
  const changingShopType = (previous?.shopType || "team") !== data.shopType
  if (changingShopType && data.shopType === "solo" && team.docs.some((item) => item.id !== uid && item.data().active && item.data().role === "Service Provider"))
    throw new Error("Deactivate other service providers before switching to a solo shop.")
  const appointments = await getDocsFromServer(shopCollection(shopId, "appointments"))
  if (
    previous?.bookingSchemaVersion !== 2 && appointments.docs.some(
      (item) =>
        !item.data().scheduleId &&
        !["Completed", "Rated", "Rejected", "Cancelled"].includes(item.data().status),
    )
  ) {
    throw new Error(
      "Active legacy bookings need migration before new reservations can be enabled. Review their real service and provider IDs in Firestore, or cancel obsolete legacy bookings from Appointments. No booking records have been changed.",
    )
  }
  if (changingShopType && appointments.docs.some((item) =>
    !["Completed", "Rated", "Rejected", "Cancelled"].includes(appointmentStatus(item.data().status))))
    throw new Error("Finish or cancel active appointments before changing the shop type.")
  if (previous?.barberAvailable !== false && data.barberAvailable === false && appointments.docs.some((item) => (item.data().providerId === uid || item.data().reservedProviderId === uid) &&
    !["Completed", "Rated", "Rejected", "Cancelled"].includes(appointmentStatus(item.data().status))))
    throw new Error("Finish or cancel your assigned appointments before making your barber profile unavailable.")
  const menu = await getDocsFromServer(shopCollection(shopId, "services"))
  const batch = writeBatch(db)
  batch.set(
    shopDoc(shopId, "settings", "business"),
    {
      ...data,
      facebookUrl,
      managerProviderId: data.shopType === "solo" ? uid : previous?.managerProviderId || uid,
      managerWorksAsBarber: data.shopType === "solo" || data.managerWorksAsBarber === true,
      currency: "PHP",
      timezone: "Asia/Manila",
      bookingSchemaVersion: 2,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  if (data.shopType === "solo" || data.managerWorksAsBarber === true) batch.set(shopDoc(shopId, "team", uid), {
    name: profile.data()?.name, role: "Service Provider", active: data.barberAvailable !== false, updatedAt: serverTimestamp(),
  })
  else if (team.docs.some((item) => item.id === uid)) {
    if (appointments.docs.some((item) => item.data().providerId === uid && !["Completed", "Rated", "Rejected", "Cancelled"].includes(appointmentStatus(item.data().status))))
      throw new Error("Finish your assigned appointments before disabling your barber profile.")
    batch.set(shopDoc(shopId, "team", uid), { active: false, updatedAt: serverTimestamp() }, { merge: true })
  }
  batch.update(doc(db, "shops", shopId), {
    name: data.name, location: data.address || "", description: data.description || "",
    logoUrl: data.logoUrl || "", themeColor: data.themeColor || "forest", active: data.active !== false,
    acceptingCustomers: data.acceptingCustomers !== false,
    open: data.open,
    close: data.close,
    facebookUrl,
    serviceCategories: [...new Set(menu.docs.filter((item) => item.data().status === "Active").map((item) => String(item.data().category)))],
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}
export async function createPayrollStatement(data: DocumentData) {
  const shopId = businessId()
  const statement = doc(shopCollection(shopId, "payroll"))
  const periodsRef = shopDoc(shopId, "payrollPeriods", data.providerId)
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(periodsRef)
    const periods = snapshot.data()?.periods || {}
    if (
      Object.values(periods).some((value) => {
        const period = value as Record<"start" | "end", string>
        return period.start <= data.end && period.end >= data.start
      })
    )
      throw new Error(
        "An overlapping payroll statement was already recorded for this provider.",
      )
    transaction.set(statement, {
      ...data,
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
    transaction.set(periodsRef, {
      periods: {
        ...periods,
        [statement.id]: { start: data.start, end: data.end },
      },
      updatedAt: serverTimestamp(),
    })
  })
}
export function subscribeBusinessSettings(
  callback: (data: DocumentData) => void,
  onStatus?: (status: SyncState, error?: string) => void,
): Unsubscribe {
  const shopId = businessId()
  onStatus?.("connecting")
  return onSnapshot(
    shopDoc(shopId, "settings", "business"),
    { includeMetadataChanges: true },
    (snapshot) => {
      callback(snapshot.data() || {})
      onStatus?.(snapshotSyncState(snapshot.metadata))
    },
    (error) => onStatus?.("error", friendlyError(error)),
  )
}

export function subscribeShopSmsSettings(
  shopId: string,
  callback: (number: string) => void,
  onStatus: (status: SyncState, error?: string) => void,
): Unsubscribe {
  onStatus("connecting")
  return onSnapshot(
    shopDoc(shopId, "settings", "sms"),
    { includeMetadataChanges: true },
    (snapshot) => {
      callback(String(snapshot.data()?.number || ""))
      onStatus(snapshotSyncState(snapshot.metadata))
    },
    (error) => onStatus("error", friendlyError(error)),
  )
}

export async function saveShopSmsNumber(shopId: string, value: string) {
  if (businessId() !== shopId)
    throw new Error("This SMS number does not belong to the selected shop. Reload the workspace and try again.")
  const number = normalizeSmsNumber(value)
  if (number === null)
    throw new Error("Enter a Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX.")
  const reference = shopDoc(shopId, "settings", "sms")
  await runTransaction(db, async (transaction) => {
    const previous = await transaction.get(reference)
    const shop = await transaction.get(doc(db, "shops", shopId))
    if (!shop.exists()) throw new Error("This shop no longer exists.")
    transaction.set(reference, {
      number,
      // Only bookings after opt-in qualify; edits retain the original activation.
      enabledAt: previous.data()?.number
        ? previous.data()?.enabledAt
        : serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
}

async function createWalkInQuote(
  shopId: string, walkInId: string, serviceIds: string[], uid: string,
  references: ReturnType<typeof shopDoc>[],
) {
  let previous: ReturnType<typeof shopDoc> | null = null
  // One service per immutable quote step keeps rule reads bounded, regardless
  // of selection size. Only the final visit/ledgers count as a paid transaction.
  for (const serviceId of serviceIds) {
    if (businessId() !== shopId || currentUser().uid !== uid)
      throw new Error("The selected shop or account changed. Reopen the walk-in form.")
    const reference = shopDoc(shopId, "walkInQuotes", crypto.randomUUID())
    references.push(reference)
    const previousRef = previous
    await runTransaction(db, async (transaction) => {
      const [service, prior] = await Promise.all([
        transaction.get(shopDoc(shopId, "services", serviceId)),
        previousRef ? transaction.get(previousRef) : Promise.resolve(null),
      ])
      const item = service.data()
      if (!item || item.status !== "Active" || !Number.isFinite(item.amount) || item.amount < 0)
        throw new Error("One of these services is no longer available. Review the selection.")
      if (previousRef && !prior?.exists())
        throw new Error("The price quote expired or was removed. Retry the payment.")
      const before = prior?.data()
      const amountCents = (before?.amountCents || 0) + Math.round(item.amount * 100)
      if (!Number.isSafeInteger(amountCents))
        throw new Error("The total is too large to record safely.")
      transaction.set(reference, {
        walkInId, previousQuoteId: previousRef?.id || "", serviceId,
        serviceIds: [...(before?.serviceIds || []), serviceId],
        serviceNames: [...(before?.serviceNames || []), String(item.name)],
        serviceAmounts: [...(before?.serviceAmounts || []), Number(item.amount)],
        amountCents, createdBy: uid, createdAt: serverTimestamp(),
        quotedAt: before?.quotedAt || serverTimestamp(),
      })
    })
    previous = reference
  }
  return previous!
}

export async function createPaidWalkIn(id: string, rawInput: {
  client: string; email: string; phone: string; serviceIds: string[]
  requestedProviderId: string; method: string; quotedTotal: number
}) {
  const input = normalizeWalkInInput(rawInput)
  const shopId = businessId()
  const user = currentUser()
  const visitRef = shopDoc(shopId, "walkins", id)
  // A lost payment acknowledgement must not prepare a new quote or charge twice.
  const saved = await runTransaction(db, async (transaction) => {
    const [actor, existing] = await Promise.all([
      transaction.get(doc(db, "users", user.uid)), transaction.get(visitRef),
    ])
    if (!["Administrator", "Manager"].includes(actor.data()?.role))
      throw new Error("Only shop management can record a walk-in payment.")
    if (!existing.exists()) return null
    if (existing.data().createdBy !== user.uid)
      throw new Error("This walk-in belongs to another account.")
    return existing.data()
  })
  if (saved) return saved
  const quotes: ReturnType<typeof shopDoc>[] = []
  try {
    const quoteRef = await createWalkInQuote(shopId, id, input.serviceIds, user.uid, quotes)
    if (businessId() !== shopId || currentUser().uid !== user.uid)
      throw new Error("The selected shop or account changed. Reopen the walk-in form.")
    return await runTransaction(db, async (transaction) => {
      const [existing, actor, shop, quote, ...menu] = await Promise.all([
        transaction.get(visitRef),
        transaction.get(doc(db, "users", user.uid)),
        transaction.get(doc(db, "shops", shopId)),
        transaction.get(quoteRef),
        ...input.serviceIds.map((serviceId: string) =>
          transaction.get(shopDoc(shopId, "services", serviceId))),
      ])
      if (!["Administrator", "Manager"].includes(actor.data()?.role))
        throw new Error("Only shop management can record a walk-in payment.")
      if (existing.exists()) {
        if (existing.data().createdBy !== user.uid)
          throw new Error("This walk-in belongs to another account.")
        return existing.data() // Stable form ID makes a retry safe after a lost acknowledgement.
      }
      if (!shop.exists() || !shop.data().active)
        throw new Error("This shop is not accepting new services.")
      if (menu.some((item) => !item.exists() || item.data().status !== "Active" ||
        !Number.isFinite(item.data().amount) || item.data().amount < 0))
        throw new Error("One of these services is no longer available. Review the selection.")
      const settings = await transaction.get(shopDoc(shopId, "settings", "business"))
      if (settings.data()?.shopType === "solo" &&
        input.requestedProviderId !== settings.data()?.managerProviderId)
        throw new Error("Solo shop walk-ins must use the manager's barber profile.")
      const provider = await transaction.get(shopDoc(shopId, "team", input.requestedProviderId))
      if (!provider.exists() || provider.data().active !== true ||
        provider.data().role !== "Service Provider")
        throw new Error("Choose a specific active service provider.")
      const serviceNames = menu.map((item) => String(item.data()!.name))
      const serviceAmounts = menu.map((item) => Number(item.data()!.amount))
      const amountCents = serviceAmounts.reduce((sum, value) => sum + Math.round(value * 100), 0)
      const amount = amountCents / 100
      const quoted = quote.data()
      if (!quoted || quoted.amountCents !== amountCents ||
        JSON.stringify([quoted.serviceIds, quoted.serviceNames, quoted.serviceAmounts]) !==
          JSON.stringify([input.serviceIds, serviceNames, serviceAmounts]))
        throw new Error("The service selection or prices changed. Review the total and try again.")
      if (Math.round(amount * 100) !== Math.round(input.quotedTotal * 100))
        throw new Error("The service prices changed. Review the new total before recording payment.")
      const financial = {
        type: "Walk-in", walkInId: id,
        client: input.client, customerId: "",
        service: serviceNames.join(" + "), serviceIds: input.serviceIds,
        providerId: input.requestedProviderId,
        provider: String(provider.data()!.name),
        amount, amountCents, method: input.method, status: "Paid",
        currency: "PHP", date: manilaDate(),
        createdBy: user.uid, createdAt: serverTimestamp(),
      }
      transaction.set(visitRef, {
        ...financial, status: "Paid", completedAt: serverTimestamp(),
        quoteId: quoteRef.id,
        email: input.email, phone: input.phone,
        serviceNames, serviceAmounts,
        requestedProviderId: input.requestedProviderId,
        acceptedBy: "", acceptedByName: "",
        paymentStatus: "Paid", paidAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      transaction.set(shopDoc(shopId, "payments", id), financial)
      transaction.set(shopDoc(shopId, "sales", id), financial)
      return financial
    })
  } finally {
    // Staging quotes are not business records. Cleanup failure must never turn
    // an acknowledged payment into an apparent failure and encourage a retry.
    void Promise.allSettled(quotes.map((reference) => deleteDoc(reference)))
  }
}

export async function editManagerRecordDate(
  shopId: string, collectionName: string, original: SmartCutRecord, value: string, timeValue?: string,
) {
  // Retain the API only to explicitly reject calls from restored/older clients.
  throw new Error("Record date and time editing is disabled.")
}

export async function readAdminShopRecord(collectionName: string, id: string): Promise<{ collectionName: string; shopId: string; record: SmartCutRecord }> {
  if (!["appointments", "walkins", "sales", "payments"].includes(collectionName))
    throw new Error("Unsupported record.")
  const shopId = businessId()
  const snapshot = await getDocFromServer(shopDoc(shopId, collectionName, id))
  if (!snapshot.exists() && collectionName === "payments") return readAdminShopRecord("sales", id)
  if (!snapshot.exists()) throw new Error("This record no longer exists.")
  const data = snapshot.data()
  const linkedCollection = data.type === "Walk-in" ? "walkins" : "appointments"
  const linkedId = String(data.walkInId || data.appointmentId || "")
  if (["sales", "payments"].includes(collectionName) && linkedId) {
    const linked = await getDocFromServer(shopDoc(shopId, linkedCollection, linkedId))
    if (linked.exists()) return { collectionName: linkedCollection, shopId, record: { ...linked.data(), id: linked.id } as SmartCutRecord }
  }
  return { collectionName, shopId, record: { ...data, id } as SmartCutRecord }
}

export async function editAdminShopRecord(
  shopId: string, collectionName: string, original: SmartCutRecord, input: Record<string, unknown>,
) {
  if (businessId() !== shopId) throw new Error("The selected shop changed. Reopen this record.")
  if (!["appointments", "walkins", "sales", "payments"].includes(collectionName))
    throw new Error("Unsupported record.")
  const user = currentUser()
  const source = shopDoc(shopId, collectionName, original.id)
  await runTransaction(db, async (transaction) => {
    const [actor, snapshot, sale, payment, shop, membership] = await Promise.all([
      transaction.get(doc(db, "users", user.uid)), transaction.get(source),
      transaction.get(shopDoc(shopId, "sales", original.id)),
      transaction.get(shopDoc(shopId, "payments", original.id)),
      transaction.get(doc(db, "shops", shopId)),
      transaction.get(shopDoc(shopId, "members", user.uid)),
    ])
    if (actor.data()?.role !== "Administrator" && !(actor.data()?.role === "Manager" &&
      membership.data()?.role === "Manager" && shop.data()?.ownerId === user.uid))
      throw new Error("Only an Administrator or this shop's owner can edit shop records.")
    if (!snapshot.exists()) throw new Error("This record no longer exists.")
    const before = snapshot.data()
    const revision = (value: unknown) => JSON.stringify(value ?? null)
    if (revision(before.updatedAt) !== revision(original.updatedAt) ||
      [...recordEditFields(original).map(([key]) => key), "date", "time", "durationMinutes", "startsAt", "startMinute"]
        .some((key) => revision(before[key]) !== revision(original[key])))
      throw new Error("This record changed while you were editing. Cancel and reopen it to use the latest version.")
    const changes: DocumentData = normalizeAdminEdit(original, input)
    if (collectionName === "walkins" && changes.providerId !== before.providerId) {
      const provider = await transaction.get(shopDoc(shopId, "team", String(changes.providerId)))
      if (!provider.exists() || provider.data().active !== true || provider.data().role !== "Service Provider")
        throw new Error("Choose a specific active service provider for the walk-in.")
      changes.provider = String(provider.data().name)
      changes.requestedProviderId = changes.providerId
    }
    if ((sale.exists() || payment.exists()) && changes.paymentStatus === "Unpaid")
      throw new Error("A collected payment cannot be changed to Unpaid. Record a refund separately.")
    const audit = { editedByAdmin: user.uid, adminEditedAt: serverTimestamp(), updatedAt: serverTimestamp() }
    if (collectionName === "appointments") {
      const providerId = String(changes.providerId || before.reservedProviderId || "")
      const keys = changes.time && changes.durationMinutes
        ? adminBookingSlots(String(changes.time), Number(changes.durationMinutes)) : []
      const reserve = !["Cancelled", "Rejected"].includes(String(changes.status)) && providerId && keys.length
      const nextScheduleId = reserve ? `${providerId}_${changes.date}` : ""
      const scheduleIds = [...new Set([String(before.scheduleId || ""), nextScheduleId].filter(Boolean))]
      const calendars = await Promise.all(scheduleIds.map((id) =>
        transaction.get(shopDoc(shopId, "appointmentSchedules", id))))
      const slotsById = new Map(calendars.map((calendar) => [calendar.id, { ...(calendar.data()?.slots || {}) }]))
      for (const slots of slotsById.values()) {
        for (const [key, value] of Object.entries(slots)) if (value === original.id) delete slots[key]
      }
      if (nextScheduleId) {
        const slots = slotsById.get(nextScheduleId)!
        if (keys.some((key) => slots[key] && slots[key] !== original.id))
          throw new Error("This provider already has a booking at the selected date and time.")
        keys.forEach((key) => { slots[key] = original.id })
      }
      for (const [id, slots] of slotsById) transaction.set(shopDoc(shopId, "appointmentSchedules", id), {
        slots, appointmentId: original.id, updatedAt: serverTimestamp(),
      })
      changes.scheduleId = nextScheduleId
      changes.slotKeys = keys
      changes.providerPreference = changes.providerId ? "specific" : "any"
      changes.reservedProviderId = changes.providerId ? "" : providerId
    }
    transaction.update(source, { ...changes, ...audit })
    const financial: DocumentData = {}
    for (const key of ["client", "customerId", "service", "serviceIds", "provider", "providerId", "date", "amount", "amountCents", "method"])
      if (key in changes) financial[key] = changes[key]
    for (const receipt of [sale, payment]) {
      if (receipt.exists() && receipt.ref.path !== source.path)
        transaction.update(receipt.ref, { ...financial, ...audit })
    }
  })
}

export async function deleteShopRecord(
  shopId: string, collectionName: string, original: SmartCutRecord,
) {
  if (businessId() !== shopId) throw new Error("The selected shop changed. Reopen this record.")
  if (!["appointments", "walkins", "sales", "payments"].includes(collectionName))
    throw new Error("Unsupported record.")
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const source = shopDoc(shopId, collectionName, original.id)
    const [actor, membership, snapshot, sale, payment] = await Promise.all([
      transaction.get(doc(db, "users", uid)),
      transaction.get(shopDoc(shopId, "members", uid)),
      transaction.get(source),
      transaction.get(shopDoc(shopId, "sales", original.id)),
      transaction.get(shopDoc(shopId, "payments", original.id)),
    ])
    const role = actor.data()?.role
    if (role !== "Administrator" && !(TEMPORARY_MANAGER_RECORD_DELETION &&
      role === "Manager" && membership.data()?.role === "Manager"))
      throw new Error("Only an Administrator or this shop's authorized Manager can delete records.")
    const before = snapshot.data()
    const revision = (value: unknown) => JSON.stringify(value ?? null)
    if (before && (revision(before.updatedAt) !== revision(original.updatedAt) ||
      recordEditFields(original).some(([key]) => revision(before[key]) !== revision(original[key]))))
      throw new Error("This record changed. Reopen it before deleting.")
    const data = before || original
    const primaryName = ["appointments", "walkins"].includes(collectionName) ? collectionName
      : data.walkInId ? "walkins" : data.appointmentId ? "appointments" : ""
    const primaryId = ["appointments", "walkins"].includes(collectionName) ? original.id
      : String(data.walkInId || data.appointmentId || "")
    if (primaryId && primaryId !== original.id)
      throw new Error("This legacy record has a different linked ID. Ask an Administrator to review it.")
    const primaryRef = primaryName ? shopDoc(shopId, primaryName, primaryId) : null
    const primary = primaryRef ? (primaryRef.path === source.path ? snapshot : await transaction.get(primaryRef)) : null
    const scheduleId = primaryName === "appointments" ? String(primary?.data()?.scheduleId || "") : ""
    const scheduleRef = scheduleId ? shopDoc(shopId, "appointmentSchedules", scheduleId) : null
    const calendar = scheduleRef ? await transaction.get(scheduleRef) : null
    const reviewRef = primaryName === "appointments" ? shopDoc(shopId, "reviews", primaryId) : null
    const review = reviewRef ? await transaction.get(reviewRef) : null
    // All reads precede writes; retries cannot partially delete financial data.
    if (calendar?.exists() && scheduleRef) {
      const slots = { ...(calendar.data()?.slots || {}) }
      for (const [key, holder] of Object.entries(slots)) if (holder === primaryId) delete slots[key]
      transaction.set(scheduleRef, { slots, appointmentId: primaryId, updatedAt: serverTimestamp() })
    }
    const removals = new Map([snapshot, sale, payment, primary, review]
      .filter((item) => item?.exists()).map((item) => [item!.ref.path, item!.ref]))
    for (const reference of removals.values()) transaction.delete(reference)
  })
}

export async function claimWalkIn(id: string, providerId: string) {
  const shopId = businessId()
  const user = currentUser()
  const visitRef = shopDoc(shopId, "walkins", id)
  await runTransaction(db, async (transaction) => {
    const [visit, actor, provider] = await Promise.all([
      transaction.get(visitRef),
      transaction.get(doc(db, "users", user.uid)),
      transaction.get(shopDoc(shopId, "team", providerId || user.uid)),
    ])
    if (!visit.exists() ||
      !canClaimWalkIn(actor.data()?.role, user.uid, visit.data(), providerId))
      throw new Error("This walk-in was already accepted or is assigned to another provider.")
    if (!provider.exists() || !provider.data().active || provider.data().role !== "Service Provider")
      throw new Error("Choose an active service provider.")
    const assigned = { providerId, provider: String(provider.data().name), updatedAt: serverTimestamp() }
    transaction.update(visitRef, {
      ...assigned, status: "Accepted",
      acceptedBy: user.uid, acceptedByName: String(actor.data()?.name || "Team member"),
      acceptedAt: serverTimestamp(),
    })
    // Keep the already-paid Sales and receipt records consistent with assignment.
    transaction.update(shopDoc(shopId, "sales", id), assigned)
    transaction.update(shopDoc(shopId, "payments", id), assigned)
  })
}

export async function advanceWalkIn(id: string, next: "In Service" | "Paid") {
  const shopId = businessId()
  const user = currentUser()
  const visitRef = shopDoc(shopId, "walkins", id)
  await runTransaction(db, async (transaction) => {
    const [visit, actor] = await Promise.all([
      transaction.get(visitRef), transaction.get(doc(db, "users", user.uid)),
    ])
    if (!visit.exists() || !canAdvanceWalkIn(actor.data()?.role, user.uid, visit.data(), next))
      throw new Error("This walk-in changed or you cannot update its service status.")
    transaction.update(visitRef, {
      status: next, updatedAt: serverTimestamp(),
      ...(next === "In Service" ? { startedAt: serverTimestamp() } : { completedAt: serverTimestamp() }),
    })
  })
}
