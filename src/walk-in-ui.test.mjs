import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { canClaimWalkIn, walkInPaymentMethods } from "./walk-ins.mjs"
import { formatTime12, formatDateManila } from "./time-format.mjs"

// Render the actual isolated UI with existing shell primitives stubbed.
// No login, network requests, or Firebase writes occur in these checks.
const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const componentSource = source.slice(
  source.indexOf("function VisitTypeBadge"),
  source.indexOf("function ServiceDropdown"),
)
const compiled = ts.transpileModule(componentSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React,
  },
}).outputText
const icon = () => null
const Button = ({ children, icon, variant, ...props }) =>
  React.createElement("button", { type: "button", ...props }, children)
const Field = ({ children, label, hint }) =>
  React.createElement("label", {}, label, children, hint)
const shell = ({ children }) => React.createElement("div", {}, children)
const factory = new Function(
  "ui",
  `
  const { React, useState, useEffect, useRef, useMemo, Modal, Button, Field,
    DataBoundary, Badge, Empty, ErrorBox, PageHead, inputClass, cx, peso,
    isManager, CalendarDays, Store, ChevronDown, Search, Plus, Check,
    CheckCircle2, CreditCard, ArrowRight, ArrowLeft, Scissors,
    canClaimWalkIn, walkInPaymentMethods, manilaDate, createPaidWalkIn, moneyNumber } = ui;
  ${compiled}
  return { WalkInForm, BookingCustomerPicker, ServiceVisitModal, VisitTypeBadge };
`,
)
const controls = {
  React,
  useState: React.useState,
  useEffect: React.useEffect,
  useRef: React.useRef,
  useMemo: React.useMemo,
  Modal: shell,
  Button,
  Field,
  DataBoundary: shell,
  Badge: shell,
  Empty: ({ title }) => React.createElement("div", {}, title),
  ErrorBox: ({ message }) => React.createElement("div", {}, message),
  PageHead: ({ title, description }) =>
    React.createElement("div", {}, title, description),
  inputClass: "input",
  cx: (...values) => values.filter(Boolean).join(" "),
  peso: (value) => `PHP ${value.toFixed(2)}`,
  moneyNumber: (value) => Number(value),
  isManager: (role) => ["Manager", "Administrator"].includes(role),
  formatTime12,
  formatDateManila,
  SalesDateFilter: shell,
  awaitingPayment: (record) => ["Completed", "Rated"].includes(String(record.status)) &&
    record.paymentStatus === "Unpaid" && typeof record.amount === "number" && record.amount >= 0,
  CalendarDays: icon,
  Store: icon,
  ChevronDown: icon,
  Search: icon,
  Plus: icon,
  Check: icon,
  CheckCircle2: icon,
  CreditCard: icon,
  ArrowRight: icon,
  ArrowLeft: icon,
  Scissors: icon,
  canClaimWalkIn,
  walkInPaymentMethods,
  manilaDate: () => "2026-10-10",
}
const ui = factory(controls)
const bookingLineCompiled = ts.transpileModule(
  source.slice(
    source.indexOf("function BookingLine("),
    source.indexOf("function RevenuePanel("),
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React,
    },
  },
).outputText
const BookingLine = new Function(
  "ui",
  `
  const { React, cx, Badge, VisitTypeBadge, Clock3, Scissors, peso,
    bookingClient, bookingAmount, appointmentStatus, formatTime12, formatDateManila } = ui;
  ${bookingLineCompiled}
  return BookingLine;
`,
)({
  ...controls,
  VisitTypeBadge: ui.VisitTypeBadge,
  Clock3: icon,
  bookingClient: (record) => record.client,
  bookingAmount: (record) => record.amount,
  appointmentStatus: (status) => String(status),
})
const appointmentsCompiled = ts.transpileModule(
  source.slice(
    source.indexOf("function Appointments("),
    source.indexOf("function Services("),
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React,
    },
  },
).outputText
const Appointments = new Function(
  "ui",
  `
  const { React, useState, useMemo, useEffect, useRef, PageHead, Button,
    DataBoundary, Empty, Badge, Modal, Field, ErrorBox, cx, peso,
    isManager, manilaDate, Plus, Search, ArrowRight, CreditCard, Star,
    ChevronLeft, ChevronRight, ArrowDownToLine, Clock3, BookingLine,
    bookingClient, bookingAmount, appointmentStatus, CalendarDays,
    CheckCircle2, Scissors, Check, X, Users, formatTime12, awaitingPayment, SalesDateFilter, AdminRecordEditButton, TEMPORARY_MANAGER_DATE_EDITING } = ui;
  ${appointmentsCompiled}
  return Appointments;
`,
)({
  ...controls,
  ChevronLeft: icon,
  ChevronRight: icon,
  ArrowDownToLine: icon,
  Clock3: icon,
  Star: icon,
  X: icon,
  Users: icon,
  BookingLine,
  AdminRecordEditButton: () => null,
  TEMPORARY_MANAGER_DATE_EDITING: true,
  bookingClient: (record) => record.client,
  bookingAmount: (record) => record.amount,
  appointmentStatus: (status) => String(status),
})
const services = [
  {
    id: "cut",
    name: "Haircut",
    amount: 150,
    durationMinutes: 30,
    status: "Active",
    legacy: false,
  },
]
const providers = [
  { id: "barber", name: "Barber", active: true, role: "Service Provider" },
]

