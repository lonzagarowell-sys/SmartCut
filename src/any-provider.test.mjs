import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { formatTime12, parseTime24, timeTo24 } from "./time-format.mjs"

const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
const domainSource = ts.transpileModule(readFileSync(new URL("./domain.ts", import.meta.url), "utf8"), { compilerOptions: options }).outputText
const domain = await import(`data:text/javascript;base64,${Buffer.from(domainSource).toString("base64")}`)
const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const compile = (start, end) => ts.transpileModule(
  source.slice(source.indexOf(start), source.indexOf(end)),
  { compilerOptions: options },
).outputText.replace(/export /g, "")

test("capacity requires one active provider free for every block of the full service", () => {
  const candidates = [
    { id: "one", active: true, role: "Service Provider", slots: { "555": "existing" } },
    { id: "two", active: true, role: "Service Provider", slots: {} },
    { id: "inactive", active: false, role: "Service Provider", slots: {} },
  ]
  assert.equal(domain.reservationProvider(candidates, ["540", "555"]), "two")
  assert.equal(domain.reservationProvider(candidates, ["540", "555"], "one"), "")
  assert.equal(domain.reservationProvider(candidates.slice(2), ["540"]), "")
})

test("only management or an active provider claiming themselves can assign an accepted unassigned booking", () => {
  const booking = { status: "Accepted", providerId: "", providerPreference: "any" }
  assert.equal(domain.canAssignBooking("Manager", "manager", booking, "two", false), true)
  assert.equal(domain.canAssignBooking("Administrator", "admin", booking, "two", false), true)
  assert.equal(domain.canAssignBooking("Service Provider", "one", booking, "one", true), true)
  assert.equal(domain.canAssignBooking("Service Provider", "one", booking, "two", true), false)
  assert.equal(domain.canAssignBooking("Service Provider", "one", booking, "one", false), false)
  assert.equal(domain.canAssignBooking("Customer", "customer", booking, "one", true), false)
  assert.equal(domain.canAssignBooking("Manager", "manager", { ...booking, status: "Pending" }, "one", true), false)
  assert.equal(domain.canAssignBooking("Manager", "manager", { ...booking, providerId: "two" }, "one", true), false)
})

function harness() {
  let counter = 0
  let role = "Customer"
  let uid = "customer"
  const records = {
    "shops/shop/services/cut": { name: "Haircut", status: "Active", durationMinutes: 20, amount: 150 },
    "shops/shop/settings/business": { bookingSchemaVersion: 2, shopType: "team", open: "09:00", close: "17:00" },
    "shops/shop/team/one": { name: "Barber One", active: true, role: "Service Provider" },
    "shops/shop/team/two": { name: "Barber Two", active: true, role: "Service Provider" },
    "shops/shop/members/customer": { name: "Maria", role: "Customer" },
  }
  const ui = {
    ...domain,
    businessId: () => "shop",
    currentUser: () => ({ uid }),
    db: {},
    Timestamp: { fromDate: (date) => ({ toDate: () => date }) },
    serverTimestamp: () => "server-time",
    shopCollection: (shop, collection) => `shops/${shop}/${collection}`,
    shopDoc: (shop, collection, id) => `shops/${shop}/${collection}/${id}`,
    doc: (...args) => {
      const path = typeof args[0] === "string" ? `${args[0]}/auto-${counter++}` : args.slice(1).join("/")
      return { path, id: path.split("/").at(-1) }
    },
    runTransaction: async (_, callback) => {
      const writes = []
      const transaction = {
        get: async (reference) => {
          const path = reference.path || reference
          const value = path === `users/${uid}` ? { role, name: "Maria" } : records[path]
          return { exists: () => !!value, data: () => value }
        },
        set: (reference, data) => writes.push([reference.path || reference, data, false]),
        update: (reference, data) => writes.push([reference.path || reference, data, true]),
      }
      await callback(transaction)
      for (const [path, data, merge] of writes) records[path] = merge ? { ...records[path], ...data } : data
    },
  }
  const createCode = compile("export async function createAppointment(", "export async function assignAppointmentProvider(")
  const assignCode = compile("export async function assignAppointmentProvider(", "export function subscribeProviderAppointments(")
  const statusCode = compile("export async function updateAppointmentStatus(", "export async function submitAppointmentReview(")
  const checkoutCode = compile("export async function checkoutAppointment(", "export function subscribeNotifications(")
  const functions = new Function("ui", `
    const { ${Object.keys(ui).join(",")} } = ui;
    ${createCode}
    ${assignCode}
    ${statusCode}
    ${checkoutCode}
    return { createAppointment, assignAppointmentProvider, updateAppointmentStatus, checkoutAppointment };
  `)(ui)
  const input = { client: "Maria", customerId: "customer", serviceId: "cut", providerId: "", date: "2099-10-12", time: "09:00", notes: "" }
  const bookings = () => Object.entries(records).filter(([path]) => path.includes("/appointments/"))
  return { ...functions, records, input, bookings, actor: (nextRole, nextUid) => { role = nextRole; uid = nextUid } }
}

