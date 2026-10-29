import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React }
const compiled = ts.transpileModule(readFileSync(new URL("./admin-records.ts", import.meta.url), "utf8"), { compilerOptions: options }).outputText
const exported = {}
new Function("exports", compiled)(exported)
const { adminRecordTime, adminBookingSlots, normalizeAdminEdit, recordEditFields } = exported
const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const operation = ts.transpileModule(source.slice(source.indexOf("export async function editAdminShopRecord("), source.indexOf("export async function deleteShopRecord(")), {
  compilerOptions: { ...options, module: ts.ModuleKind.ESNext },
}).outputText.replace("export ", "")
const uiSource = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const booking = {
  id: "visit", client: "Maria", service: "Cut", provider: "Ana", providerId: "provider",
  date: "2026-10-20", time: "10:00", durationMinutes: 60, amount: 150, status: "Accepted",
  paymentStatus: "Unpaid", notes: "", scheduleId: "provider_2026-10-20",
  slotKeys: ["600", "615", "630", "645"],
}

test("walk-ins without a stored time display the original Philippine recording time", () => {
  const walkin = { ...booking, type: "Walk-in" }
  delete walkin.time
  walkin.createdAt = { seconds: Date.parse("2026-10-20T14:14:00Z") / 1000 }
  assert.ok(recordEditFields(walkin).every(([key]) => !["date", "time", "durationMinutes"].includes(key)))
  assert.equal(adminRecordTime(walkin), "22:14")
  assert.equal(adminRecordTime({ ...walkin, time: "10:14" }), "10:14")
  assert.equal(adminRecordTime({ id: "missing" }), "")
})

test("Administrator corrections can preserve and edit more than five walk-in services", () => {
  const record = { ...booking, type: "Walk-in", status: "Paid", serviceNames: ["Cut"] }
  const lines = Array.from({ length: 10 }, (_, index) => ({ id: `service-${index}`, name: `Service ${index}`, amount: "10.01" }))
  const changes = normalizeAdminEdit(record, { ...record, lines })
  assert.equal(changes.serviceIds.length, 10)
  assert.equal(changes.amountCents, 10010)
})

test("Admin corrections preserve exact recorded times and reject manual time changes", () => {
  assert.equal(normalizeAdminEdit(booking, { ...booking }).time, booking.time)
  assert.throws(() => normalizeAdminEdit(booking, { ...booking, durationMinutes: 20 }), /read-only/)
  for (const time of ["10:14", "24:00", "10:60", "10:14:30", "invalid", ""])
    assert.throws(() => normalizeAdminEdit(booking, { ...booking, time }), /read-only/)
  const legacy = { ...booking, type: "Walk-in", status: "Paid", createdAt: { seconds: 1792500000 } }
  delete legacy.time
  assert.equal("time" in normalizeAdminEdit(legacy, { ...legacy }), false)
})

test("off-grid services reserve every touched block without changing ordinary booking slots", () => {
  assert.deepEqual(adminBookingSlots("10:14", 60), ["600", "615", "630", "645", "660"])
  assert.deepEqual(adminBookingSlots("10:00", 60), ["600", "615", "630", "645"])
  assert.equal(adminBookingSlots("10:14", 240).length, 17)
  assert.deepEqual(adminBookingSlots("23:59", 1), ["1425"])
  assert.throws(() => adminBookingSlots("23:59", 2), /midnight/)
})