function walkInHarness({ state = {}, availableProviders = providers, business = { shopType: "team" } } = {}) {
  let cursor = 0
  let submit
  const changes = []
  const buttons = []
  const paid = []
  const values = { 2: "Test Client", 8: "150", 9: true, ...state }
  const local = factory({
    ...controls,
    React: { ...React, createElement: (type, props, ...children) => {
      if (type === "form") submit = props.onSubmit
      return React.createElement(type, props, ...children)
    } },
    useState: (initial) => {
      const index = cursor++
      const value = index in values ? values[index] : typeof initial === "function" ? initial() : initial
      return [value, (next) => changes.push({ index, value: next })]
    },
    useEffect: () => {},
    Button: (props) => { buttons.push(props); return React.createElement(Button, props) },
    createPaidWalkIn: async (id, input) => { paid.push(input); return { amount: 150, method: input.method } },
  })
  const html = renderToStaticMarkup(React.createElement(local.WalkInForm, {
    services, providers: availableProviders, business, selectedServiceId: "cut", tabs: null,
    close: () => {}, saved: () => {}, onBusyChange: () => {},
  }))
  return { html, changes, buttons, paid, submit: () => submit({ preventDefault() {} }) }
}

test("walk-in cannot advance or submit with no specific provider, including keyboard submission", async () => {
  const form = walkInHarness()
  assert.equal(form.buttons.find((button) => button.children === "Proceed to Payment").disabled, true)
  await form.submit()
  assert.ok(form.changes.some((change) => /specific active service provider/.test(change.value)))
  assert.equal(form.paid.length, 0)
  assert.doesNotMatch(form.html, /Any available/)
})

test("a specific active provider is required again at payment, even if a provider became inactive", async () => {
  for (const availableProviders of [[], [{ ...providers[0], active: false }], [{ ...providers[0], role: "Manager" }]]) {
    const form = walkInHarness({ state: { 1: "payment", 6: "barber" }, availableProviders })
    assert.equal(form.buttons.find((button) => button.children === "Confirm payment").disabled, true)
    await form.submit()
    assert.equal(form.paid.length, 0)
  }
})

test("walk-in accepts only Cash/E-wallet controls and submits the selected provider", async () => {
  for (const method of ["Cash", "E-wallet"]) {
    const form = walkInHarness({ state: { 1: "payment", 6: "barber", 7: method } })
    const methods = form.buttons.filter((button) => ["Cash", "E-wallet", "Card"].includes(button.children)).map((button) => button.children)
    assert.deepEqual(methods, ["Cash", "E-wallet"])
    assert.equal(form.buttons.find((button) => button.children === "Confirm payment").disabled, false)
    await form.submit()
    assert.equal(form.paid[0].requestedProviderId, "barber")
    assert.equal(form.paid[0].method, method)
  }
})

