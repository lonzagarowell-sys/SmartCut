import { test } from "node:test"
import assert from "node:assert/strict"
import { validateCaptchaProperties, productionKey, developmentKey } from "./captcha.js"

const now = Date.now()
const valid = {
  valid: true,
  hostname: "smartcutph.com",
  createTime: new Date(now - 1000).toISOString(),
}

test("valid checkbox token needs no action", () => {
  assert.equal(validateCaptchaProperties(valid, "smartcutph.com", now), null)
  assert.notEqual(productionKey, developmentKey)
})

test("Google invalid reasons are preserved", () => {
  for (const invalidReason of ["DOMAIN_MISMATCH", "KEY_MISMATCH", "EXPIRED", "DUPE", "MISSING", "BROWSER_ERROR"]) {
    assert.equal(validateCaptchaProperties({ valid: false, invalidReason }, "smartcutph.com", now), invalidReason)
  }
})

test("hostname and token creation time are enforced", () => {
  assert.equal(validateCaptchaProperties(valid, "preview.example.com", now), "DOMAIN_MISMATCH")
  assert.equal(validateCaptchaProperties({ ...valid, createTime: undefined }, "smartcutph.com", now), "MISSING_CREATE_TIME")
  assert.equal(validateCaptchaProperties({ ...valid, createTime: new Date(now - 121000).toISOString() }, "smartcutph.com", now), "EXPIRED")
  assert.equal(validateCaptchaProperties({ ...valid, createTime: new Date(now + 6000).toISOString() }, "smartcutph.com", now), "EXPIRED")
})
