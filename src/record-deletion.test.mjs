import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React }
const code = ts.transpileModule(source.slice(source.indexOf("export async function deleteShopRecord("), source.indexOf("export async function claimWalkIn(")), { compilerOptions: options }).outputText
const helper = {}
new Function("exports", ts.transpileModule(readFileSync(new URL("./admin-records.ts", import.meta.url), "utf8"), { compilerOptions: options }).outputText)(helper)
const original = { id: "visit", client: "Maria", service: "Cut", date: "2026-10-12", time: "10:14", amount: 150,
  status: "Completed", paymentStatus: "Paid", scheduleId: "one_2026-10-12" }

function harness({ role = "Manager", member = "Manager", enabled = true, collectionName = "appointments", record = original } = {}) {
  const path = (name, id = record.id) => `shops/shop/${name}/${id}`
  const receipt = { id: record.id, appointmentId: record.id, amount: record.amount }
  const data = new Map([
    ["users/actor", { role }], [path("members", "actor"), { role: member }],
    [path(collectionName), { ...record }],
    [path("sales"), receipt], [path("payments"), receipt],
    [path("appointmentSchedules", original.scheduleId), { slots: { "600": record.id, "615": record.id, "630": "other", "645": "other" } }],
    [path("reviews"), { appointmentId: record.id }],
  ])
  const ref = (path) => ({ path })
  const ui = { ...helper, TEMPORARY_MANAGER_RECORD_DELETION: enabled,
    businessId: () => "shop", currentUser: () => ({ uid: "actor" }), db: {},
    doc: (_, ...parts) => ref(parts.join("/")), shopDoc: (shop, name, id) => ref(`shops/${shop}/${name}/${id}`),
    serverTimestamp: () => "SERVER",
    runTransaction: async (_, operation) => {
      const writes = []
      await operation({
        get: async (reference) => {
          assert.equal(writes.length, 0, "all reads must precede writes")
          return { ref: reference, exists: () => data.has(reference.path), data: () => structuredClone(data.get(reference.path)) }
        },
        set: (reference, value) => writes.push(() => data.set(reference.path, value)),
        delete: (reference) => writes.push(() => data.delete(reference.path)),
      })
      writes.forEach((write) => write())
    },
  }
  const exports = {}
  new Function("exports", "ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}`)(exports, ui)
  return { data, path, remove: (shop = "shop") => exports.deleteShopRecord(shop, collectionName, record) }
}

test("deletion atomically removes booking, both receipts and rating, releasing only its slots", async () => {
  const ui = harness()
  await ui.remove()
  for (const name of ["appointments", "sales", "payments", "reviews"]) assert.equal(ui.data.has(ui.path(name)), false)
  assert.deepEqual(ui.data.get(ui.path("appointmentSchedules", original.scheduleId)).slots, { "630": "other", "645": "other" })
  await ui.remove() // A repeated acknowledgement/retry is harmless.
})

test("a surviving receipt resolves and deletes its linked primary visit", async () => {
  const record = { ...original, appointmentId: original.id }
  const ui = harness({ collectionName: "payments", record })
  ui.data.set(ui.path("payments"), record)
  ui.data.set(ui.path("appointments"), original)
  await ui.remove()
  for (const name of ["appointments", "sales", "payments"]) assert.equal(ui.data.has(ui.path(name)), false)
})

test("walk-in deletion removes both ledgers without touching booking calendars or ratings", async () => {
  const ui = harness({ collectionName: "walkins", record: { ...original, type: "Walk-in", walkInId: original.id } })
  await ui.remove()
  for (const name of ["walkins", "sales", "payments"]) assert.equal(ui.data.has(ui.path(name)), false)
  assert.equal(ui.data.has(ui.path("reviews")), true)
  assert.equal(ui.data.get(ui.path("appointmentSchedules", original.scheduleId)).slots["600"], original.id)
})

test("foreign roles, foreign shops, stale records, and revoked Manager access cannot delete", async () => {
  for (const settings of [{ role: "Customer" }, { role: "Service Provider" }, { member: "Customer" }, { enabled: false }]) {
    const ui = harness(settings)
    await assert.rejects(ui.remove(), /authorized Manager/)
    assert.equal(ui.data.has(ui.path("appointments")), true)
  }
  await assert.rejects(harness().remove("other-shop"), /selected shop changed/)
  const stale = harness()
  stale.data.get(stale.path("appointments")).amount = 999
  await assert.rejects(stale.remove(), /record changed/)
  assert.equal(stale.data.has(stale.path("sales")), true)
  await harness({ role: "Administrator", member: "", enabled: false }).remove()
})

test("temporary cleanup presents a guarded confirmation and warns that deletion is not a refund", () => {
  const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
  const component = app.slice(app.indexOf("function RecordDeleteButton("), app.indexOf("function AdminRecordEditor("))
  const compiled = ts.transpileModule(component, { compilerOptions: options }).outputText
  const buttons = []
  const shell = ({ children }) => React.createElement("div", {}, children)
  let stateIndex = 0
  const ui = { React, useState: (value) => [stateIndex++ === 0 ? { record: original, shopId: "shop", collectionName: "appointments" } : value, () => {}],
    Button: (props) => { buttons.push(props); return React.createElement("button", {}, props.children) },
    Modal: shell, ErrorBox: shell, adminRecordDate: (value) => value, peso: (value) => String(value), moneyNumber: Number }
  const Component = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${compiled}; return RecordDeleteButton`)(ui)
  const html = renderToStaticMarkup(React.createElement(Component, { record: original, collectionName: "appointments", disabled: true }))
  assert.match(html, /cannot be undone|not a refund/)
  assert.match(html, /Keep record/)
  assert.equal(buttons.find((button) => button.children === "Delete permanently").disabled, true)
})

test("deletion rules stay scoped, paired, slot-safe and out of unrelated collections", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
  assert.match(rules, /temporaryManagerRecordDeletionEnabled\(\) \{ return true; \}/)
  assert.match(rules, /role\(\) == "Manager" && account\(\).get\("role", ""\) == "Manager"/)
  assert.match(rules, /ledgersDeleted\(id\) && bookingSlotsReleased\(id, resource.data\)/)
  assert.match(rules, /managerOwnsSlots\(resource.data.slots, removed, data.appointmentId\)/)
  const payroll = rules.slice(rules.indexOf("match /payroll/"), rules.indexOf("match /payrollPeriods/"))
  assert.match(payroll, /allow update, delete: if false;/)
})
