import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { formatDateManila, formatTimestampManila, timestampMillis } from "./time-format.mjs"

const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const code = ts.transpileModule(source.slice(
  source.indexOf("export async function submitFeedback("),
  source.indexOf("export async function reviewFeedback("),
), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace("export async function", "async function")

function harness(role = "Customer", member = true) {
  const records = {
    "users/sender": { role, name: "Test Sender" },
    "shops/shop": { name: "Test Shop" },
    ...(member ? { "shops/shop/members/sender": { role } } : {}),
  }
  const writes = []
  const ui = {
    db: {}, currentUser: () => ({ uid: "sender" }),
    collection: (_, name) => name,
    doc: (...args) => typeof args[0] === "string" ? `${args[0]}/report` : args.slice(1).join("/"),
    shopDoc: (shop, name, uid) => `shops/${shop}/${name}/${uid}`,
    serverTimestamp: () => "server-time",
    runTransaction: async (_, callback) => callback({
      get: async (path) => ({ exists: () => !!records[path], data: () => records[path] }),
      set: (path, data) => writes.push({ path, data }),
    }),
  }
  const submit = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return submitFeedback;`)(ui)
  return { submit, writes }
}
const report = { subject: "Booking error", message: "The appointment screen will not load.", category: "Bug" }

test("each non-admin role can submit private general and shop reports", async () => {
  for (const role of ["Customer", "Manager", "Service Provider"]) {
    const { submit, writes } = harness(role)
    await submit(report)
    await submit({ ...report, shopId: "shop" })
    assert.equal(writes[0].path, "feedback/report")
    assert.deepEqual(writes[0].data, {
      ...report, shopId: "", shopName: "", senderId: "sender",
      senderName: "Test Sender", senderRole: role, status: "New", createdAt: "server-time",
    })
    assert.equal(writes[1].data.shopName, "Test Shop")
  }
})

test("feedback rejects invalid input, administrator submission and unrelated shops", async () => {
  await assert.rejects(harness("Administrator").submit(report), /available to/)
  const mock = harness("Customer", false)
  await assert.rejects(mock.submit({ ...report, shopId: "shop" }), /connected to/)
  await assert.rejects(mock.submit({ ...report, shopId: "bad/path" }), /valid shop/)
  await assert.rejects(mock.submit({ ...report, message: "short" }), /2,000/)
  await assert.rejects(mock.submit({ ...report, category: "Invalid" }), /category/)
  assert.equal(mock.writes.length, 0)
})

test("appointment and notification dates consistently use Philippine time", () => {
  assert.match(formatDateManila("2026-10-14"), /Oct 14, 2026/)
  const milliseconds = Date.parse("2026-10-14T17:30:00Z")
  assert.equal(timestampMillis({ toMillis: () => milliseconds }), milliseconds)
  assert.equal(timestampMillis({ seconds: milliseconds / 1000 }), milliseconds)
  assert.match(formatTimestampManila(new Date(milliseconds)), /Oct 15, 2026.*1:30 AM/)
  assert.equal(formatTimestampManila(null), "Time not recorded")
})

test("complete downloadable rules stay identical to the canonical rules", () => {
  assert.equal(readFileSync(new URL("../public/smartcut-firestore.rules.txt", import.meta.url), "utf8"),
    readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"))
})

test("notification panel renders timestamps, unread actions and private admin report alerts", () => {
  const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
  const panelCode = ts.transpileModule(app.slice(
    app.indexOf("function NotificationPanel("), app.indexOf("function Overview("),
  ), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  const shell = ({ children }) => React.createElement("div", {}, children)
  const icon = () => null
  const ui = {
    React, Button: ({ children, onClick, disabled, ...props }) =>
      React.createElement("button", { onClick, disabled, "aria-label": props["aria-label"] }, children),
    DataBoundary: shell, Empty: shell, Bell: icon, X: icon, MessageSquare: icon, Clock3: icon,
    cx: (...values) => values.filter(Boolean).join(" "),
    timestampMillis, formatTimestampManila, formatNotificationTime: (message) => message,
  }
  const Panel = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${panelCode}; return NotificationPanel;`)(ui)
  const props = {
    state: { status: "connected", records: [] }, unread: 1, busy: false,
    close() {}, markAll() {}, select() {}, openFeedback() {},
    records: [{ id: "notice", title: "Payment recorded", message: "PHP 150 paid via Cash.",
      createdAt: new Date("2026-10-14T17:30:00Z"), read: false }],
  }
  const provider = renderToStaticMarkup(React.createElement(Panel, { ...props, role: "Service Provider", feedbackCount: 0 }))
  assert.match(provider, /Oct 15, 2026.*1:30 AM/)
  assert.match(provider, /Mark all read|Unread/)
  assert.match(provider, /Paid\./)
  assert.doesNotMatch(provider, /PHP 150|feedback inbox/)
  const admin = renderToStaticMarkup(React.createElement(Panel, { ...props, role: "Administrator", feedbackCount: 2 }))
  assert.match(admin, /2 feedback reports need review|Open feedback inbox/)
})
