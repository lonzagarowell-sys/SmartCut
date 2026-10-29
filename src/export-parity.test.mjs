import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { formatTime12 } from "./time-format.mjs"

const financeExports = {}
new Function("exports", ts.transpileModule(readFileSync(new URL("./finance.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(financeExports)
const adminExports = {}
new Function("exports", ts.transpileModule(readFileSync(new URL("./admin-records.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(adminExports)

const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const shell = ({ children }) => React.createElement("div", {}, children)
const icon = () => null
function exportFrom(component, next, props, view = "List") {
  const buttons = []
  const downloads = []
  const ui = {
    ...financeExports,
    adminRecordTime: adminExports.adminRecordTime,
    TEMPORARY_MANAGER_DATE_EDITING: true,
    AdminRecordEditButton: () => null,
    SalesDateFilter: shell, ProviderEarningsSummary: shell, PayrollCalculator: shell, PayrollProviderSelect: shell,
    payrollProviderKey: (record) => String(record.providerId || `legacy:${record.provider || record.rows?.[0] || "Legacy statement"}`),
    payrollRecordedAt: () => "Not recorded",
    React,
    useState: (initial) => [initial === "List" ? view : initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useMemo: (callback) => callback(),
    PageHead: ({ title, children }) => React.createElement("div", {}, title, children),
    Button: ({ children, ...button }) => {
      buttons.push({ children, ...button })
      return React.createElement("button", {}, children)
    },
    DataBoundary: shell, Badge: shell, Modal: shell, Field: shell,
    ErrorBox: () => null, Empty: () => null, BookingLine: () => null,
    Metric: ({ label, value }) => React.createElement("div", {}, label, value),
    VisitTypeBadge: () => null,
    cx: (...values) => values.filter(Boolean).join(" "),
    peso: (value) => `PHP ${Number(value).toFixed(2)}`,
    numeric: (value) => Number(value || 0),
    amountOf: (record) => Number(record.amount),
    recordDate: (record) => record.date,
    bookingAmount: (record) => record.amount,
    bookingClient: (record) => record.client,
    appointmentStatus: (status) => ({ Confirmed: "Accepted", "In Service": "In Progress" }[status] || status),
    formatTime12,
    awaitingPayment: (record) => ["Completed", "Rated"].includes(String(record.status)) &&
      record.paymentStatus === "Unpaid" && typeof record.amount === "number" && record.amount >= 0,
    isManager: (role) => ["Manager", "Administrator"].includes(role),
    manilaDate: (date = new Date("2026-10-12T04:00:00Z")) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
    download: (...args) => downloads.push(args),
    initialCollection: { records: [], status: "connected" },
    inputClass: "",
  }
  for (const name of ["Plus", "Search", "ArrowRight", "CreditCard", "Star",
    "ChevronLeft", "ChevronRight", "ArrowDownToLine", "Clock3", "CalendarDays",
    "CheckCircle2", "Scissors", "Check", "X", "Wallet", "TrendingUp"]) ui[name] = icon
  const compiled = ts.transpileModule(
    source.slice(source.indexOf(`function ${component}(`), source.indexOf(`function ${next}(`)),
    { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  for (const name of ["SalesDateFilter", "ProviderEarningsSummary", "PayrollCalculator", "PayrollProviderSelect", "payrollProviderKey", "payrollRecordedAt"])
    if (compiled.includes(`function ${name}(`)) delete ui[name]
  const Component = new Function("ui", `
    const { ${Object.keys(ui).join(", ")} } = ui;
    ${compiled}
    return ${component};
  `)(ui)
  const html = renderToStaticMarkup(React.createElement(Component, props))
  const button = buttons.find((button) => typeof button.onClick === "function" &&
    ["Export", "Export report", "Export transactions", "Export payments", "Download"].includes(button.children))
  assert.ok(button, `${component} export action`)
  if (!button.disabled) button.onClick()
  return { html, downloads, button }
}

const booking = {
  id: "appointment-one", client: "Maria", service: "Haircut", provider: "Barber",
  providerId: "barber", date: "2026-10-12", time: "09:00", amount: 150,
  status: "Confirmed", paymentStatus: "Unpaid", durationMinutes: 30,
  notes: "Client's complete note", scheduleId: "schedule",
}

test("appointment export matches statuses, amounts, notes, and the selected week", () => {
  const result = exportFrom("Appointments", "Services", {
    state: { status: "connected", records: [booking, { ...booking, id: "outside-week", date: "2026-11-01" }] },
    role: "Manager", providerUid: "manager", reviews: { records: [], status: "connected" },
    busy: false, run: () => {}, onCheckout: () => {}, onBook: () => {},
  }, "Week")
  const [, columns, rows] = result.downloads[0]
  assert.equal(rows.length, 1)
  const values = Object.fromEntries(columns.map((column, index) => [column, rows[0][index]]))
  assert.equal(values.Status, "Accepted")
  assert.equal(values.Time, "9:00 AM")
  assert.equal(values.PHP, "PHP 150.00")
  assert.equal(values.Notes, booking.notes)
  assert.equal(values["Payment status"], "Unpaid")
  assert.equal(values.Duration, "30 minutes")
  assert.equal(values["Appointment ID"], booking.id)
})

test("payroll PDF uses the displayed legacy fallback and includes status", () => {
  const result = exportFrom("Payroll", "Subscription", {
    state: { status: "connected", records: [{ id: "statement", date: "2026-10-12", rows: ["Barber", "250"] }] },
    role: "Manager", add: () => {},
  })
  const fields = Object.fromEntries(result.downloads[0][2])
  assert.equal(fields.Period, "Not recorded")
  assert.equal(fields.Base, "PHP 250.00")
  assert.equal(fields.Net, "PHP 250.00")
  assert.equal(fields.Status, "Recorded")
  assert.ok(result.html.includes(fields.Base))
})

test("analytics export includes the same provider totals and outcomes as the page", () => {
  const result = exportFrom("Analytics", "Payroll", {
    sales: { status: "connected", records: [{ id: "sale", provider: "Barber", date: "2026-10-12", amount: 150 }] },
    bookings: { status: "connected", records: [booking] },
  })
  const fields = Object.fromEntries(result.downloads[0][2])
  assert.equal(fields["Collected revenue"], "PHP 150.00")
  assert.equal(fields["Provider revenue · Barber"], "PHP 150.00")
  assert.equal(fields["Appointment outcome · Accepted"], "1")
  assert.equal(fields["Appointment outcome · Pending"], "0")
})

test("finance export includes exact row values and dashboard totals without treating a method as a provider", () => {
  const result = exportFrom("Finance", "Analytics", {
    page: "Payments",
    state: { status: "connected", records: [{ id: "receipt", client: "Maria", service: "Cut", amount: 150, method: "Cash", rows: ["date", "Maria", "Cut", "Cash", "150"], status: "Paid", time: "22:14" }] },
    appointments: [], appointmentsStatus: "connected", canCheckout: true, checkout: () => {},
  })
  const [, columns, rows, details] = result.downloads[0]
  assert.equal(columns.indexOf("PHP"), columns.indexOf("Service") + 1)
  assert.match(result.html, /Client \/ service<\/th><th[^>]*>Amount paid<\/th>/)
  assert.match(result.html, /Cut<\/p><\/td><td[^>]*>PHP 150\.00<\/td>/)
  assert.equal(rows[0][columns.indexOf("Provider")], "Not recorded")
  assert.equal(rows[0][columns.indexOf("Method")], "Cash")
  assert.equal(rows[0][columns.indexOf("PHP")], "PHP 150.00")
  assert.equal(rows[0][columns.indexOf("Recorded time (Asia/Manila)")], "10:14 PM")
  assert.equal(Object.fromEntries(details)["Gross sales"], "PHP 150.00")
})

test("payroll export is disabled until its source is connected", () => {
  const result = exportFrom("Payroll", "Subscription", {
    state: { status: "connecting", records: [{ id: "statement", date: "2026-10-12", base: 150, net: 150 }] },
    role: "Manager", add: () => {},
  })
  assert.equal(result.button.disabled, true)
  assert.equal(result.downloads.length, 0)
})
