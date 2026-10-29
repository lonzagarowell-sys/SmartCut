import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { formatTime12, parseTime24, timeTo24, formatNotificationTime } from "./time-format.mjs"
import { friendlyErrorMessage } from "./error-messages.mjs"

const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React }
const domainCode = ts.transpileModule(readFileSync(new URL("./domain.ts", import.meta.url), "utf8"), { compilerOptions: options }).outputText
const domain = await import(`data:text/javascript;base64,${Buffer.from(domainCode).toString("base64")}`)
const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const shell = ({ children }) => React.createElement("div", {}, children)
const icon = () => null
const controls = {
  React, ...domain, formatTime12, parseTime24, timeTo24,
  useState: React.useState, useEffect: React.useEffect, useRef: React.useRef, useMemo: React.useMemo,
  PageHead: ({ title, children }) => React.createElement("div", {}, title, children),
  Modal: shell, DataBoundary: shell, Badge: shell, Field: shell,
  SalesDateFilter: shell,
  Empty: ({ title, description }) => React.createElement("div", {}, title, description),
  ErrorBox: ({ message }) => React.createElement("div", {}, message),
  Button: ({ children }) => React.createElement("button", {}, children),
  BookingLine: ({ record }) => React.createElement("div", {}, record.client, formatTime12(record.time)),
  cx: (...values) => values.filter(Boolean).join(" "),
  isManager: (role) => ["Manager", "Administrator"].includes(role),
  bookingClient: (record) => record.client,
  bookingAmount: (record) => record.amount,
  inputClass: "",
}
for (const name of ["Plus", "Search", "ArrowRight", "CreditCard", "Star", "ChevronLeft", "ChevronRight",
  "ArrowDownToLine", "Clock3", "CalendarDays", "CheckCircle2", "Scissors", "Check", "X", "Users"]) controls[name] = icon

function component(name, next, ui) {
  const code = ts.transpileModule(
    source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`)),
    { compilerOptions: options },
  ).outputText
  return new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return ${name};`)(ui)
}

test("every minute round-trips between stored 24-hour time and explicit AM/PM controls", () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const raw = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      const display = formatTime12(raw)
      const match = display.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/)
      assert.ok(match)
      assert.equal(timeTo24(match[1], match[2], match[3]), raw)
    }
  }
  assert.equal(formatTime12("00:00"), "12:00 AM")
  assert.equal(formatTime12("12:00"), "12:00 PM")
  assert.equal(formatTime12("16:15"), "4:15 PM")
  assert.equal(formatTime12("09:00 AM"), "9:00 AM")
  assert.equal(formatTime12("24:00"), "—")
})

test("time picker visibly uses AM/PM but writes unchanged canonical HH:mm", () => {
  const updates = []
  const Picker = component("TimePicker", "ErrorBox", controls)
  const element = Picker({ value: "16:15", change: (value) => updates.push(value), label: "Booking time" })
  const html = renderToStaticMarkup(element)
  assert.match(html, /value="4" selected/)
  assert.match(html, /value="PM" selected/)
  const [hour, minute, period] = element.props.children
  period.props.onChange({ target: { value: "AM" } })
  hour.props.onChange({ target: { value: "12" } })
  minute.props.onChange({ target: { value: "30" } })
  assert.deepEqual(updates, ["04:15", "12:15", "16:30"])
  assert.doesNotMatch(source, /type="time"/)
})

test("stored notification text gets AM/PM without duplicating an existing period", () => {
  assert.equal(formatNotificationTime("Booked at 16:15.", "16:15"), "Booked at 4:15 PM.")
  assert.equal(formatNotificationTime("Booked at 12:00 PM.", "12:00"), "Booked at 12:00 PM.")
})

test("temporary Manager time controls offer every minute with explicit AM/PM and disable while saving", () => {
  const updates = []
  const Picker = component("TimePicker", "ErrorBox", controls)
  const element = Picker({ value: "18:15", label: "Record time", minutePrecision: true, disabled: true, change: (value) => updates.push(value) })
  const [hour, minute, period] = element.props.children
  assert.equal(minute.props.children.length, 60)
  for (const select of [hour, minute, period]) assert.equal(select.props.disabled, true)
  minute.props.onChange({ target: { value: "14" } })
  period.props.onChange({ target: { value: "AM" } })
  assert.deepEqual(updates, ["18:14", "06:15"])
  const html = renderToStaticMarkup(element)
  assert.match(html, /value="6" selected/)
  assert.match(html, /value="PM" selected/)
})

