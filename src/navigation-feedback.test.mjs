import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText

test("action messages never flash across routes, browser Back, or late async completion", () => {
  let cursor = 0
  const memory = []
  const ui = {
    useRef: (initial) => { const index = cursor++; return memory[index] ||= { current: initial } },
    useState: (initial) => {
      const index = cursor++
      if (!(index in memory)) memory[index] = initial
      return [memory[index], (value) => { memory[index] = value }]
    },
  }
  const hook = new Function("ui", `const { useRef, useState } = ui; ${compile(app.slice(app.indexOf("function useRouteMessage("), app.indexOf("function DataBoundary(")))}; return useRouteMessage;`)(ui)
  const render = (scope) => { cursor = 0; return hook(scope) }
  const [, completeOldAction] = render("payments")
  completeOldAction("Saved successfully")
  assert.equal(render("payments")[0], "Saved successfully")
  assert.equal(render("overview")[0], "")
  completeOldAction("Old Firebase error")
  assert.equal(render("overview")[0], "")
  assert.equal(render("payments")[0], "")
  const [, completeCurrentAction] = render("payments")
  completeCurrentAction("Current Firebase error")
  assert.equal(render("payments")[0], "Current Firebase error")
})

test("returning to a workspace does not replay historical booking popups; new arrivals still alert", () => {
  const start = app.indexOf('  useEffect(() => {\n    if (!["Manager", "Service Provider"]')
  const end = app.indexOf('  if (!pathPage', start)
  let alerts = []
  const seenBookingAlerts = { current: null }
  const ui = {
    account: { role: "Manager" },
    data: { appointments: { status: "connected" }, notifications: { status: "connecting" } },
    notifications: [{ appointmentId: "old", type: "appointment-booked", read: false }],
    seenBookingAlerts,
    setBookingAlerts: (update) => { alerts = update(alerts) },
    useEffect: (effect) => effect(),
  }
  const emit = () => new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${compile(app.slice(start, end))}`)(ui)
  emit()
  assert.equal(seenBookingAlerts.current, null)
  ui.data.notifications.status = "connected"
  emit()
  assert.deepEqual(alerts, [])
  ui.notifications.push({ appointmentId: "new", type: "appointment-booked", read: false })
  emit()
  assert.deepEqual(alerts.map((record) => record.appointmentId), ["new"])
  emit()
  assert.equal(alerts.length, 1)
})

test("cached data uses neutral syncing UI and genuine errors remain visible", () => {
  const ui = {
    React, LoaderCircle: () => null,
    ErrorBox: ({ message }) => React.createElement("div", { role: "alert" }, message),
  }
  const Component = new Function("ui", `const { React, LoaderCircle, ErrorBox } = ui; ${compile(app.slice(app.indexOf("function DataBoundary("), app.indexOf("function Modal(")))}; return DataBoundary;`)(ui)
  const render = (state) => renderToStaticMarkup(React.createElement(Component, { state }, "Appointments"))
  const cached = render({ status: "connecting", records: [{ id: "booking" }] })
  assert.match(cached, /Syncing latest records/)
  assert.doesNotMatch(cached, /role="alert"|amber|Error/)
  assert.match(render({ status: "error", records: [], error: "Permission denied" }), /Permission denied/)
})

test("Administrator feedback inbox has no Firestore-rules button", () => {
  assert.doesNotMatch(app.slice(app.indexOf("function FeedbackPage(")), /Complete Firestore rules|smartcut-firestore\.rules\.txt/)
})
