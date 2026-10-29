import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const code = ts.transpileModule(
  source.slice(source.indexOf("function SalesDateFilter("), source.indexOf("function ProviderEarningsSummary(")),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText
function harness() {
  const memory = []
  let cursor = 0
  let dates = ["", ""]
  let buttons = []
  let fields = []
  const ui = {
    React,
    useState: (initial) => {
      const index = cursor++
      if (memory[index] === undefined) memory[index] = initial
      return [memory[index], (value) => { memory[index] = typeof value === "function" ? value(memory[index]) : value }]
    },
    manilaDate: (date) => date ? date.toISOString().slice(0, 10) : "2026-10-13",
    Button: (props) => { buttons.push(props); return React.createElement("button", {}, props.children) },
    Field: ({ label, children }) => { fields.push({ label, ...children.props }); return React.createElement("div", {}, label, children) },
    FinanceInput: () => null,
  }
  const Component = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return SalesDateFilter;`)(ui)
  const render = () => {
    cursor = 0
    buttons = []
    fields = []
    return renderToStaticMarkup(React.createElement(Component, {
      start: dates[0], end: dates[1], change: (start, end) => { dates = [start, end] },
    }))
  }
  return { render, click: (label) => buttons.find((button) => button.children === label).onClick(),
    get dates() { return dates }, get fields() { return fields }, get buttons() { return buttons } }
}
test("quick date choices need no date inputs and select one complete day", () => {
  const ui = harness()
  ui.render()
  assert.equal(ui.fields.length, 0)
  ui.click("Today")
  assert.deepEqual(ui.dates, ["2026-10-13", "2026-10-13"])
  assert.match(ui.render(), /Showing: Today/)
  assert.equal(ui.buttons.find((button) => button.children === "Today")["aria-pressed"], true)
  ui.click("Yesterday")
  assert.deepEqual(ui.dates, ["2026-10-12", "2026-10-12"])
  ui.render()
  ui.click("All dates")
  assert.deepEqual(ui.dates, ["", ""])
})
test("custom choice starts with one date; range inputs appear only when requested", () => {
  const ui = harness()
  ui.render()
  ui.click("Choose date")
  ui.render()
  assert.deepEqual(ui.fields.map((field) => field.label), ["Date"])
  ui.fields[0].onChange({ target: { value: "2026-10-01" } })
  assert.deepEqual(ui.dates, ["2026-10-01", "2026-10-01"])
  ui.render()
  ui.click("Use a date range")
  ui.render()
  assert.deepEqual(ui.fields.map((field) => field.label), ["Start date", "End date"])
  ui.fields[1].onChange({ target: { value: "2026-10-13" } })
  assert.deepEqual(ui.dates, ["2026-10-01", "2026-10-13"])
  ui.render()
  ui.click("Use one day")
  assert.deepEqual(ui.dates, ["2026-10-01", "2026-10-01"])
})
test("range edits cannot leave reversed bounds or accidentally clear a date", () => {
  const ui = harness()
  ui.render()
  ui.click("Choose date")
  ui.render()
  ui.click("Use a date range")
  ui.render()
  ui.fields[0].onChange({ target: { value: "2026-10-20" } })
  assert.deepEqual(ui.dates, ["2026-10-20", "2026-10-20"])
  ui.render()
  ui.fields[1].onChange({ target: { value: "2026-10-10" } })
  assert.deepEqual(ui.dates, ["2026-10-10", "2026-10-10"])
  ui.render()
  ui.fields[0].onChange({ target: { value: "" } })
  assert.deepEqual(ui.dates, ["2026-10-10", "2026-10-10"])
})