function harness(record = booking, role = "Administrator", extras = {}, collectionName = "appointments") {
  const path = (name, id = record.id) => `shops/shop/${name}/${id}`
  const data = new Map([
    ["users/admin", { role }],
    ["shops/shop", { ownerId: "owner" }],
    ["shops/shop/members/admin", { role }],
    [path(collectionName), { ...record }],
    [path("appointmentSchedules", record.scheduleId), { slots: Object.fromEntries(record.slotKeys.map((key) => [key, record.id])) }],
    ...Object.entries(extras),
  ])
  const reference = (path) => ({ path, id: path.split("/").at(-1) })
  const ui = {
    ...exported, db: {}, businessId: () => "shop", currentUser: () => ({ uid: "admin" }),
    doc: (_, ...parts) => reference(parts.join("/")),
    shopDoc: (shop, name, id) => reference(`shops/${shop}/${name}/${id}`),
    serverTimestamp: () => "SERVER_TIMESTAMP",
    Timestamp: { fromDate: (date) => date },
    runTransaction: async (_, run) => {
      const pending = []
      await run({
        get: async (ref) => ({ id: ref.id, ref, exists: () => data.has(ref.path), data: () => structuredClone(data.get(ref.path)) }),
        update: (ref, value) => pending.push([ref.path, { ...data.get(ref.path), ...value }]),
        set: (ref, value) => pending.push([ref.path, value]),
      })
      for (const [key, value] of pending) data.set(key, value)
    },
  }
  const edit = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${operation}; return editAdminShopRecord;`)(ui)
  return { edit: (input) => edit("shop", collectionName, record, { ...record, ...input }), data, path }
}

test("provider edits atomically move reservations without changing the recorded date or time", async () => {
  const paid = { ...booking, paymentStatus: "Paid", status: "Completed" }
  const ui = harness(paid, "Administrator", {
    "shops/shop/sales/visit": { amount: 150, time: booking.time, createdAt: "ORIGINAL" },
    "shops/shop/payments/visit": { amount: 150, time: booking.time, createdAt: "ORIGINAL" },
  })
  await ui.edit({ providerId: "other-provider", provider: "Ben" })
  const saved = ui.data.get(ui.path("appointments"))
  assert.equal(saved.time, booking.time)
  assert.equal(saved.date, booking.date)
  assert.deepEqual(ui.data.get(ui.path("appointmentSchedules", "provider_2026-10-20")).slots, {})
  assert.equal(ui.data.get(ui.path("appointmentSchedules", "other-provider_2026-10-20")).slots["645"], "visit")
  for (const name of ["sales", "payments"]) {
    assert.equal(ui.data.get(ui.path(name)).time, booking.time)
    assert.equal(ui.data.get(ui.path(name)).createdAt, "ORIGINAL")
  }
})

test("an occupied partial block rejects the entire correction", async () => {
  const ui = harness(booking, "Administrator", {
    "shops/shop/appointmentSchedules/other-provider_2026-10-20": { slots: { "645": "another-booking" } },
  })
  await assert.rejects(ui.edit({ providerId: "other-provider" }), /already has a booking/)
  assert.equal(ui.data.get(ui.path("appointments")).time, "10:00")
  assert.equal(ui.data.get(ui.path("appointmentSchedules", "provider_2026-10-20")).slots["600"], "visit")
})

test("non-owner Managers, providers, and customers cannot edit records", async () => {
  for (const role of ["Manager", "Service Provider", "Customer"]) {
    const ui = harness(booking, role)
    await assert.rejects(ui.edit({ client: "New name" }), /Only an Administrator/)
    assert.equal(ui.data.get(ui.path("appointments")).time, "10:00")
  }
})

test("the actual shop owner can edit remaining fields but not date, time, or duration", async () => {
  const ui = harness(booking, "Manager", { "shops/shop": { ownerId: "admin" } })
  await ui.edit({ client: "Updated customer" })
  assert.equal(ui.data.get(ui.path("appointments")).client, "Updated customer")
  for (const input of [{ date: "2026-10-12" }, { time: "10:14" }, { durationMinutes: 20 }]) {
    const fresh = harness(booking, "Manager", { "shops/shop": { ownerId: "admin" } })
    await assert.rejects(fresh.edit(input), /read-only/)
    assert.equal(fresh.data.get(fresh.path("appointments")).date, booking.date)
  }
})

test("global Administrators also cannot edit date, time, start timestamp, or duration", async () => {
  for (const input of [{ date: "2026-10-12" }, { time: "10:14" }, { durationMinutes: 20 },
    { startsAt: "changed" }, { startMinute: 615 }]) {
    const ui = harness()
    await assert.rejects(ui.edit(input), /read-only/)
    assert.equal(ui.data.get(ui.path("appointments")).date, booking.date)
  }
})

test("ownership without Manager membership does not grant correction access", async () => {
  for (const role of ["Customer", "Service Provider", "Manager"]) {
    const ui = harness(booking, role, {
      "shops/shop": { ownerId: "admin" },
      "shops/shop/members/admin": { role: "Customer" },
    })
    await assert.rejects(ui.edit({ client: "Changed name" }), /shop's owner/)
  }
})

test("stale scheduling snapshots are rejected before any reservation writes", async () => {
  for (const [key, value] of [["date", "2026-10-21"], ["time", "11:00"], ["durationMinutes", 45]]) {
    const ui = harness()
    ui.data.get(ui.path("appointments"))[key] = value
    await assert.rejects(ui.edit({ notes: "New note" }), /record changed/)
    assert.equal(ui.data.get(ui.path("appointmentSchedules", booking.scheduleId)).slots["600"], booking.id)
  }
})

test("Admin time inputs are removed and shared views contain no audit stamps", () => {
  const editor = uiSource.slice(uiSource.indexOf("function AdminRecordEditor("), uiSource.indexOf("function AppointmentStars("))
  assert.doesNotMatch(editor, /<TimePicker/)
  assert.doesNotMatch(editor, /AdminDatePicker|TimePicker|type="date"|type="time"/)
  assert.doesNotMatch(editor, /key === "time" \? 60/)
  assert.equal((uiSource.match(/<AdminEditStamp /g) || []).length, 1)
  assert.match(editor, /<AdminEditStamp record=\{record\}/)
  const scope = uiSource.slice(uiSource.indexOf("function BookingLine("), uiSource.indexOf("function RevenuePanel("))
  assert.doesNotMatch(scope, /AdminEditStamp/)
})

test("the actual editor has no scheduling inputs for either bookings or walk-ins", () => {
  const editor = ts.transpileModule(uiSource.slice(uiSource.indexOf("function AdminRecordEditor("), uiSource.indexOf("function AppointmentStars(")), { compilerOptions: options }).outputText
  const shell = ({ children }) => React.createElement("div", {}, children)
  const ui = {
    ...exported, React, useState: React.useState, Modal: shell, Field: shell, Button: shell,
    FinanceInput: (props) => React.createElement("input", props), AdminDatePicker: () => null,
    ShieldCheck: () => null, Plus: () => null, Check: () => null, AdminEditStamp: () => null,
    peso: (value) => String(value),
  }
  const Editor = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${editor}; return AdminRecordEditor;`)(ui)
  const walkin = { ...booking, type: "Walk-in", time: undefined, createdAt: { seconds: Date.parse("2026-10-20T14:14:00Z") / 1000 } }
  for (const record of [booking, walkin]) {
    const html = renderToStaticMarkup(React.createElement(Editor, {
      target: { shopId: "shop", collectionName: record.type === "Walk-in" ? "walkins" : "appointments", record }, run: async () => {}, close: () => {},
    }))
    assert.doesNotMatch(html, /type="time"|type="date"|type="month"|Duration in minutes|Record date/)
    assert.match(html, /original date, time, and duration stay unchanged/)
    for (const title of ["Customer details", "Service &amp; provider", "Payment &amp; status", "Additional details"])
      assert.ok(html.includes(title))
  }
})

