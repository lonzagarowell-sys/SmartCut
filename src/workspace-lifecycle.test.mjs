import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const firebase = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const compile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/export /g, "")
const finance = {}
new Function("exports", ts.transpileModule(readFileSync(new URL("./finance.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(finance)
function workspace(checkAccess) {
  let cursor = 0
  const memory = []
  const effects = []
  const listeners = []
  const slot = () => cursor++
  const ui = {
    reconcileFinance: finance.reconcileFinance,
    useState: (initial) => {
      const index = slot()
      if (!(index in memory)) memory[index] = initial
      return [memory[index], (value) => { memory[index] = typeof value === "function" ? value(memory[index]) : value }]
    },
    useRef: (initial) => { const index = slot(); return memory[index] ||= { current: initial } },
    useEffect: (effect, deps) => {
      const index = slot()
      const previous = memory[index]
      if (!previous || deps.some((value, position) => value !== previous.deps[position])) {
        effects.push(() => { previous?.cleanup?.(); memory[index] = { deps, cleanup: effect() } })
      }
    },
    initialCollection: { records: [], status: "connecting" },
    isManager: (role) => ["Manager", "Administrator"].includes(role),
    setBusinessContext: () => {},
    subscribeRecords: (name, callback, status, scope) => {
      const listener = { name, callback, status, scope, stopped: false }
      listeners.push(listener)
      status("connecting")
      return () => { listener.stopped = true }
    },
    subscribeNotifications: () => () => {},
    subscribeSubscriptionState: () => () => {},
    subscribeProviderAppointments: () => () => {},
    subscribeBusinessSettings: () => () => {},
    subscribeUsers: () => () => {},
  }
  const hook = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${compile(app.slice(app.indexOf("function useWorkspaceData("), app.indexOf("type WorkspaceData")))}; return useWorkspaceData;`)(ui)
  const render = (shopId = "one", role = "Customer", revision = "") => {
    cursor = 0
    return hook({ uid: "person", role, activeShopId: shopId, shopId }, revision, checkAccess)
  }
  const flush = () => { for (const effect of effects.splice(0)) effect() }
  return { render, flush, listeners }
}
test("shop switch clears old data immediately and ignores late callbacks after cleanup", () => {
  const mock = workspace()
  mock.render(); mock.flush()
  const old = mock.listeners.find((listener) => listener.name === "appointments")
  old.callback([{ id: "old-booking" }]); old.status("connected")
  assert.equal(mock.render().data.appointments.records[0].id, "old-booking")
  assert.deepEqual(mock.render("two").data, {})
  mock.flush()
  old.status("error", "Permission denied"); old.callback([{ id: "stale" }])
  assert.equal(old.stopped, true)
  const current = mock.render("two")
  assert.equal(current.data.appointments.status, "connecting")
  assert.deepEqual(current.data.appointments.records, [])
})

test("workspace live deletions reconcile surviving finance mirrors without a refresh", () => {
  const mock = workspace()
  mock.render("one", "Manager"); mock.flush()
  const emit = (name, records) => {
    const listener = mock.listeners.find((listener) => listener.name === name)
    assert.ok(listener, `${name} has a live shop subscription`)
    listener.callback(records); listener.status("connected")
  }
  const receipt = { id: "visit", walkInId: "visit", amount: 150 }
  emit("appointments", [])
  emit("walkins", [{ id: "visit" }])
  emit("sales", [receipt])
  emit("payments", [receipt])
  assert.equal(mock.render("one", "Manager").data.sales.records.length, 1)
  emit("walkins", [])
  const deleted = mock.render("one", "Manager").data
  assert.deepEqual(deleted.sales.records, [])
  assert.deepEqual(deleted.payments.records, [])
  assert.equal(deleted.sales.status, "connected")
})
test("live license revision recreates subscriptions without retaining stale permission errors", () => {
  const mock = workspace()
  mock.render("one", "Manager", "starter"); mock.flush()
  const old = mock.listeners.find((listener) => listener.name === "appointments")
  old.status("error", "Permission denied")
  assert.deepEqual(mock.render("one", "Manager", "business").data, {})
  mock.flush()
  assert.equal(old.stopped, true)
  assert.equal(mock.render("one", "Manager", "business").data.appointments.status, "connecting")
})
test("operational errors check live access once and preserve unrelated permission errors", async () => {
  for (const locked of [true, false]) {
    let checks = 0
    const mock = workspace(async () => { checks++; return locked })
    mock.render("one", "Manager"); mock.flush()
    for (const listener of mock.listeners.slice(0, 2)) listener.status("error", "Access denied")
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(checks, 1)
    assert.equal(mock.render("one", "Manager").data.appointments.status, locked ? "connecting" : "error")
  }
})
test("later permission errors recheck access instead of reusing an earlier license decision", async () => {
  let locked = false
  let checks = 0
  const mock = workspace(async () => { checks++; return locked })
  mock.render("one", "Manager"); mock.flush()
  const listener = mock.listeners.find((item) => item.name === "appointments")
  listener.status("error", "Access denied")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(mock.render("one", "Manager").data.appointments.status, "error")
  locked = true
  listener.status("error", "Access denied")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(checks, 2)
  assert.equal(mock.render("one", "Manager").data.appointments.status, "connecting")
})

test("delayed access checks cannot overwrite newer successful snapshots or newer errors", async () => {
  for (const reject of [false, true]) {
    let resolveCheck, rejectCheck
    const mock = workspace(() => new Promise((resolve, reject) => { resolveCheck = resolve; rejectCheck = reject }))
    mock.render("one", "Manager"); mock.flush()
    const listener = mock.listeners.find((item) => item.name === "appointments")
    listener.status("error", "Access denied")
    listener.callback([{ id: "live-booking" }])
    listener.status("connected")
    if (reject) rejectCheck(new Error("Old access check failed"))
    else resolveCheck(false)
    await new Promise((resolve) => setImmediate(resolve))
    const state = mock.render("one", "Manager").data.appointments
    assert.equal(state.status, "connected")
    assert.equal(state.error, undefined)
    assert.equal(state.records[0].id, "live-booking")
  }
})
test("profile listener waits for server-confirmed shop selection and ignores callbacks after sign-out", async () => {
  let listener
  const profiles = []
  const ui = { currentUser: () => ({ uid: "person" }), ensureUserProfile: async () => {},
    db: {}, doc: () => "users/person", roles: ["Customer"],
    friendlyError: (error) => error.message,
    onSnapshot: (path, options, next, error) => { listener = { options, next, error }; return () => {} } }
  const subscribe = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${compile(firebase.slice(firebase.indexOf("export function subscribeUserProfile("), firebase.indexOf("export function subscribeUsers(")))}; return subscribeUserProfile;`)(ui)
  const stop = subscribe("person", (profile) => profiles.push(profile))
  await Promise.resolve(); await Promise.resolve()
  assert.equal(listener.options.includeMetadataChanges, true)
  const emit = (metadata) => listener.next({ data: () => ({ role: "Customer", activeShopId: "new-shop" }), metadata })
  emit({ fromCache: true, hasPendingWrites: false })
  emit({ fromCache: false, hasPendingWrites: true })
  assert.equal(profiles.length, 0)
  emit({ fromCache: false, hasPendingWrites: false })
  assert.equal(profiles[0].activeShopId, "new-shop")
  stop()
  emit({ fromCache: false, hasPendingWrites: false })
  assert.equal(profiles.length, 1)
})
test("customer paused message is reserved for a confirmed live access decision", () => {
  assert.match(app, /!bookingAccess && account.role === "Customer" && bookingAccessStatus === "connected"/)
  assert.match(app, /loading \|\| loadedShopId !== shopId/)
  assert.match(app, /formReady/)
})
