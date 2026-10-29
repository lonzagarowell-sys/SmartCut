import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { billingPlans, billingDeadline, workspaceAccess, addBillingMonth, manilaDueDate } from "./subscription-access.mjs"
import { workspaceLicenseActive } from "../functions/license-access.js"

const stamp = (date) => ({ toDate: () => new Date(date) })

test("paid and trial deadlines, missing licenses, and manual locks are enforced consistently", () => {
  const now = new Date("2026-10-12T00:00:00Z").getTime()
  const active = { status: "Active", expiresAt: stamp("2026-11-12T00:00:00Z"), manualLocked: false }
  assert.equal(workspaceAccess(active, now).allowed, true)
  assert.equal(workspaceLicenseActive(active, now), true)
  assert.equal(workspaceAccess({ ...active, manualLocked: true }, now).allowed, false)
  assert.equal(workspaceLicenseActive({ ...active, manualLocked: true }, now), false)
  assert.equal(workspaceAccess(active, active.expiresAt.toDate().getTime()).allowed, false)
  assert.equal(workspaceAccess(null, now).allowed, false)
  const trial = { status: "Trial", trialStartedAt: stamp("2026-10-05T00:00:00Z") }
  assert.equal(workspaceAccess(trial, now).allowed, false)
  assert.equal(workspaceLicenseActive(trial, now), false)
  assert.equal(billingDeadline(trial).getTime(), now)
})

test("a billing month clamps month-end dates rather than treating a month as 30 days", () => {
  assert.equal(addBillingMonth(new Date("2026-01-31T15:59:59Z")).toISOString(), "2026-02-28T15:59:59.000Z")
  assert.equal(addBillingMonth(new Date("2028-01-31T15:59:59Z")).toISOString(), "2028-02-29T15:59:59.000Z")
  assert.equal(manilaDueDate("2026-11-12").toISOString(), "2026-11-12T15:59:59.999Z")
  assert.throws(() => manilaDueDate("2026-02-30"), /valid/)
})

