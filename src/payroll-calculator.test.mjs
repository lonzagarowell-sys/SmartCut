import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const helpers = {}
new Function("exports", ts.transpileModule(readFileSync(new URL("./finance.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(helpers)
const compiled = ts.transpileModule(
  source.slice(source.indexOf("function FinanceInput("), source.indexOf("function AdminSubscriptionControls(")),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText
const shell = ({ children }) => React.createElement("div", {}, children)
const empty = { records: [], status: "connected" }
function render({ rate = "20", sales = 1000, role = "Manager", existing = [], connected = true } = {}) {
  let buttons = []
  let inputs = []
  const writes = []
  const memory = []
  let cursor = 0
  const ui = {
    React, ...helpers, initialCollection: empty, inputClass: "",
    useState: (value) => {
      const index = cursor++
      if (memory[index] === undefined) memory[index] = value && typeof value === "object" ? { p: rate } : value
      return [memory[index], (next) => { memory[index] = typeof next === "function" ? next(memory[index]) : next }]
    },
    manilaDate: (date) => date ? date.toISOString().slice(0, 10) : "2026-10-12",
    isManager: (value) => ["Manager", "Administrator"].includes(value),
    numeric: (value) => Number(value || 0), peso: (value) => `PHP ${value}`,
    friendlyError: (error) => error.message,
    createPayrollStatement: async (data) => writes.push(data),
    Field: ({ label, children }) => {
      if (React.isValidElement(children) && children.props.type) inputs.push({ label, ...children.props })
      return React.createElement("div", {}, label, children)
    },
    PageHead: ({ title, children }) => React.createElement("div", {}, title, children),
    Button: (props) => { buttons.push(props); return React.createElement("button", { disabled: props.disabled }, props.children) },
    Metric: ({ label, value }) => React.createElement("div", {}, label, value),
    DataBoundary: shell, Badge: shell, Empty: () => null,
    Wallet: () => null, Plus: () => null, ArrowDownToLine: () => null,
  }
  const Payroll = new Function("ui", `const { ${Object.keys(ui).join(", ")} } = ui; ${compiled}; return Payroll;`)(ui)
  const props = {
    role, add: () => {}, state: { ...empty, records: existing },
    finance: { status: connected ? "connected" : "connecting", records: [{ id: "sale", providerId: "p", provider: "Ana", date: "2026-10-12", amount: sales }] },
    providers: [{ id: "p", name: "Ana" }],
  }
  let html
  const refresh = () => {
    cursor = 0
    buttons = []
    inputs = []
    html = renderToStaticMarkup(React.createElement(Payroll, props))
    return html
  }
  refresh()
  return { get html() { return html }, get buttons() { return buttons }, get inputs() { return inputs }, writes, refresh }
}
test("manager calculator updates rates and new live sales, and records exact daily pay", async () => {
  const result = render()
  assert.match(result.html, /Daily percentage calculator/)
  assert.match(result.html, /PHP 200/)
  await result.buttons.find((button) => button.children === "Record calculated pay").onClick()
  assert.deepEqual(result.writes[0], {
    providerId: "p", provider: "Ana", start: "2026-10-12", end: "2026-10-12",
    base: 200, net: 200, baseCents: 20000, netCents: 20000, status: "Recorded",
  })
  assert.match(render({ rate: "30" }).html, /PHP 300/)
  assert.match(render({ sales: 1500 }).html, /PHP 300/)
})
test("calculator remains hidden from providers and customers", () => {
  for (const role of ["Service Provider", "Customer"]) assert.doesNotMatch(render({ role }).html, /Daily percentage calculator|Record calculated pay/)
})
test("invalid rates, disconnected data, and overlapping statements block recording", () => {
  for (const options of [{ rate: "101" }, { connected: false }, { existing: [{ id: "old", providerId: "p", start: "2026-10-01", end: "2026-10-31" }] }]) {
    const result = render(options)
    assert.equal(result.buttons.find((button) => ["Record calculated pay", "Already recorded"].includes(button.children)).disabled, true)
  }
})

test("Today and Yesterday also filter statements by the covered pay day", () => {
  const result = render({ sales: 0, existing: [
    { id: "today", providerId: "p", provider: "Today provider", start: "2026-10-12", end: "2026-10-12", base: 100 },
    { id: "yesterday", providerId: "q", provider: "Yesterday provider", start: "2026-10-11", end: "2026-10-11", base: 200 },
    { id: "old", providerId: "r", provider: "Old provider", start: "2026-09-01", end: "2026-09-30", base: 300 },
  ] })
  assert.match(result.html, /PHP 100/)
  assert.doesNotMatch(result.html, /PHP 200|PHP 300/)
  result.buttons.find((button) => button.children === "Yesterday").onClick()
  result.refresh()
  assert.match(result.html, /Payroll statements · 2026-10-11/)
  assert.match(result.html, /PHP 200/)
  assert.doesNotMatch(result.html, /PHP 100|PHP 300/)
  result.buttons.find((button) => button.children === "Today").onClick()
  result.refresh()
  assert.match(result.html, /PHP 100/)
  assert.doesNotMatch(result.html, /PHP 200|PHP 300/)
  result.inputs.find((input) => input.label === "Choose date").onChange({ target: { value: "2026-09-15" } })
  result.refresh()
  assert.match(result.html, /Payroll statements · 2026-09-15/)
  assert.match(result.html, /PHP 300/)
  assert.doesNotMatch(result.html, /PHP 100|PHP 200/)
})

test("provider history shows all their recorded statements and Manila timestamps, not colleagues", () => {
  const result = render({ existing: [
    { id: "p-old", providerId: "p", provider: "Ana", start: "2026-09-01", end: "2026-09-01", base: 123, createdAt: { seconds: Date.parse("2026-09-01T05:30:00Z") / 1000 } },
    { id: "q-old", providerId: "q", provider: "Ben", start: "2026-09-01", end: "2026-09-01", base: 456 },
  ] })
  assert.doesNotMatch(result.html, /PHP 123|PHP 456/)
  result.buttons.find((button) => button.children === "View payroll history").onClick()
  result.refresh()
  assert.match(result.html, /Payroll history · all dates/)
  assert.match(result.html, /PHP 123/)
  assert.doesNotMatch(result.html, /PHP 456/)
  assert.match(result.html, /1:30 PM/)
  assert.match(result.html, /max-h-96 overflow-auto/)
  result.buttons.find((button) => button.children === "Clear provider filter").onClick()
  result.refresh()
  assert.match(result.html, /PHP 456/)
})

test("provider payroll views retain unfiltered statements without management controls", () => {
  const result = render({ role: "Service Provider", existing: [
    { id: "old", providerId: "p", provider: "Ana", start: "2026-09-01", end: "2026-09-01", base: 123 },
  ] })
  assert.match(result.html, /PHP 123/)
  assert.doesNotMatch(result.html, /View history|Choose date|View all recorded payroll|Recorded at/)
})