test("solo walk-ins proceed only with an active specifically identified manager provider", async () => {
  const form = walkInHarness({ business: { shopType: "solo", managerProviderId: "barber" } })
  assert.equal(form.buttons.find((button) => button.children === "Proceed to Payment").disabled, false)
  await form.submit()
  assert.ok(form.changes.some((change) => change.value === "payment"))
  const missing = walkInHarness({ business: { shopType: "solo", managerProviderId: "missing" } })
  assert.equal(missing.buttons.find((button) => button.children === "Proceed to Payment").disabled, true)
})

test("cash walk-in cannot record an underpaid total", async () => {
  const form = walkInHarness({ state: { 1: "payment", 6: "barber", 8: "149" } })
  await form.submit()
  assert.equal(form.paid.length, 0)
  assert.ok(form.changes.some((change) => /Cash received must cover/.test(change.value)))
})

test("returning to walk-in details clears the old payment confirmation", () => {
  const form = walkInHarness({ state: { 1: "payment", 6: "barber" } })
  form.buttons.find((button) => button.children === "Back").onClick()
  assert.ok(form.changes.some((change) => change.index === 9 && change.value === false))
  assert.ok(form.changes.some((change) => change.index === 1 && change.value === "details"))
})

test("walk-in renders client-only required details and no reservation controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(ui.WalkInForm, {
      services,
      providers,
      business: { shopType: "team" },
      selectedServiceId: "cut",
      tabs: null,
      close: () => {},
      saved: () => {},
      onBusyChange: () => {},
    }),
  )
  assert.match(html, /Client name/)
  assert.match(html, /Email \(optional\)/)
  assert.match(html, /Select a service provider/)
  assert.doesNotMatch(html, /Any available/)
  assert.match(html, /Proceed to Payment/)
  assert.doesNotMatch(html, /type="date"|type="time"|Reserve appointment/)
  assert.match(html, /Choose as many different active services as needed/)
})

test("selecting six services does not disable the remaining active menu items", () => {
  const buttons = []
  const serviceIds = Array.from({ length: 6 }, (_, index) => `service-${index}`)
  const many = factory({
    ...controls,
    useState: (initial) => [Array.isArray(initial) ? serviceIds : typeof initial === "function" ? initial() : initial, () => {}],
    useEffect: () => {},
    Button: (props) => { buttons.push(props); return React.createElement(Button, props) },
  })
  renderToStaticMarkup(React.createElement(many.WalkInForm, {
    services: Array.from({ length: 10 }, (_, index) => ({ ...services[0], id: `service-${index}`, name: `Service ${index}` })),
    providers, business: { shopType: "team" }, selectedServiceId: "", tabs: null,
    close: () => {}, saved: () => {}, onBusyChange: () => {},
  }))
  const menuButtons = buttons.filter((button) => typeof button["aria-pressed"] === "boolean")
  assert.equal(menuButtons.length, 10)
  assert.equal(menuButtons.every((button) => !button.disabled), true)
})

test("manager visit flow exposes distinct Booking and Walk-in controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(ui.ServiceVisitModal, {
      selectedServiceId: "cut",
      account: { uid: "manager", name: "Manager", role: "Manager" },
      services,
      providers,
      clients: [],
      bookingIssue: "",
      business: { shopType: "team", openingMinute: 540, closingMinute: 1080 },
      close: () => {},
      saved: () => {},
      walkInSaved: () => {},
    }),
  )
  assert.match(html, /Service visit type/)
  assert.match(html, /Booking/)
  assert.match(html, /Walk-in/)
  assert.match(html, /Reserve a future date and time/)
})

