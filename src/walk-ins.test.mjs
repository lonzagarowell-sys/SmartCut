import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import {
  normalizeWalkInInput,
  canClaimWalkIn,
  canAdvanceWalkIn,
  walkInPaymentMethods,
} from "./walk-ins.mjs"

const valid = {
  client: " Maria Santos ",
  email: "",
  phone: "",
  serviceIds: ["cut", "wash"],
  requestedProviderId: "barber-one",
  method: "Cash",
  quotedTotal: 175,
}

test("walk-ins need no reservation date, time, email or phone", () => {
  const normalized = normalizeWalkInInput(valid)
  assert.equal(normalized.client, "Maria Santos")
  assert.equal(normalized.email, "")
  assert.equal(normalized.phone, "")
  assert.equal("date" in normalized, false)
  assert.equal("time" in normalized, false)
})

test("walk-in validation rejects invalid payment, duplicate services and unsafe input", () => {
  for (const input of [
    { ...valid, client: "A" },
    { ...valid, email: "bad-email" },
    { ...valid, serviceIds: [] },
    { ...valid, serviceIds: ["cut", "cut"] },
    { ...valid, serviceIds: ["other/shop"] },
    { ...valid, method: "Unconfirmed" },
    { ...valid, method: "Card" },
    { ...valid, requestedProviderId: "" },
    { ...valid, requestedProviderId: "   " },
    { ...valid, requestedProviderId: null },
    { ...valid, requestedProviderId: "other/shop" },
    { ...valid, quotedTotal: NaN },
  ])
    assert.throws(() => normalizeWalkInInput(input))
})

test("walk-in methods are exactly Cash and E-wallet, with a specific provider required", () => {
  assert.deepEqual(walkInPaymentMethods, ["Cash", "E-wallet"])
  assert.equal(normalizeWalkInInput({ ...valid, method: "E-wallet" }).requestedProviderId, "barber-one")
  assert.throws(() => normalizeWalkInInput({ ...valid, requestedProviderId: "" }), /specific active service provider/)
})

test("walk-ins accept selections beyond five services without an arbitrary count cap", () => {
  for (const count of [3, 4, 5, 6, 10, 50]) {
    const serviceIds = Array.from({ length: count }, (_, index) => `service-${index}`)
    assert.equal(normalizeWalkInInput({ ...valid, serviceIds }).serviceIds.length, count)
  }
})

test("claim eligibility honors the requested provider and prevents reclaiming", () => {
  const pending = { status: "Pending", acceptedBy: "", requestedProviderId: "" }
  assert.equal(canClaimWalkIn("Manager", "manager", pending, "barber"), true)
  assert.equal(
    canClaimWalkIn("Service Provider", "barber", pending, "barber"),
    true,
  )
  assert.equal(
    canClaimWalkIn("Service Provider", "other", pending, "barber"),
    false,
  )
  assert.equal(canClaimWalkIn("Customer", "customer", pending, "barber"), false)
  assert.equal(
    canClaimWalkIn(
      "Manager",
      "manager",
      { ...pending, requestedProviderId: "other" },
      "barber",
    ),
    false,
  )
  assert.equal(
    canClaimWalkIn(
      "Manager",
      "manager",
      { ...pending, status: "Accepted", acceptedBy: "barber" },
      "barber",
    ),
    false,
  )
})

test("service lifecycle cannot skip acceptance or complete an unpaid visit", () => {
  const visit = {
    status: "Accepted",
    providerId: "barber",
    paymentStatus: "Paid",
  }
  assert.equal(
    canAdvanceWalkIn("Service Provider", "barber", visit, "In Service"),
    true,
  )
  assert.equal(
    canAdvanceWalkIn("Service Provider", "other", visit, "In Service"),
    false,
  )
  assert.equal(canAdvanceWalkIn("Manager", "manager", visit, "Paid"), false)
  assert.equal(
    canAdvanceWalkIn(
      "Manager",
      "manager",
      { ...visit, status: "In Service" },
      "Paid",
    ),
    true,
  )
  assert.equal(
    canAdvanceWalkIn(
      "Manager",
      "manager",
      { ...visit, status: "In Service", paymentStatus: "Unpaid" },
      "Paid",
    ),
    false,
  )
})

