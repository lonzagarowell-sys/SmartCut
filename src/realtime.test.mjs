import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const helper = source.slice(source.indexOf("function snapshotSyncState("), source.indexOf("export const roles"))
const subscriber = source.slice(source.indexOf("export function subscribeRecords("), source.indexOf("export async function createRecord("))
const compiled = ts.transpileModule(`${helper}\n${subscriber}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function harness(scope) {
  const exports = {}
  const events = []
  let listener
  let stopped = false
  const ui = {
    businessId: () => "shop-one",
    currentUser: () => ({ uid: "provider-one" }),
    shopCollection: (shop, name) => `shops/${shop}/${name}`,
    query: (path, condition) => ({ path, condition }),
    where: (field, operator, value) => ({ field, operator, value }),
    friendlyError: () => "Permission denied",
    onSnapshot: (path, options, callback, onError) => {
      listener = { path, options, callback, onError }
      return () => { stopped = true }
    },
  }
  new Function("exports", "ui", `const { ${Object.keys(ui).join(",")} } = ui; ${compiled}`)(exports, ui)
  const stop = exports.subscribeRecords("appointments", (rows) => events.push({ rows }), (status, error) => events.push({ status, error }), scope)
  const emit = (status, paymentStatus, fromCache = false, hasPendingWrites = false) => listener.callback({
    metadata: { fromCache, hasPendingWrites },
    docs: [{ id: "booking", data: () => ({ status, paymentStatus }) }],
  })
  return { listener, events, emit, stop, isStopped: () => stopped }
}

test("live booking and payment updates propagate without another query or refresh", () => {
  const mock = harness("provider")
  assert.equal(mock.listener.path.path, "shops/shop-one/appointments")
  assert.deepEqual(mock.listener.path.condition, { field: "providerId", operator: "==", value: "provider-one" })
  assert.equal(mock.listener.options.includeMetadataChanges, true)
  mock.emit("Accepted", "Unpaid")
  mock.emit("In Progress", "Unpaid")
  mock.emit("Completed", "Paid")
  assert.deepEqual(mock.events.filter((event) => event.rows).map((event) => event.rows[0].status), ["Accepted", "In Progress", "Completed"])
  assert.equal(mock.events.filter((event) => event.rows).at(-1).rows[0].paymentStatus, "Paid")
  mock.stop()
  assert.equal(mock.isStopped(), true)
})

test("cached and pending writes are not reported as server-confirmed data", () => {
  const mock = harness()
  mock.emit("Accepted", "Unpaid", true)
  assert.equal(mock.events.at(-1).status, "connecting")
  mock.emit("Completed", "Paid", false, true)
  assert.equal(mock.events.at(-1).status, "connecting")
  mock.emit("Completed", "Paid")
  assert.equal(mock.events.at(-1).status, "connected")
})

test("a deleted Firestore document disappears from the next full live snapshot", () => {
  const mock = harness()
  mock.emit("Completed", "Paid")
  mock.listener.callback({ docs: [], metadata: { fromCache: false, hasPendingWrites: false } })
  assert.deepEqual(mock.events.at(-2).rows, [])
  assert.equal(mock.events.at(-1).status, "connected")
})

test("permission failures clear stale records and expose an error state", () => {
  const mock = harness("customer")
  assert.equal(mock.listener.path.condition.field, "customerId")
  mock.emit("Accepted", "Unpaid")
  mock.listener.onError(new Error("test"))
  assert.deepEqual(mock.events.at(-2).rows, [])
  assert.equal(mock.events.at(-1).status, "error")
})

test("workspace tears down subscriptions when account or shop changes", () => {
  const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
  assert.match(app, /active = false; stops.forEach\(\(stop\) => stop\(\)\)/)
  assert.match(app, /\[account.uid, account.role, account.activeShopId, account.shopId, retryKey, accessRevision\]/)
  assert.match(app, /reconnect: \(\) => setRetryKey/)
})

test("rules allow a customer to check for an absent review only via their own appointment", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
  const reviews = rules.slice(rules.indexOf("match /reviews/{id}"))
  assert.match(reviews, /allow get: if member\(\)/)
  assert.match(reviews, /appointments\/\$\(id\)\)\.data.customerId == request.auth.uid/)
  assert.match(reviews, /allow list: if member\(\)/)
})