test("any-provider reservations stay unassigned and cannot overbook or steal named-provider slots", async () => {
  const mock = harness()
  await mock.createAppointment(mock.input, ["one", "two"])
  await mock.createAppointment(mock.input, ["one", "two"])
  const bookings = mock.bookings().map(([, record]) => record)
  assert.ok(bookings.every((booking) => booking.providerId === "" && booking.providerPreference === "any"))
  assert.deepEqual(bookings.map((booking) => booking.reservedProviderId), ["one", "two"])
  assert.equal(bookings[0].provider, "To be assigned at shop")
  await assert.rejects(mock.createAppointment(mock.input, ["one", "two"]), /no capacity/)
  await assert.rejects(mock.createAppointment({ ...mock.input, providerId: "one" }), /overlapping/)
  assert.equal(mock.bookings().length, 2)
})

test("missing or stale customer membership fails clearly before creating a booking or hold", async () => {
  for (const membership of [null, { name: "Old name", role: "Customer" }, { name: "Maria", role: "Service Provider" }]) {
    const mock = harness()
    if (membership) mock.records["shops/shop/members/customer"] = membership
    else delete mock.records["shops/shop/members/customer"]
    await assert.rejects(mock.createAppointment(mock.input, ["one", "two"]), /Switch shop|review your membership/)
    assert.equal(mock.bookings().length, 0)
    assert.equal(Object.keys(mock.records).filter((path) => path.includes("/appointmentSchedules/")).length, 0)
  }
})

test("assignment transfers the capacity hold atomically and prevents reclaiming", async () => {
  const mock = harness()
  await mock.createAppointment(mock.input, ["one", "two"])
  const [path] = mock.bookings()[0]
  const id = path.split("/").at(-1)
  mock.actor("Manager", "manager")
  await mock.updateAppointmentStatus(id, "Accepted")
  await assert.rejects(mock.updateAppointmentStatus(id, "In Progress"), /Assign a service provider/)
  await mock.assignAppointmentProvider(id, "two")
  assert.equal(mock.records[path].providerId, "two")
  assert.equal(mock.records[path].provider, "Barber Two")
  assert.equal(mock.records["shops/shop/appointmentSchedules/one_2099-10-12"].slots["540"], undefined)
  assert.equal(mock.records["shops/shop/appointmentSchedules/two_2099-10-12"].slots["540"], id)
  assert.equal(mock.records["shops/shop/appointmentSchedules/two_2099-10-12"].slots["555"], id)
  await assert.rejects(mock.assignAppointmentProvider(id, "one"), /no longer unassigned/)
  await mock.updateAppointmentStatus(id, "In Progress")
  assert.equal(mock.records[path].status, "In Progress")
})

test("a busy provider choice leaves the original hold intact; cancellation releases it", async () => {
  const mock = harness()
  await mock.createAppointment({ ...mock.input, providerId: "two" })
  await mock.createAppointment(mock.input, ["one", "two"])
  const [path, booking] = mock.bookings()[1]
  const id = path.split("/").at(-1)
  mock.actor("Manager", "manager")
  await mock.updateAppointmentStatus(id, "Accepted")
  await assert.rejects(mock.assignAppointmentProvider(id, "two"), /booked at this time/)
  assert.equal(mock.records[path].providerId, "")
  assert.equal(mock.records[`shops/shop/appointmentSchedules/${booking.scheduleId}`].slots["540"], id)
  await mock.updateAppointmentStatus(id, "Cancelled")
  assert.equal(mock.records[`shops/shop/appointmentSchedules/${booking.scheduleId}`].slots["540"], undefined)
})

test("a provider can take their own unassigned booking but cannot choose a colleague", async () => {
  const mock = harness()
  await mock.createAppointment(mock.input, ["one", "two"])
  const [path] = mock.bookings()[0]
  const id = path.split("/").at(-1)
  mock.actor("Manager", "manager")
  await mock.updateAppointmentStatus(id, "Accepted")
  mock.actor("Service Provider", "one")
  await assert.rejects(mock.assignAppointmentProvider(id, "two"), /cannot assign/)
  await mock.assignAppointmentProvider(id, "one")
  assert.equal(mock.records[path].assignedBy, "one")
})

test("customer booking, manager approval, provider assignment, service, and payment work together", async () => {
  const mock = harness()
  await mock.createAppointment(mock.input, ["one", "two"])
  const [path] = mock.bookings()[0]
  const id = path.split("/").at(-1)
  mock.actor("Manager", "manager")
  await mock.updateAppointmentStatus(id, "Accepted")
  mock.actor("Service Provider", "one")
  await mock.assignAppointmentProvider(id, "one")
  mock.actor("Service Provider", "two")
  await assert.rejects(mock.updateAppointmentStatus(id, "In Progress"), /cannot perform/)
  await assert.rejects(mock.checkoutAppointment(id, "Cash"), /Complete the service/)
  mock.actor("Service Provider", "one")
  await mock.updateAppointmentStatus(id, "In Progress")
  await mock.updateAppointmentStatus(id, "Completed")
  await mock.checkoutAppointment(id, "Cash")
  assert.equal(mock.records[path].status, "Completed")
  assert.equal(mock.records[path].paymentStatus, "Paid")
  const payment = mock.records[`shops/shop/payments/${id}`]
  assert.deepEqual(payment, mock.records[`shops/shop/sales/${id}`])
  assert.equal(payment.providerId, "one")
  assert.equal(payment.amount, 150)
  await assert.rejects(mock.checkoutAppointment(id, "Cash"), /already been paid/)
})

