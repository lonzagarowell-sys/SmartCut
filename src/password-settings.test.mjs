import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React }
const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(
  source.slice(source.indexOf("let changingOwnPassword ="), source.indexOf("export function signOutUser(")),
  { compilerOptions: options },
).outputText.replace(/export /g, "")
const oldPassword = "  test-current-only  "
const newPassword = "test-new-only-123"

function authHarness({ providers = ["password"], policy, reauthError, updateError, holdUpdate = false, changeSession = false } = {}) {
  const user = { uid: "self", email: "self@example.test", providerData: providers.map((providerId) => ({ providerId })) }
  const auth = { currentUser: user }
  const calls = []
  let release
  let updateStarted
  const started = new Promise((resolve) => { updateStarted = resolve })
  const ui = {
    auth,
    currentUser: () => {
      if (!auth.currentUser) throw new Error("Sign in before continuing.")
      return auth.currentUser
    },
    validatePassword: async (target, password) => {
      calls.push(["policy", target, password])
      return policy || { isValid: true }
    },
    EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
    reauthenticateWithCredential: async (target, credential) => {
      calls.push(["reauth", target, credential])
      if (reauthError) throw reauthError
      if (changeSession) auth.currentUser = { ...user, uid: "different-account" }
    },
    updatePassword: async (target, password) => {
      calls.push(["update", target, password])
      updateStarted()
      if (holdUpdate) await new Promise((resolve) => { release = resolve })
      if (updateError) throw updateError
    },
    sendPasswordResetEmail: async (target, email) => calls.push(["reset", target, email]),
  }
  const functions = new Function("ui", `
    const { ${Object.keys(ui).join(",")} } = ui;
    ${compiled}
    return { changeOwnPassword, requestOwnPasswordReset };
  `)(ui)
  return { ...functions, calls, auth, user, started, release: () => release() }
}

test("password change verifies the current credential before updating only the signed-in user", async () => {
  const mock = authHarness()
  await mock.changeOwnPassword(oldPassword, newPassword, newPassword)
  assert.deepEqual(mock.calls.map((call) => call[0]), ["policy", "reauth", "update"])
  assert.equal(mock.calls[1][1], mock.user)
  assert.deepEqual(mock.calls[1][2], { email: mock.user.email, password: oldPassword })
  assert.equal(mock.calls[2][1], mock.user)
  assert.equal(mock.calls[2][2], newPassword)
})

test("a wrong current password never calls updatePassword", async () => {
  const mock = authHarness({ reauthError: { code: "auth/invalid-credential" } })
  await assert.rejects(mock.changeOwnPassword(oldPassword, newPassword, newPassword), /current password is incorrect/)
  assert.ok(mock.calls.every((call) => call[0] !== "update"))
})

test("password policy, mismatched confirmation, and unchanged passwords fail safely", async () => {
  const mock = authHarness({
    policy: {
      isValid: false,
      passwordPolicy: { customStrengthOptions: { minPasswordLength: 12 } },
      meetsMinPasswordLength: false, containsUppercaseLetter: false,
    },
  })
  await assert.rejects(mock.changeOwnPassword(oldPassword, "short", "short"), /at least 12 characters.*uppercase/)
  assert.ok(mock.calls.every((call) => call[0] === "policy"))
  const valid = authHarness()
  await assert.rejects(valid.changeOwnPassword(oldPassword, newPassword, "different"), /do not match/)
  await assert.rejects(valid.changeOwnPassword(oldPassword, oldPassword, oldPassword), /different/)
  assert.equal(valid.calls.length, 0)
})

test("Google-only accounts are not given an invented current password; linked accounts still work", async () => {
  const google = authHarness({ providers: ["google.com"] })
  await assert.rejects(google.changeOwnPassword(oldPassword, newPassword, newPassword), /does not have a SmartCut/)
  await assert.rejects(google.requestOwnPasswordReset(), /sign-in provider/)
  assert.equal(google.calls.length, 0)
  const linked = authHarness({ providers: ["google.com", "password"] })
  await linked.changeOwnPassword(oldPassword, newPassword, newPassword)
  assert.equal(linked.calls.at(-1)[0], "update")
})

test("an account switch during verification prevents the update", async () => {
  const mock = authHarness({ changeSession: true })
  await assert.rejects(mock.changeOwnPassword(oldPassword, newPassword, newPassword), /session changed/)
  assert.ok(mock.calls.every((call) => call[0] !== "update"))
})

test("duplicate requests are blocked across form instances while an update is pending", async () => {
  const mock = authHarness({ holdUpdate: true })
  const first = mock.changeOwnPassword(oldPassword, newPassword, newPassword)
  await mock.started
  await assert.rejects(mock.changeOwnPassword(oldPassword, newPassword, newPassword), /already in progress/)
  mock.release()
  await first
  assert.equal(mock.calls.filter((call) => call[0] === "update").length, 1)
})

