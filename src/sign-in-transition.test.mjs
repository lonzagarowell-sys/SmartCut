import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { billingDeadline, workspaceAccess } from "./subscription-access.mjs"

const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const compile = (start, end) => ts.transpileModule(app.slice(app.indexOf(start), app.indexOf(end)), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText
const icon = () => null
const shell = ({ children }) => React.createElement("div", {}, children)

test("staff sign-in uses one neutral loading screen until live access is confirmed", () => {
  const code = compile("function ShopContextGate(", "function LockedWorkspacePortal(")
  const render = (status) => {
    let index = 0
    const access = { id: "access", planId: "starter", status: "Active", manualLocked: false,
      expiresAt: { toDate: () => new Date("2099-12-12T15:59:59Z") } }
    const states = [{ id: "shop", name: "Shop" }, false, "shop", "", access,
      { records: [], status, error: status === "error" ? "Access denied" : undefined },
      Date.now(), 0]
    const ui = { React, useLocation: () => ({ pathname: "/overview" }), useNavigate: () => () => {},
      useState: () => [states[index++], () => {}], useEffect: () => {}, useRef: (value) => ({ current: value }),
      initialCollection: { records: [], status: "connecting" }, billingDeadline, workspaceAccess,
      isManager: (role) => ["Administrator", "Manager"].includes(role),
      LoaderCircle: icon, Button: shell,
      PageHead: ({ title }) => React.createElement("div", {}, title),
      ErrorBox: ({ message }) => React.createElement("div", {}, message),
      ConnectedWorkspace: () => React.createElement("div", {}, "Dashboard"),
    }
    const Component = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return ShopContextGate;`)(ui)
    return renderToStaticMarkup(React.createElement(Component, { account: { uid: "provider", role: "Service Provider", shopId: "shop" } }))
  }
  assert.match(render("connecting"), /Opening your workspace/)
  assert.doesNotMatch(render("connecting"), /Firebase|access could not be confirmed|Dashboard/)
  assert.match(render("connected"), /Dashboard/)
  assert.match(render("error"), /Access denied/)
})

test("old profile callbacks cannot replace a newly authenticated provider or flash account setup", () => {
  const memory = []
  let cursor = 0
  const effects = []
  const profiles = []
  let authCallback
  const ui = { React, useLocation: () => ({ pathname: "/overview" }),
    useState: (initial) => {
      const index = cursor++
      if (!(index in memory)) memory[index] = initial
      return [memory[index], (value) => { memory[index] = typeof value === "function" ? value(memory[index]) : value }]
    },
    useEffect: (effect) => { if (effects.length < 2) effects.push(effect) },
    connectFirebase: (callback) => { authCallback = callback; return () => {} },
    subscribeUserProfile: (uid, next, error) => { profiles.push({ uid, next, error }); return () => {} },
    LoaderCircle: icon, ShieldCheck: icon, Button: shell,
    PageHead: shell, ErrorBox: shell,
    AuthScreen: () => React.createElement("div", {}, "Sign in"),
    ShopContextGate: ({ account }) => React.createElement("div", {}, `Dashboard ${account.uid}`),
  }
  const Component = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${compile("function Workspace()", "function ShopAvatar(")}; return Workspace;`)(ui)
  const render = () => { cursor = 0; return renderToStaticMarkup(React.createElement(Component)) }
  render()
  effects[1]()
  authCallback({ uid: "old-session" })
  authCallback({ uid: "provider" })
  profiles[0].error("Stale Firebase permission error")
  profiles[0].next(null)
  assert.match(render(), /Opening your workspace/)
  assert.doesNotMatch(render(), /Account setup required/)
  profiles[1].next({ uid: "provider", role: "Service Provider", shopId: "shop" })
  profiles[0].next(null)
  assert.match(render(), /Dashboard provider/)
  assert.equal(memory[3], "")
})