// Exercise the actual backend functions against a transactional in-memory SDK.
// These are not Firestore emulator/rules tests.
const firebaseSource = readFileSync(
  new URL("./firebase.ts", import.meta.url),
  "utf8",
)
const functionsSource = firebaseSource.slice(
  firebaseSource.indexOf("async function createWalkInQuote("),
)
const compiled = ts.transpileModule(functionsSource.replace(/^export /gm, ""), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText
const factory = new Function(
  "sdk",
  `
  const { db, businessId, currentUser, shopDoc, doc, runTransaction,
    serverTimestamp, moneyNumber, manilaDate, normalizeWalkInInput, deleteDoc,
    canClaimWalkIn, canAdvanceWalkIn } = sdk;
  ${compiled}
  return { createPaidWalkIn, claimWalkIn, advanceWalkIn };
`,
)

function database({ stalledCleanup = false } = {}) {
  const store = new Map([
    ["users/manager", { role: "Manager", name: "Manager" }],
    ["users/barber-one", { role: "Service Provider", name: "Barber One" }],
    ["users/barber-two", { role: "Service Provider", name: "Barber Two" }],
    ["shops/shop-one", { active: true }],
    ["shops/shop-one/settings/business", { shopType: "team" }],
    [
      "shops/shop-one/services/cut",
      { name: "Haircut", amount: 150, status: "Active" },
    ],
    [
      "shops/shop-one/services/wash",
      { name: "Wash", amount: 25, status: "Active" },
    ],
    [
      "shops/shop-one/team/barber-one",
      { name: "Barber One", role: "Service Provider", active: true },
    ],
    [
      "shops/shop-one/team/barber-two",
      { name: "Barber Two", role: "Service Provider", active: true },
    ],
  ])
  let tail = Promise.resolve()
  const pathOf = (reference) => typeof reference === "string" ? reference : reference.path
  const sdk = (uid) => ({
    db: {},
    businessId: () => "shop-one",
    currentUser: () => ({ uid }),
    shopDoc: (shopId, name, id) => ({ path: `shops/${shopId}/${name}/${id}`, id }),
    doc: (db, ...segments) => segments.join("/"),
    serverTimestamp: () => "server-time",
    moneyNumber: (amount) => Math.round(amount * 100) / 100,
    manilaDate: () => "2026-10-10",
    normalizeWalkInInput,
    canClaimWalkIn,
    canAdvanceWalkIn,
    deleteDoc: async (reference) => {
      store.delete(pathOf(reference))
      if (stalledCleanup) await new Promise(() => {})
    },
    runTransaction: (db, operation) => {
      const job = tail.then(async () => {
        const writes = new Map()
        const result = await operation({
          get: async (ref) => {
            assert.equal(writes.size, 0, "all transaction reads precede writes")
            const snapshot = structuredClone(store.get(pathOf(ref)))
            return {
              ref,
              exists: () => snapshot !== undefined,
              data: () => snapshot,
            }
          },
          set: (ref, data) => writes.set(pathOf(ref), structuredClone(data)),
          update: (ref, data) => {
            assert.ok(
              store.has(pathOf(ref)),
              "updates must target an existing document",
            )
            writes.set(pathOf(ref), { ...store.get(pathOf(ref)), ...data })
          },
        })
        for (const [ref, value] of writes) store.set(ref, value)
        return result
      })
      tail = job.catch(() => {})
      return job
    },
  })
  return { store, api: (uid) => factory(sdk(uid)) }
}

test("payment completes one walk-in and matching Sales/payment documents without reservations or queue steps", async () => {
  const { store, api } = database()
  await api("manager").createPaidWalkIn("visit-one", valid)
  const visit = store.get("shops/shop-one/walkins/visit-one")
  const sale = store.get("shops/shop-one/sales/visit-one")
  assert.equal(visit.status, "Paid")
  assert.equal(visit.completedAt, "server-time")
  assert.equal(visit.paymentStatus, "Paid")
  assert.equal(visit.amountCents, 17500)
  assert.equal(sale.type, "Walk-in")
  assert.deepEqual(sale, store.get("shops/shop-one/payments/visit-one"))
  assert.equal(
    [...store.keys()].some(
      (key) =>
        key.includes("appointmentSchedules") || key.includes("/appointments/"),
    ),
    false,
  )
  await api("manager").createPaidWalkIn("visit-one", valid)
  assert.equal(
    [...store.keys()].filter((key) => key.includes("/sales/")).length,
    1,
  )
})

test("legacy pending walk-ins retain safe claim handling without reopening new paid walk-ins", async () => {
  const { store, api } = database()
  await api("manager").createPaidWalkIn("visit-one", valid)
  await assert.rejects(
    api("barber-one").claimWalkIn("visit-one", "barber-one"),
    /already accepted/,
  )
  const reference = "shops/shop-one/walkins/visit-one"
  store.set(reference, { ...store.get(reference), status: "Pending", requestedProviderId: "" })
  const results = await Promise.allSettled([
    api("barber-one").claimWalkIn("visit-one", "barber-one"),
    api("barber-two").claimWalkIn("visit-one", "barber-two"),
  ])
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  )
  const visit = store.get("shops/shop-one/walkins/visit-one")
  assert.equal(visit.acceptedByName, "Barber One")
  assert.equal(visit.providerId, "barber-one")
  assert.equal(
    store.get("shops/shop-one/sales/visit-one").providerId,
    visit.providerId,
  )
  assert.deepEqual(
    store.get("shops/shop-one/sales/visit-one"),
    store.get("shops/shop-one/payments/visit-one"),
  )
  await api("barber-one").advanceWalkIn("visit-one", "In Service")
  await api("barber-one").advanceWalkIn("visit-one", "Paid")
  assert.equal(
    store.get("shops/shop-one/walkins/visit-one").completedAt,
    "server-time",
  )
})

