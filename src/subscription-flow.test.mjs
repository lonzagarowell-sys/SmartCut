import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const firebase = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const connected = { records: [], status: "connected" }
function render(status = "connected", search = "", role = "Manager", props = {}) {
  const buttons = []
  const shell = ({ children }) => React.createElement("div", {}, children)
  const ui = {
    React, useState: (value) => [typeof value === "function" ? value() : value, () => {}],
    useEffect: () => {}, useLocation: () => ({ search }), useNavigate: () => () => {},
    subscriptionPlans: [{ id: "business", name: "Business", amount: 599, trialDays: 0, description: "Business plan" }],
    subscriptionPeriodEnd: (record) => record?.currentPeriodEnd?.toDate?.(), initialCollection: connected, inputClass: "",
    PageHead: ({ title, description }) => React.createElement("div", {}, title, description),
    Button: (props) => { buttons.push(props); return React.createElement("button", { type: props.type || "button" }, props.children) },
    ErrorBox: ({ message }) => React.createElement("div", {}, message),
    Field: shell, DataBoundary: shell, Badge: shell, Empty: () => null,
    Crown: () => null, ArrowLeft: () => null, CheckCircle2: () => null,
    ShieldCheck: () => null, CreditCard: () => null, Clock3: () => null, Check: () => null,
    AdminSubscriptionControls: () => React.createElement("div", {}, "Administrator subscription controls"),
    isServiceImageUrl: () => false,
    peso: (value) => `PHP ${value}`, numeric: Number, cx: (...values) => values.filter(Boolean).join(" "),
    gcashPaymentImage: "payment.png", gcashPaymentQr: "qr.png",
  }
  const compiled = ts.transpileModule(
    app.slice(app.indexOf("function Subscription("), app.indexOf("function ShopSmsSettings("))
      .replace(/import\.meta\.env\.VITE_SMARTCUT_GCASH_(NUMBER|NAME)/g, '""'),
    { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const Component = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${compiled}; return Subscription;`)(ui)
  const html = renderToStaticMarkup(React.createElement(Component, {
    account: { role }, business: { gcashNumber: "SHOP-WALLET", gcashName: "SHOP-OWNER" },
    state: { records: [], status, error: status === "error" ? "Permission denied" : undefined },
    requests: connected, payments: connected, businessStatus: connected, reconnect: () => {},
    ...props,
  }))
  return { html, buttons }
}
test("billing reconnect never treats incomplete data as trial eligibility or a payable plan", () => {
  for (const status of ["connecting", "error"]) {
    const result = render(status, "?plan=business")
    assert.match(result.html, /Reconnect subscription data/)
    assert.doesNotMatch(result.html, /Submit for verification|Start 7-day free trial/)
  }
})
test("GCash verification is a submit action and uses SmartCut QR, not a shop wallet", () => {
  const result = render("connected", "?plan=business")
  assert.match(result.html, /Scan the SmartCut payment QR/)
  assert.doesNotMatch(result.html, /SHOP-WALLET|SHOP-OWNER|Not configured/)
  assert.equal(result.buttons.find((button) => button.children === "Submit for verification").type, "submit")
  assert.match(result.html, /Step 1 · Send your payment/)
  assert.match(result.html, /Step 2 · Upload proof/)
})

test("subscription overview presents plan first and keeps manager actions unchanged", () => {
  const result = render("connected", "", "Manager", {
    state: { status: "connected", records: [{ id: "subscription", planId: "business", plan: "Business", amount: 599, status: "Active", currentPeriodEnd: { toDate: () => new Date("2099-12-18T15:59:59Z") } }] },
  })
  assert.ok(result.html.indexOf("Current plan") < result.html.indexOf("Choose or renew your plan"))
  assert.match(result.html, /Choose a plan|Pay with GCash|Wait for approval/)
  assert.match(result.html, /Philippine time/)
  assert.ok(result.buttons.some((button) => button.children === "Renew this plan"))
  assert.doesNotMatch(result.html, /Administrator subscription controls|Approve payment|Reject proof/)
})

test("pending and approved payments stay visible in separate bounded panels", () => {
  const result = render("connected", "", "Administrator", {
    requests: { status: "connected", records: [{ id: "TEST123", status: "Pending", plan: "Business", amount: 599, submittedByName: "Manager", transactionReference: "TEST123" }] },
    payments: { status: "connected", records: [{ id: "PAID123", plan: "Starter", amount: 99, reference: "PAID123" }] },
  })
  assert.match(result.html, /Awaiting approval|1 pending/)
  assert.match(result.html, /Approved payment history|PAID123/)
  assert.match(result.html, /max-h-80/)
  assert.ok(result.html.indexOf("Approved payment history") < result.html.indexOf("Administrator subscription controls"))
  for (const label of ["Approve payment", "Reject proof"]) assert.ok(result.buttons.some((button) => button.children === label))
})
test("workspace uses exact subscription document and locked portal recreates listeners on retry", () => {
  const workspace = app.slice(app.indexOf("function useWorkspaceData("), app.indexOf("function ShopLogo("))
  assert.match(workspace, /name === "subscription"[\s\S]*subscribeSubscriptionState\(callback, status\)/)
  assert.doesNotMatch(workspace, /"payroll",\s*"settings"/)
  assert.match(app, /\[shop.id, account.uid, account.role, retry\]/)
})
test("subscription listener emits live adjustments and clears stale state on failure", () => {
  const code = ts.transpileModule(firebase.slice(firebase.indexOf("export function subscribeSubscriptionState("), firebase.indexOf("export async function reflectExistingSubscriptionAccess(")), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/export /g, "")
  let listener
  const events = []
  const ui = { businessId: () => "shop", shopDoc: (...args) => args.join("/"),
    snapshotSyncState: (meta) => meta.fromCache ? "connecting" : "connected",
    friendlyError: (error) => error.message,
    onSnapshot: (path, options, next, error) => { listener = { path, options, next, error }; return () => {} } }
  const subscribe = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return subscribeSubscriptionState;`)(ui)
  subscribe((rows) => events.push(rows), (status) => events.push(status))
  assert.equal(listener.path, "shop/settings/subscription")
  for (const planId of ["starter", "business"])
    listener.next({ exists: () => true, data: () => ({ planId }), id: "subscription", metadata: { fromCache: false } })
  assert.equal(events.at(-2)[0].planId, "business")
  listener.error(new Error("Permission denied"))
  assert.deepEqual(events.at(-2), [])
  assert.equal(events.at(-1), "error")
})