test("completed walk-ins are not rendered in appointment or dashboard queues", () => {
  assert.doesNotMatch(source, /<WalkInQueue/)
  assert.doesNotMatch(source, /names\.push\("clients", "walkins"\)/)
  assert.match(
    componentSource,
    /No reservation or additional acceptance, start, or completion steps are required/,
  )
})

test("manager booking controls work for another barber while unassigned providers cannot operate them", () => {
  const render = (role, status, uid, overrides = {}) =>
    renderToStaticMarkup(
      React.createElement(Appointments, {
        role,
        providerUid: uid,
        busy: false,
        run: () => {},
        onBook: () => {},
        onCheckout: () => {},
        reviews: { status: "connected", records: [] },
        state: {
          status: "connected",
          records: [
            {
              id: "reserved",
              client: "Maria",
              service: "Haircut",
              provider: "Barber",
              providerId: "barber",
              date: "2026-10-10",
              time: "09:00",
              amount: 150,
              durationMinutes: 30,
              scheduleId: "barber_2026-10-10",
              status,
              paymentStatus: "Unpaid",
              ...overrides,
            },
          ],
        },
      }),
    )
  assert.match(render("Manager", "Accepted", "manager"), /Start service/)
  assert.match(render("Manager", "Accepted", "manager"), /aria-label="Awaiting Service to Start"/)
  assert.match(render("Manager", "Accepted", "manager"), /Accepted · waiting for the customer to arrive/)
  assert.doesNotMatch(render("Manager", "In Progress", "manager"), /Accepted · waiting for the customer to arrive/)
  assert.match(render("Manager", "In Progress", "manager"), /Complete service/)
  assert.match(render("Administrator", "Accepted", "admin"), /Start service/)
  assert.match(render("Administrator", "In Progress", "admin"), /Complete service/)
  assert.doesNotMatch(
    render("Service Provider", "Accepted", "other"),
    /Start service/,
  )
  assert.match(
    render("Service Provider", "Accepted", "barber"),
    /Start service/,
  )
  assert.match(render("Service Provider", "In Progress", "barber"), /Complete service/)
  assert.doesNotMatch(render("Service Provider", "In Progress", "other"), /Complete service/)
  assert.doesNotMatch(render("Service Provider", "Accepted", "other"), /Maria|Provider: Barber/)
  assert.doesNotMatch(render("Service Provider", "Pending", "barber"), /Start service/)
  assert.match(render("Service Provider", "Completed", "barber"), /Record payment/)
  const otherProvider = render("Service Provider", "Completed", "other")
  assert.match(otherProvider, /Record payment/)
  assert.doesNotMatch(otherProvider, /Maria|Provider: Barber/)
  assert.doesNotMatch(render("Service Provider", "Completed", "barber"), /PHP 150/)
  assert.match(render("Manager", "Completed", "manager"), /Record payment/)
  const unassigned = { providerId: "", provider: "To be assigned at shop", providerPreference: "any" }
  assert.match(render("Manager", "Accepted", "manager", unassigned), /Assign provider/)
  assert.doesNotMatch(render("Manager", "Accepted", "manager", unassigned), /Start service/)
  assert.match(render("Service Provider", "Accepted", "barber", unassigned), /Take this booking/)
  assert.doesNotMatch(render("Service Provider", "Accepted", "barber", unassigned), /Start service/)
  assert.doesNotMatch(render("Service Provider", "Pending", "barber", unassigned), /Maria|Take this booking/)
})

test("service providers have no finance navigation or subscriptions", () => {
  const providerPages = source.slice(
    source.indexOf('"Service Provider": ['),
    source.indexOf('Customer: ['),
  )
  assert.doesNotMatch(providerPages, /"Sales"|"Payments"/)
  const subscription = source.slice(
    source.indexOf('const names = ["appointments"'),
    source.indexOf("const stops = names.map"),
  )
  assert.match(subscription, /isManager\(account.role\) \|\|\s*account.role === "Customer"\s*\)\s*names.push\("sales", "payments"\)/)
})