test("changed service prices cannot record a payment for a stale quote", async () => {
  const { store, api } = database()
  store.set("shops/shop-one/services/cut", {
    name: "Haircut",
    amount: 200,
    status: "Active",
  })
  await assert.rejects(
    api("manager").createPaidWalkIn("visit-one", valid),
    /prices changed/,
  )
  assert.equal(store.has("shops/shop-one/sales/visit-one"), false)
  assert.equal([...store.keys()].some((key) => key.includes("/walkInQuotes/")), false)
})

test("large service selections stay one cent-accurate visit with two identical ledgers", async () => {
  for (const count of [3, 4, 5, 6, 10, 50]) {
    const { store, api } = database()
    const serviceIds = Array.from({ length: count }, (_, index) => `extra-${index}`)
    for (const [index, serviceId] of serviceIds.entries())
      store.set(`shops/shop-one/services/${serviceId}`, { name: `Service ${index}`, amount: 10.01 + index, status: "Active" })
    const quotedTotal = serviceIds.reduce((sum, _, index) => sum + 1001 + index * 100, 0) / 100
    await api("manager").createPaidWalkIn("large", { ...valid, serviceIds, quotedTotal, requestedProviderId: "barber-one" })
    const visit = store.get("shops/shop-one/walkins/large")
    assert.equal(visit.serviceIds.length, count)
    assert.equal(visit.serviceNames.length, count)
    assert.equal(visit.amountCents, Math.round(quotedTotal * 100))
    assert.equal(visit.providerId, "barber-one")
    assert.deepEqual(store.get("shops/shop-one/payments/large"), store.get("shops/shop-one/sales/large"))
    assert.equal([...store.keys()].some((key) => key.includes("/walkInQuotes/")), false)
  }
})

test("quote cleanup cannot delay acknowledgement of an already committed payment", { timeout: 1000 }, async () => {
  const { store, api } = database({ stalledCleanup: true })
  const payment = await api("manager").createPaidWalkIn("acknowledged", valid)
  assert.equal(payment.amount, 175)
  assert.equal(store.get("shops/shop-one/walkins/acknowledged").paymentStatus, "Paid")
})

test("inactive services, non-management roles and invalid providers leave no partial payment", async () => {
  for (const mode of ["inactive", "customer", "provider"]) {
    const { store, api } = database()
    store.set("users/customer", { role: "Customer" })
    if (mode === "inactive") store.get("shops/shop-one/services/wash").status = "Inactive"
    await assert.rejects(api(mode === "customer" ? "customer" : "manager").createPaidWalkIn("invalid", {
      ...valid, requestedProviderId: mode === "provider" ? "missing" : valid.requestedProviderId,
    }))
    assert.equal(store.has("shops/shop-one/walkins/invalid"), false)
    assert.equal(store.has("shops/shop-one/payments/invalid"), false)
    assert.equal(store.has("shops/shop-one/sales/invalid"), false)
    assert.equal([...store.keys()].some((key) => key.includes("/walkInQuotes/")), false)
  }
})

test("missing providers, Card, and inactive provider profiles cannot create any payment or quote", async () => {
  for (const mode of ["missing", "card", "inactive-provider", "wrong-role"]) {
    const { store, api } = database()
    if (mode === "inactive-provider") store.get("shops/shop-one/team/barber-one").active = false
    if (mode === "wrong-role") store.get("shops/shop-one/team/barber-one").role = "Manager"
    await assert.rejects(api("manager").createPaidWalkIn("blocked", {
      ...valid, requestedProviderId: mode === "missing" ? "" : valid.requestedProviderId,
      method: mode === "card" ? "Card" : "Cash",
    }))
    for (const name of ["walkins", "sales", "payments"]) assert.equal(store.has(`shops/shop-one/${name}/blocked`), false)
    assert.equal([...store.keys()].some((key) => key.includes("/walkInQuotes/")), false)
  }
})