test("provider subscriptions combine own and accepted-unassigned bookings and prefer a fresh assignment", () => {
  const listeners = []
  let rows = []
  let status
  let stopped = 0
  const ui = {
    businessId: () => "shop", currentUser: () => ({ uid: "one" }),
    shopCollection: (shop, name) => `shops/${shop}/${name}`,
    query: (path, ...filters) => ({ path, filters }),
    where: (field, op, value) => ({ field, op, value }),
    snapshotSyncState: ({ fromCache, hasPendingWrites }) => fromCache || hasPendingWrites ? "connecting" : "connected",
    friendlyError: () => "Read failed",
    onSnapshot: (query, options, callback, error) => {
      listeners.push({ query, options, callback, error })
      return () => { stopped++ }
    },
  }
  const code = compile("export function subscribeProviderAppointments(", "export async function updateAppointmentStatus(")
  const subscribe = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return subscribeProviderAppointments;`)(ui)
  const stop = subscribe((value) => { rows = value }, (value) => { status = value })
  assert.equal(listeners.length, 2)
  assert.ok(listeners.every((listener) => listener.options.includeMetadataChanges))
  assert.deepEqual(listeners[1].query.filters.map((filter) => [filter.field, filter.value]),
    [["providerId", ""], ["status", "Accepted"], ["providerPreference", "any"]])
  const emit = (index, data) => listeners[index].callback({
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: data.map((record) => ({ id: record.id, data: () => record })),
  })
  emit(0, [])
  emit(1, [{ id: "booking", providerId: "", status: "Accepted", providerPreference: "any" }])
  assert.equal(status, "connected")
  emit(0, [{ id: "booking", providerId: "one", status: "Accepted", providerPreference: "any" }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].providerId, "one")
  emit(1, [])
  assert.equal(rows.length, 1)
  stop()
  assert.equal(stopped, 2)
})

test("rules reserve capacity and require assignment before start without allowing named bookings to be claimed", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
  assert.match(rules, /capacityProviderId = data.get\("reservedProviderId", data.providerId\)/)
  assert.match(rules, /after.status == "In Progress" && before.providerId != ""/)
  assert.match(rules, /before.get\("providerPreference", ""\) == "any" && before.get\("providerId", ""\) == ""/)
  assert.match(rules, /after.diff\(before\).affectedKeys\(\).hasOnly\(\[/)
  const slots = rules.slice(rules.indexOf("function slotsHeld("), rules.indexOf("function inBusinessHours("))
  assert.match(slots, /count >= 1 && count <= 16/)
  for (let index = 0; index < 16; index++)
    assert.ok(slots.includes(`slots[keys[${index}]] == id`))
})

test("customer booking defaults to an optional provider choice with a clear review summary", () => {
  const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
  const code = ts.transpileModule(
    app.slice(app.indexOf("function TimePicker("), app.indexOf("function ErrorBox(")) +
    app.slice(app.indexOf("function BookingModal("), app.indexOf("function ServiceDropdown(")),
    { compilerOptions: { ...options, jsx: ts.JsxEmit.React } },
  ).outputText
  const render = (step) => {
    const shell = ({ children }) => React.createElement("div", {}, children)
    const ui = {
      ...domain, React, formatTime12, parseTime24, timeTo24,
      useState: (initial) => [initial === 1 ? step : initial, () => {}],
      useEffect: () => {}, useRef: () => ({ current: null }), useMemo: (callback) => callback(),
      manilaDate: () => "2099-10-12",
      Modal: shell, Field: shell, ErrorBox: shell,
      Button: ({ children }) => React.createElement("button", {}, children),
      CalendarDays: () => null, Check: () => null, ArrowLeft: () => null, ArrowRight: () => null,
      cx: (...values) => values.filter(Boolean).join(" "), inputClass: "",
      isManager: (role) => ["Manager", "Administrator"].includes(role),
    }
    const Booking = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return BookingModal;`)(ui)
    return renderToStaticMarkup(React.createElement(Booking, {
      selectedServiceId: "cut", account: { uid: "customer", role: "Customer", name: "Maria" },
      services: [{ id: "cut", name: "Haircut", status: "Active", legacy: false, amount: 150, durationMinutes: 20 }],
      providers: [{ id: "one", name: "Barber One" }], clients: [], bookingIssue: "",
      business: { shopType: "team", openingMinute: 540, closingMinute: 1020, open: "09:00", close: "17:00" },
      close: () => {}, saved: () => {},
    }))
  }
  const choice = render(2)
  assert.match(choice, /<option value="" selected="">Any available provider/)
  assert.doesNotMatch(choice.match(/<select[^>]*>/)?.[0] || "", /required/)
  assert.match(render(3), /Choose an available provider at the shop/)
})
