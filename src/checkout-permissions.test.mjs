import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React }
const domain = ts.transpileModule(readFileSync(new URL("./domain.ts", import.meta.url), "utf8"), { compilerOptions }).outputText
const { canRecordAppointmentPayment, awaitingPayment } = await import(`data:text/javascript;base64,${Buffer.from(domain).toString("base64")}`)

test("payment permission requires a completed unpaid booking and the selected provider", () => {
  for (const status of ["Completed", "Rated"]) {
    assert.equal(canRecordAppointmentPayment("Service Provider", status, "Unpaid", true), true)
    assert.equal(canRecordAppointmentPayment("Service Provider", status, "Unpaid", false), false)
    for (const role of ["Manager", "Administrator"])
      assert.equal(canRecordAppointmentPayment(role, status, "Unpaid", false), true)
  }
  for (const status of ["Pending", "Accepted", "In Progress"])
    assert.equal(canRecordAppointmentPayment("Service Provider", status, "Unpaid", true), false)
  assert.equal(canRecordAppointmentPayment("Service Provider", "Completed", "Paid", true), false)
  assert.equal(canRecordAppointmentPayment("Customer", "Completed", "Unpaid", true), false)
})

const firebase = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const checkoutCode = ts.transpileModule(
  firebase.slice(firebase.indexOf("export async function checkoutAppointment("), firebase.indexOf("export function subscribeNotifications(")),
  { compilerOptions },
).outputText.replace("export async function", "async function")

function checkoutHarness(role = "Service Provider", assigned = true, active = true) {
  const booking = {
    status: "Completed", paymentStatus: "Unpaid", providerId: assigned ? "provider" : "other",
    amount: 150, client: "Maria", service: "Haircut", provider: "Barber", date: "2026-10-12", customerId: "customer",
  }
  const records = {
    "shops/shop/appointments/booking": booking,
    "users/provider": { role },
    "shops/shop/team/provider": { role: "Service Provider", active },
  }
  const reads = []
  const writes = []
  const transaction = {
    get: async (path) => {
      reads.push(path)
      return { exists: () => !!records[path], data: () => records[path] }
    },
    set: (path, value) => { writes.push({ path, value }); records[path] = value },
    update: (path, value) => { writes.push({ path, value }); Object.assign(records[path], value) },
  }
  const ui = {
    businessId: () => "shop", currentUser: () => ({ uid: "provider" }),
    db: {}, runTransaction: async (_, callback) => callback(transaction),
    shopDoc: (shop, collection, id) => `shops/${shop}/${collection}/${id}`,
    shopCollection: (shop, collection) => `shops/${shop}/${collection}`,
    doc: (...args) => typeof args[0] === "string" ? `${args[0]}/notification` : args.slice(1).join("/"),
    serverTimestamp: () => "server-time",
    appointmentStatus: String, canRecordAppointmentPayment,
  }
  const checkout = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${checkoutCode}; return checkoutAppointment;`)(ui)
  return { checkout, reads, writes, records }
}

test("provider checkout writes matching finance records without reading them and prevents a second payment", async () => {
  const mock = checkoutHarness()
  await mock.checkout("booking", "Cash")
  assert.ok(mock.reads.every((path) => !/\/(payments|sales)\//.test(path)))
  const payment = mock.records["shops/shop/payments/booking"]
  assert.equal(payment.amount, 150)
  assert.equal(payment.createdBy, "provider")
  assert.deepEqual(payment, mock.records["shops/shop/sales/booking"])
  assert.equal(mock.records["shops/shop/appointments/booking"].paymentStatus, "Paid")
  const writes = mock.writes.length
  await assert.rejects(mock.checkout("booking", "Cash"), /already been paid/)
  assert.equal(mock.writes.length, writes)
})

test("unassigned and inactive providers cannot write a payment", async () => {
  for (const [assigned, active] of [[false, true], [true, false]]) {
    const mock = checkoutHarness("Service Provider", assigned, active)
    await assert.rejects(mock.checkout("booking", "Cash"), /assigned active service provider/)
    assert.equal(mock.writes.length, 0)
  }
  const manager = checkoutHarness("Manager", false)
  await manager.checkout("booking", "Card")
  assert.equal(manager.records["shops/shop/payments/booking"].method, "Card")
})

test("provider checkout UI hides amounts and receipts while retaining confirmation", () => {
  const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
  const code = ts.transpileModule(
    source.slice(source.indexOf("function CheckoutModal("), source.indexOf("function PayrollModal(")),
    { compilerOptions },
  ).outputText
  const shell = ({ children }) => React.createElement("div", {}, children)
  const ui = {
    React, useState: React.useState, useRef: React.useRef, Modal: shell, awaitingPayment,
    Field: ({ children, label }) => React.createElement("div", {}, label, children),
    Button: ({ children }) => React.createElement("button", {}, children),
    ErrorBox: () => null, Check: () => null,
    Empty: ({ title, description, action }) => React.createElement("div", {}, title, description, action),
    CheckCircle2: () => null, Clock3: () => null,
    bookingAmount: (record) => record.amount, bookingClient: (record) => record.client,
    peso: (amount) => `PHP ${amount}`, numeric: Number, inputClass: "",
  }
  const Checkout = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return CheckoutModal;`)(ui)
  const render = (statusOnly) => renderToStaticMarkup(React.createElement(Checkout, {
    appointment: { id: "booking", client: "Maria", service: "Cut", amount: 150, status: "Completed", paymentStatus: "Unpaid" }, statusOnly,
    close: () => {}, saved: () => {},
  }))
  const provider = render(true)
  assert.match(provider, /Confirm received payment/)
  assert.match(provider, /appointment will show Paid/)
  assert.doesNotMatch(provider, /PHP 150|Cash received|Change due/)
  assert.match(render(false), /PHP 150/)
})

test("rules keep finance reads private while allowing narrowly validated provider checkout", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
  assert.match(rules, /canCollect\(resource.data\)/)
  assert.match(rules, /canCollect\(before\)/)
  assert.match(rules, /allow read: if collectionName in \["sales", "payments"\] &&\s*\(manager\(\) \|\| \(role\(\) == "Customer" && owner\(resource.data\)\)\)/)
})