test("reset email uses the authenticated email and failed updates release the request lock", async () => {
  const mock = authHarness({ updateError: { code: "auth/network-request-failed" } })
  await assert.rejects(mock.changeOwnPassword(oldPassword, newPassword, newPassword))
  await assert.rejects(mock.changeOwnPassword(oldPassword, newPassword, newPassword))
  assert.equal(mock.calls.filter((call) => call[0] === "update").length, 2)
  await mock.requestOwnPasswordReset()
  assert.deepEqual(mock.calls.at(-1), ["reset", mock.auth, mock.user.email])
})

test("account security observes authentication token/provider changes and returns cleanup", () => {
  const code = ts.transpileModule(
    source.slice(source.indexOf("export function subscribeAccountSecurity("), source.indexOf("let changingOwnPassword =")),
    { compilerOptions: options },
  ).outputText.replace(/export /g, "")
  let notify
  let stopped = false
  const ui = {
    auth: {},
    friendlyError: () => "Auth failed",
    onIdTokenChanged: (_, callback) => { notify = callback; return () => { stopped = true } },
  }
  const subscribe = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return subscribeAccountSecurity;`)(ui)
  const states = []
  const stop = subscribe((value) => states.push(value), () => {})
  notify({ uid: "self", email: "self@example.test", providerData: [{ providerId: "password" }, { providerId: "google.com" }] })
  assert.equal(states[0].passwordEnabled, true)
  assert.equal(states[0].googleEnabled, true)
  notify(null)
  assert.equal(states.at(-1), null)
  stop()
  assert.equal(stopped, true)
})

const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const uiCode = ts.transpileModule(
  app.slice(app.indexOf("function AccountSecuritySettings("), app.indexOf("function Settings(")),
  { compilerOptions: options },
).outputText
function settingsUI(security, filled = false, change = async () => {}) {
  let nulls = 0
  let strings = 0
  let form
  const setters = []
  const values = filled ? [oldPassword, newPassword, newPassword] : []
  const ui = {
    React,
    useState: (initial) => {
      const value = initial === null ? (nulls++ === 0 ? security : null) :
        initial === true ? false : initial === "" ? values[strings++] || "" : initial
      return [value, (next) => setters.push(next)]
    },
    useRef: () => ({ current: false }), useEffect: () => {},
    PageHead: ({ title, description }) => React.createElement("div", {}, title, description),
    Field: ({ label, children }) => React.createElement("label", {}, label, children),
    Button: ({ children }) => React.createElement("button", {}, children),
    ErrorBox: ({ message }) => React.createElement("div", {}, message),
    Eye: () => null, EyeOff: () => null, ShieldCheck: () => null, CheckCircle2: () => null, LoaderCircle: () => null,
    inputClass: "", changeOwnPassword: change, requestOwnPasswordReset: async () => {},
    friendlyError: (error) => error.message,
  }
  const Component = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${uiCode}; return AccountSecuritySettings;`)(ui)
  const element = Component({ account: { uid: "self", role: "Customer" }, busy: false })
  const findForm = (node) => {
    if (!node || typeof node !== "object") return
    if (node.type === "form") form = node
    React.Children.forEach(node.props?.children, findForm)
  }
  findForm(element)
  return { element, form, setters }
}

test("password settings render current/new/confirm inputs and clear secrets only after confirmed success", async () => {
  let calls = 0
  const mock = settingsUI({ uid: "self", email: "self@example.test", passwordEnabled: true }, true, async (...args) => {
    calls++
    assert.deepEqual(args, [oldPassword, newPassword, newPassword])
  })
  const html = renderToStaticMarkup(mock.element)
  assert.match(html, /Current password/)
  assert.match(html, /Confirm new password/)
  assert.match(html, /autoComplete="current-password"/i)
  assert.match(html, /autoComplete="new-password"/i)
  await mock.form.props.onSubmit({ preventDefault() {} })
  assert.equal(calls, 1)
  assert.ok(mock.setters.some((value) => typeof value === "string" && value.startsWith("Password updated successfully")))
  assert.ok(mock.setters.filter((value) => value === "").length >= 5)
})

test("Google-only settings show provider guidance instead of password fields", () => {
  const mock = settingsUI({ uid: "self", email: "self@example.test", passwordEnabled: false, googleEnabled: true })
  const html = renderToStaticMarkup(mock.element)
  assert.match(html, /You sign in with Google/)
  assert.match(html, /Open Google account security/)
  assert.doesNotMatch(html, /name="currentPassword"|name="newPassword"/)
})

test("security is available to all roles and password changes never write to Firestore", () => {
  const settings = app.slice(app.indexOf("function Settings("), app.indexOf("function VisitTypeBadge("))
  assert.match(settings, /"Security"/)
  assert.match(settings, /<AccountSecuritySettings key=\{account.uid\}/)
  assert.doesNotMatch(compiled, /transaction|setDoc|writeBatch|updateDoc|localStorage|console\./)
})