test("Administrator time changes are rejected before reservation or receipt writes", async () => {
  const ui = harness()
  await assert.rejects(ui.edit({ time: "10:14" }), /read-only/)
  assert.equal(ui.data.get(ui.path("appointments")).time, booking.time)
  assert.equal(ui.data.get(ui.path("appointmentSchedules", booking.scheduleId)).slots["600"], booking.id)
})

test("walk-in payment edits reject new Card selections without rewriting historical Card records", () => {
  const walkin = { ...booking, type: "Walk-in", status: "Paid", method: "Cash" }
  assert.throws(() => normalizeAdminEdit(walkin, { ...walkin, method: "Card" }), /Cash or E-wallet/)
  assert.equal(normalizeAdminEdit(walkin, { ...walkin, method: "E-wallet" }).method, "E-wallet")
  const historical = { ...walkin, method: "Card" }
  assert.equal(normalizeAdminEdit(historical, { ...historical }).method, "Card")
})

test("Administrator assignment of historical unassigned walk-ins resolves a real provider and synchronizes both ledgers", async () => {
  const record = { ...booking, type: "Walk-in", status: "Paid", paymentStatus: "Paid",
    providerId: "", provider: "Any available", method: "Cash", serviceNames: ["Cut"] }
  const extras = {
    "shops/shop/team/new-provider": { name: "Ben", role: "Service Provider", active: true },
    "shops/shop/sales/visit": { type: "Walk-in", providerId: "", provider: "Any available", amount: 150 },
    "shops/shop/payments/visit": { type: "Walk-in", providerId: "", provider: "Any available", amount: 150 },
  }
  const ui = harness(record, "Administrator", extras, "walkins")
  await ui.edit({ providerId: "new-provider", lines: [{ id: "cut", name: "Cut", amount: "150" }] })
  for (const name of ["walkins", "sales", "payments"]) {
    assert.equal(ui.data.get(ui.path(name)).providerId, "new-provider")
    assert.equal(ui.data.get(ui.path(name)).provider, "Ben")
  }
  const inactive = harness(record, "Administrator", {
    ...extras, "shops/shop/team/new-provider": { name: "Ben", role: "Service Provider", active: false },
  }, "walkins")
  await assert.rejects(inactive.edit({ providerId: "new-provider", lines: [{ id: "cut", name: "Cut", amount: "150" }] }), /specific active/)
  assert.equal(inactive.data.get(inactive.path("walkins")).providerId, "")
})