const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const code = ts.transpileModule(
  source.slice(source.indexOf("export async function submitSubscriptionPayment("), source.indexOf("export function subscribeWorkspaceAccess(")),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText.replace(/export /g, "")

function harness(role = "Manager") {
  let id = 0
  let actorRole = role
  const rows = { "users/actor": { role, name: "Test Manager" } }
  const ui = {
    billingPlans, billingDeadline, addBillingMonth, manilaDueDate,
    businessId: () => "shop", currentUser: () => ({ uid: "actor" }), db: {},
    serverTimestamp: () => "server-time",
    Timestamp: { fromDate: (date) => ({ toDate: () => date }) },
    shopDoc: (shop, collection, key) => `shops/${shop}/${collection}/${key}`,
    shopCollection: (shop, collection) => `shops/${shop}/${collection}`,
    doc: (...args) => typeof args[0] === "string" ? `${args[0]}/audit-${id++}` : args.slice(1).join("/"),
    runTransaction: async (_, operation) => {
      const writes = []
      const result = await operation({
        get: async (path) => {
          const value = path === "users/actor" ? { role: actorRole, name: "Test Manager" } : rows[path]
          return { exists: () => !!value, data: () => value }
        },
        set: (path, data) => writes.push([path, data, false]),
        update: (path, data) => writes.push([path, data, true]),
      })
      for (const [path, data, merge] of writes) rows[path] = merge ? { ...rows[path], ...data } : data
      return result
    },
  }
  const operations = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code};
    return { submitSubscriptionPayment, approveSubscriptionPayment, manageShopSubscription, rejectSubscriptionPayment };`)(ui)
  return { ...operations, rows, role: (role) => { actorRole = role } }
}

test("GCash proof stays pending, only admin approves, and approval writes matching live access and one receipt", async () => {
  const mock = harness()
  const receipt = { imageUrl: "https://res.cloudinary.com/dijbiwcbo/image/upload/test-receipt.png", imagePublicId: "test-receipt" }
  await mock.submitSubscriptionPayment("professional", "TEST12345", receipt)
  assert.equal(mock.rows["shops/shop/subscriptionPaymentRequests/TEST12345"].status, "Pending")
  assert.equal(mock.rows["shops/shop/settings/access"], undefined)
  await assert.rejects(mock.approveSubscriptionPayment("TEST12345"), /Administrator/)
  mock.role("Administrator")
  await mock.approveSubscriptionPayment("TEST12345")
  assert.equal(mock.rows["shops/shop/subscriptionPaymentRequests/TEST12345"].status, "Approved")
  assert.equal(mock.rows["shops/shop/subscriptionPayments/TEST12345"].amount, 399)
  assert.equal(workspaceAccess(mock.rows["shops/shop/settings/access"]).allowed, true)
  await assert.rejects(mock.approveSubscriptionPayment("TEST12345"), /no longer pending/)
})

test("administrator can extend, lock, or unlock while approval preserves a requirements lock", async () => {
  const mock = harness("Administrator")
  await mock.manageShopSubscription("professional", "2099-12-12", true, "Requirements not met")
  assert.equal(workspaceAccess(mock.rows["shops/shop/settings/access"]).allowed, false)
  const end = billingDeadline(mock.rows["shops/shop/settings/subscription"])
  await mock.manageShopSubscription("professional", "", true, "Requirements not met", true)
  assert.equal(billingDeadline(mock.rows["shops/shop/settings/subscription"]).getTime(), addBillingMonth(end).getTime())
  await mock.submitSubscriptionPayment("professional", "TEST12345", { imageUrl: "https://res.cloudinary.com/dijbiwcbo/image/upload/test.png", imagePublicId: "test" })
  const result = await mock.approveSubscriptionPayment("TEST12345")
  assert.equal(result.locked, true)
  assert.equal(workspaceAccess(mock.rows["shops/shop/settings/access"]).allowed, false)
  await mock.manageShopSubscription("professional", "2099-12-12", false, "")
  assert.equal(workspaceAccess(mock.rows["shops/shop/settings/access"]).allowed, true)
  assert.ok(Object.keys(mock.rows).filter((path) => path.includes("/subscriptionEvents/")).length >= 4)
})

test("manager cannot change plan/deadline or reject payment proof", async () => {
  const mock = harness("Manager")
  await assert.rejects(mock.manageShopSubscription("business", "2099-12-12", false, ""), /Administrator/)
  await assert.rejects(mock.rejectSubscriptionPayment("TEST12345", "Invalid proof"), /Administrator/)
  assert.equal(mock.rows["shops/shop/settings/access"], undefined)
})

test("approval preserves a legacy subscription lock when its access summary is missing", async () => {
  const mock = harness("Administrator")
  mock.rows["shops/shop/settings/subscription"] = { manualLocked: true, lockReason: "Review requirements" }
  await mock.submitSubscriptionPayment("professional", "LEGACY123", {
    imageUrl: "https://res.cloudinary.com/dijbiwcbo/image/upload/test.png", imagePublicId: "test",
  })
  const result = await mock.approveSubscriptionPayment("LEGACY123")
  assert.equal(result.locked, true)
  assert.equal(mock.rows["shops/shop/settings/access"].reason, "Review requirements")
  assert.equal(workspaceAccess(mock.rows["shops/shop/settings/access"]).allowed, false)
})

test("approval rejects malformed currency, plan, shop, receipt, and reference owner without granting access", async () => {
  for (const [field, value] of [
    ["currency", "USD"], ["paymentMethod", "Cash"], ["plan", "Wrong plan"],
    ["shopId", "other-shop"], ["receiptUrl", "https://example.test/receipt"],
    ["receiptPublicId", ""],
  ]) {
    const mock = harness("Administrator")
    await mock.submitSubscriptionPayment("professional", "TEST12345", {
      imageUrl: "https://res.cloudinary.com/dijbiwcbo/image/upload/test.png", imagePublicId: "test",
    })
    mock.rows["shops/shop/subscriptionPaymentRequests/TEST12345"][field] = value
    await assert.rejects(mock.approveSubscriptionPayment("TEST12345"), /does not match/)
    assert.equal(mock.rows["shops/shop/settings/access"], undefined)
    assert.equal(mock.rows["shops/shop/subscriptionPayments/TEST12345"], undefined)
  }
  const mock = harness("Administrator")
  await mock.submitSubscriptionPayment("professional", "TEST12345", {
    imageUrl: "https://res.cloudinary.com/dijbiwcbo/image/upload/test.png", imagePublicId: "test",
  })
  mock.rows["subscriptionReferences/TEST12345"].submittedBy = "different-owner"
  await assert.rejects(mock.approveSubscriptionPayment("TEST12345"), /does not match/)
})

test("rules gate operational membership using server time while preserving admin and billing access", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
  assert.match(rules, /data.expiresAt > request.time/)
  assert.match(rules, /data.trialStartedAt \+ duration.value\(7, 'd'\) > request.time/)
  assert.match(rules, /function billingManager\(\)/)
  assert.match(rules, /id == "access" && rawMember\(\)/)
  assert.match(rules, /allow create, update: if id == "subscription" && validAdminSubscription\(\)/)
  assert.match(rules, /match \/subscriptionReferences\/\{id\}/)
})