const base = {
  providerId: "one", provider: "Barber", service: "Cut", amount: 150,
  paymentStatus: "Unpaid", status: "Completed",
  date: "2099-10-12", time: "16:15", scheduleId: "schedule",
}
function appointments(records, role = "Manager", status = "connected") {
  const buttons = []
  const setters = []
  const ui = {
    ...controls,
    TEMPORARY_MANAGER_DATE_EDITING: true,
    AdminRecordEditButton: () => null,
    useState: (initial) => [initial === "All statuses" ? "Record payment" : initial,
      (value) => setters.push([initial, value])],
    Button: ({ children, ...props }) => {
      buttons.push({ children, ...props })
      return React.createElement("button", {}, children)
    },
  }
  const Appointments = component("Appointments", "Services", ui)
  const html = renderToStaticMarkup(React.createElement(Appointments, {
    state: { records, status }, role, providerUid: "one", reviews: { records: [], status: "connected" },
    busy: false, run: () => {}, onCheckout: () => {}, onBook: () => {},
  }))
  return { html, buttons, setters }
}

test("Record payment filter includes completed/rated unpaid bookings and updates when paid", () => {
  const records = [
    { ...base, id: "one", client: "Ready One" },
    { ...base, id: "two", client: "Ready Two", status: "Rated" },
    { ...base, id: "paid", client: "Already Collected", paymentStatus: "Paid" },
    { ...base, id: "pending", client: "Not Completed", status: "Pending" },
  ]
  const result = appointments(records)
  assert.match(result.html, /Ready One/)
  assert.match(result.html, /Ready Two/)
  assert.doesNotMatch(result.html, /Already Collected|Not Completed/)
  assert.match(result.html, /4:15 PM/)
  assert.ok(result.buttons.some((button) => button["aria-pressed"] === true &&
    renderToStaticMarkup(React.createElement(React.Fragment, {}, button.children)).includes("Record payment")))
  const afterPayment = appointments(records.map((record) => ({ ...record, paymentStatus: "Paid" })))
  assert.doesNotMatch(afterPayment.html, /Ready One|Ready Two/)
  assert.match(afterPayment.html, /No completed unpaid bookings/)
})

test("payment filter selects List view and providers get an assigned-service payment filter", () => {
  const manager = appointments([{ ...base, id: "one", client: "Maria" }])
  const tile = manager.buttons.find((button) => button["aria-pressed"] !== undefined &&
    renderToStaticMarkup(React.createElement(React.Fragment, {}, button.children)).includes("Record payment"))
  tile.onClick()
  assert.deepEqual(manager.setters.slice(-2), [["All statuses", "Record payment"], ["List", "List"]])
  const provider = appointments([{ ...base, id: "one", client: "Maria" }], "Service Provider")
  assert.match(provider.html, /<option[^>]*>Record payment<\/option>/)
})

test("appointment writes are disabled while data is cached or pending confirmation", () => {
  const result = appointments([{ ...base, id: "one", client: "Maria" }], "Manager", "connecting")
  const recordPayment = result.buttons.find((button) => button.children === "Record payment")
  assert.ok(recordPayment)
  assert.equal(recordPayment.disabled, true)
})

test("errors give safe, actionable guidance without exposing unknown backend messages", () => {
  assert.match(friendlyErrorMessage({ code: "firestore/failed-precondition", message: "query requires an index" }), /index.*Enabled/)
  assert.match(friendlyErrorMessage({ code: "firestore/deadline-exceeded" }), /latest booking or Paid status/)
  assert.match(friendlyErrorMessage({ code: "firestore/aborted" }), /another session/)
  assert.match(friendlyErrorMessage({ code: "firestore/unavailable" }), /not confirmed/)
  assert.doesNotMatch(friendlyErrorMessage({ code: "firestore/internal", message: "private backend details" }), /private backend details/)
  assert.equal(friendlyErrorMessage(new Error("Cash received must cover the appointment total.")), "Cash received must cover the appointment total.")
})

test("rule-expression limits give deployment guidance rather than suggesting a role change", () => {
  const message = friendlyErrorMessage({ code: "firestore/permission-denied",
    message: "Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. private-path" })
  assert.match(message, /evaluation limit.*latest SmartCut rules/)
  assert.doesNotMatch(message, /Check your role|private-path/)
  assert.match(friendlyErrorMessage({ code: "firestore/permission-denied" }), /Access denied/)
})

test("payment dialog uses live status and prevents checkout after another session paid", () => {
  const ui = { ...controls, numeric: Number }
  const Checkout = component("CheckoutModal", "PayrollModal", ui)
  const render = (paymentStatus, confirmed = true) => renderToStaticMarkup(React.createElement(Checkout, {
    appointment: { ...base, id: "one", client: "Maria", paymentStatus }, confirmed,
    close: () => {}, saved: () => {}, statusOnly: true,
  }))
  assert.match(render("Paid"), /already been paid/)
  assert.doesNotMatch(render("Paid"), /Confirm received payment/)
  assert.match(render("Unpaid", false), /Wait for the latest booking status/)
  assert.doesNotMatch(render("Unpaid", false), /Confirm received payment/)
  assert.match(source, /appointment=\{liveCheckout\}/)
  assert.match(source, /actionPending.current = true/)
})