test("appointment layout groups bookings by date and presents uniform highlighted actions", () => {
  const base = {
    client: "Maria",
    service: "Haircut",
    provider: "Barber",
    providerId: "barber",
    time: "09:00",
    amount: 150,
    durationMinutes: 30,
    scheduleId: "reserved",
    status: "Pending",
    paymentStatus: "Unpaid",
  }
  const html = renderToStaticMarkup(
    React.createElement(Appointments, {
      role: "Manager",
      providerUid: "manager",
      busy: false,
      run: () => {},
      onBook: () => {},
      onCheckout: () => {},
      reviews: { status: "connected", records: [] },
      state: {
        status: "connected",
        records: [
          { ...base, id: "one", date: "2026-10-10" },
          { ...base, id: "two", date: "2026-10-10" },
          { ...base, id: "three", date: "2026-10-11" },
        ],
      },
    }),
  )
  assert.match(html, /Appointment status overview/)
  assert.match(html, /Awaiting approval/)
  assert.match(html, /2 bookings/)
  assert.match(html, /1 booking/)
  assert.match(html, /Accept booking/)
  assert.match(html, /Reject booking/)
  assert.match(html, /sm:w-40/)
  assert.match(html, /Appointment view/)
  assert.match(html, /Asia\/Manila/)
  assert.match(html, /Provider: Barber/)
})

test("service provider dashboard hides finance while management retains it", () => {
  const compiled = ts.transpileModule(
    source.slice(source.indexOf("function Overview("), source.indexOf("function BookingLine(")),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText
  const Overview = new Function("ui", `
    const { React, initialCollection, appointmentStatus, recordDate,
      manilaDate, amountOf, peso, PageHead, Metric, Wallet, CalendarDays,
      Clock3, CheckCircle2, isManager, CreditCard, ArrowRight, Button,
      DataBoundary, BookingLine, Empty, RevenuePanel, RatingsAndReviews } = ui;
    ${compiled}
    return Overview;
  `)({
    ...controls,
    initialCollection: { records: [], status: "connected" },
    appointmentStatus: String,
    recordDate: (record) => record.date,
    manilaDate: () => "2026-10-10",
    amountOf: (record) => record.amount,
    Metric: ({ label, value, note }) => React.createElement("div", {}, label, value, note),
    Wallet: icon,
    Clock3: icon,
    BookingLine,
    RevenuePanel: () => React.createElement("div", {}, "Recorded sales"),
    RatingsAndReviews: () => null,
  })
  const render = (role) => renderToStaticMarkup(React.createElement(Overview, {
    account: { role, uid: "barber" },
    go: () => {},
    workspace: {
      business: { name: "Test shop" },
      data: {
        appointments: { status: "connected", records: [{
          id: "booking", providerId: "barber", provider: "Barber", client: "Maria",
          service: "Haircut", status: "Accepted", date: "2026-10-10", time: "09:00", amount: 150,
        }] },
        sales: { status: "connected", records: [{ date: "2026-10-10", amount: 150 }] },
      },
    },
  }))
  const provider = render("Service Provider")
  assert.match(provider, /Assigned today|Your finished services/)
  assert.match(provider, /Record a payment|My payroll statements/)
  assert.doesNotMatch(provider, /Collected today|Recorded sales|PHP/)
  for (const role of ["Manager", "Administrator"]) {
    const manager = render(role)
    assert.match(manager, /Collected today/)
    assert.match(manager, /Recorded sales/)
    assert.match(manager, /Record a payment/)
    assert.match(manager, /PHP 150.00/)
  }
})

test("customer picker source caps the panel and keeps its add-client action fixed", () => {
  assert.match(componentSource, /max-h-60 flex-col/)
  assert.match(componentSource, /min-h-0 overflow-y-auto/)
  assert.match(componentSource, /sticky bottom-0 shrink-0/)
  assert.match(componentSource, /Search customers by name or email/)
})
