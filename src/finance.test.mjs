import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { formatTime12 } from "./time-format.mjs"

const adminExports = {}
new Function("exports", ts.transpileModule(
  readFileSync(new URL("./admin-records.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(adminExports)
const { adminRecordTime } = adminExports

const compiled = ts.transpileModule(
  readFileSync(new URL("./finance.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText
const exports = {}
new Function("exports", compiled)(exports)
const { combinedFinance, reconcileFinance, financeDate, financeRange, providerEarnings, percentagePay } = exports
const state = (records, status = "connected") => ({ records, status })

test("deleting either ledger or its primary visit removes all surviving financial mirrors", () => {
  for (const primary of ["appointments", "walkins"]) {
    const receipt = { id: "visit", [primary === "walkins" ? "walkInId" : "appointmentId"]: "visit", amount: 150 }
    const data = { sales: state([receipt]), payments: state([receipt]), appointments: state([]), walkins: state([]), [primary]: state([{ id: "visit" }]) }
    assert.equal(reconcileFinance(data).sales.records.length, 1)
    for (const name of ["sales", "payments", primary]) {
      const result = reconcileFinance({ ...data, [name]: state([]) })
      assert.deepEqual(result.sales.records, [])
      assert.deepEqual(result.payments.records, [])
      assert.equal(providerEarnings(result.sales.records).length, 0)
    }
    // A later receipt metadata event cannot resurrect a deleted visit.
    assert.deepEqual(reconcileFinance({ ...data, [primary]: state([]), payments: state([{ ...receipt, method: "Cash" }]) }).payments.records, [])
  }
})

test("reconciliation preserves unlinked legacy ledgers and reports source listener failures", () => {
  const data = { sales: state([{ id: "legacy", amount: 100 }]), payments: state([]), appointments: state([]), walkins: state([]) }
  assert.equal(reconcileFinance(data).sales.records.length, 1)
  const failed = reconcileFinance({ ...data, walkins: { records: [], status: "error", error: "Access denied" } })
  assert.equal(failed.sales.status, "error")
  assert.equal(failed.sales.error, "Access denied")
  assert.equal(reconcileFinance({ ...data, appointments: state([], "connecting") }).payments.status, "connecting")
})

test("mirrored sales and payments count once, preferring the receipt", () => {
  const result = combinedFinance(
    state([{ id: "one", amount: 150, provider: "Barber" }]),
    state([{ id: "one", amount: 150, method: "Cash" }]),
  )
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].amount, 150)
  assert.equal(result.records[0].provider, "Barber")
  assert.equal(result.records[0].method, "Cash")
})

test("legacy records from either ledger retain the correct amounts and methods", () => {
  const result = combinedFinance(
    state([{ id: "sale-only", rows: ["date", "Client", "Cut", "Barber", "Cash", "150"] }]),
    state([{ id: "payment-only", rows: ["date", "Client", "Cut", "Card", "200"] }]),
  )
  assert.equal(result.records.length, 2)
  assert.deepEqual(result.records.map((record) => record.amount), ["150", "200"])
  assert.deepEqual(result.records.map((record) => record.method), ["Cash", "Card"])
})

test("combined ledger does not claim successful sync while either collection failed", () => {
  assert.equal(combinedFinance(state([]), state([], "connecting")).status, "connecting")
  const result = combinedFinance(state([]), { ...state([], "error"), error: "Read failed" })
  assert.equal(result.status, "error")
  assert.equal(result.error, "Read failed")
})

const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const uiCompiled = ts.transpileModule(
  source.slice(source.indexOf("function Finance("), source.indexOf("function Analytics(")),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText
const shell = ({ children }) => React.createElement("div", {}, children)
const icon = () => null
const Finance = new Function("ui", `
  const { React, useState, amountOf, recordDate, bookingAmount, bookingClient,
    peso, PageHead, Button, Metric, ArrowDownToLine, TrendingUp, CreditCard,
    Wallet, Clock3, Search, DataBoundary, VisitTypeBadge, Badge, Empty, awaitingPayment,
    financeDate, financeRange, adminRecordTime, formatTime12, SalesDateFilter, ProviderEarningsSummary } = ui;
  ${uiCompiled}
  return Finance;
`)({
  React, useState: React.useState,
  financeDate, financeRange, adminRecordTime, formatTime12, SalesDateFilter: shell, ProviderEarningsSummary: shell,
  amountOf: (record) => Number(record.amount),
  recordDate: (record) => record.date,
  bookingAmount: (record) => record.amount,
  bookingClient: (record) => record.client,
  awaitingPayment: (record) => ["Completed", "Rated"].includes(String(record.status)) &&
    record.paymentStatus === "Unpaid" && typeof record.amount === "number" && record.amount >= 0,
  peso: (value) => `PHP ${value}`,
  PageHead: ({ title, description, children }) => React.createElement("div", {}, title, description, children),
  Button: ({ children }) => React.createElement("button", {}, children),
  Metric: ({ label, value }) => React.createElement("div", {}, label, value),
  ArrowDownToLine: icon, TrendingUp: icon, CreditCard: icon,
  Wallet: icon, Clock3: icon, Search: icon, DataBoundary: shell,
  VisitTypeBadge: ({ type }) => React.createElement("span", {}, type),
  Badge: shell, Empty: ({ title }) => React.createElement("div", {}, title),
})

test("one management page includes revenue, collection, providers, and receipts", () => {
  const render = (canCheckout) => renderToStaticMarkup(React.createElement(Finance, {
    page: "Payments",
    state: state([{ id: "paid", client: "Maria", provider: "Barber", service: "Cut", date: "2026-10-12", amount: 150, method: "Cash", status: "Paid" }]),
    appointments: [{ id: "due", client: "Ana", status: "Completed", paymentStatus: "Unpaid", amount: 200 }],
    appointmentsStatus: "connected", canCheckout, checkout: () => {},
  }))
  const manager = render(true)
  for (const text of ["Sales &amp; Payments", "Gross sales", "Transactions", "Average sale", "Awaiting collection", "Ready for payment", "Barber", "Receipt"])
    assert.ok(manager.includes(text), text)
  const customer = render(false)
  assert.match(customer, /Your payments/)
  assert.doesNotMatch(customer, /Ready for payment|Gross sales/)
})

test("navigation has one finance entry and old sales URLs open it", () => {
  const modules = source.slice(source.indexOf("const modules:"), source.indexOf("const initialCollection"))
  assert.doesNotMatch(modules, /page: "Sales"/)
  assert.match(modules, /page: "Payments"/)
  assert.match(source, /location.pathname === "\/sales" \? "Payments"/)
})

test("shared finance rows show corrected exact times but never Admin edit history or controls", () => {
  const html = renderToStaticMarkup(React.createElement(Finance, {
    page: "Payments",
    state: state([{ id: "corrected", client: "Maria", service: "Cut", amount: 150, status: "Paid",
      date: "2026-10-12", time: "22:14", adminEditedAt: { seconds: 1800000000 }, editedByAdmin: "admin" }]),
    appointments: [], appointmentsStatus: "connected", canCheckout: false, admin: false, checkout: () => {},
  }))
  assert.match(html, /10:14 PM/)
  assert.doesNotMatch(html, /Edited by Admin|Edit record|adminEditedAt|editedByAdmin/)
})

test("payment dates use Manila recording timestamps rather than booking dates", () => {
  assert.equal(financeDate({ id: "late-payment", date: "2026-10-01", createdAt: { seconds: Date.parse("2026-10-12T16:01:00Z") / 1000 } }), "2026-10-13")
  assert.equal(financeDate({ id: "old", date: "2026-10-01" }), "2026-10-01")
})

test("date ranges are inclusive and provider earnings follow new ledger records", () => {
  const ledger = [{ id: "a", date: "2026-10-12", providerId: "p", provider: "Ana", amount: 1000 },
    { id: "b", date: "2026-10-13", providerId: "p", provider: "Ana", amount: 250 },
    { id: "c", date: "2026-10-14", providerId: "q", provider: "Ben", amount: 500 }]
  assert.equal(providerEarnings(financeRange(ledger, "2026-10-12", "2026-10-12"))[0].earnings, 1000)
  assert.equal(providerEarnings(financeRange(ledger, "2026-10-12", "2026-10-13"))[0].earnings, 1250)
  assert.equal(providerEarnings([...ledger.slice(0, 1), { ...ledger[0], id: "new", amount: 50 }])[0].earnings, 1050)
  assert.equal(financeRange([{ id: "no-date" }], "2026-10-12", "2026-10-13").length, 0)
})

test("percentage calculator rounds centavos and rejects invalid percentages", () => {
  assert.equal(percentagePay(1000, "20"), 200)
  assert.equal(percentagePay(1000, "30"), 300)
  assert.equal(percentagePay(123.45, "20"), 24.69)
  for (const rate of ["", " ", "-1", "101", "NaN"]) assert.equal(percentagePay(1000, rate), undefined)
  assert.equal(percentagePay(1000, "0"), 0)
})

test("legacy provider names cannot silently become payroll provider IDs", () => {
  const result = providerEarnings([{ id: "old", provider: "Ana", amount: 100 }], [{ id: "p", name: "Ana" }])
  assert.equal(result.find((entry) => entry.id === "p").earnings, 0)
  assert.equal(result.find((entry) => entry.id === "").earnings, 100)
})

test("unassigned walk-ins are never shown as payroll providers or assigned to a real person's earnings", () => {
  const records = [
    { id: "unassigned", type: "Walk-in", providerId: "", provider: "Any available", amount: 900 },
    { id: "unknown", type: "Walk-in", providerId: "", provider: "Ana", amount: 700 },
    { id: "assigned", type: "Walk-in", providerId: "p", provider: "Ana", amount: 100 },
  ]
  const result = providerEarnings(records, [{ id: "p", name: "Ana" }])
  assert.deepEqual(result, [{ id: "p", name: "Ana", cents: 10000, count: 1, earnings: 100 }])
  assert.equal(records.reduce((sum, record) => sum + record.amount, 0), 1700, "revenue history remains untouched")
  assert.equal(providerEarnings([{ id: "legacy-any", provider: "Any available provider", amount: 500 }]).length, 0)
  assert.equal(providerEarnings([{ id: "legacy-walkin", walkInId: "legacy-walkin", provider: "Ana", amount: 500 }]).length, 0)
})
