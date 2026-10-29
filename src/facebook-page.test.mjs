import test from "node:test"
import assert from "node:assert/strict"
import { normalizeFacebookPageUrl } from "./facebook-page.mjs"

test("accepts optional blank and HTTPS Facebook page URLs", () => {
  assert.equal(normalizeFacebookPageUrl("  "), "")
  assert.equal(normalizeFacebookPageUrl(" https://www.facebook.com/SmartCut "), "https://www.facebook.com/SmartCut")
  assert.equal(normalizeFacebookPageUrl("https://facebook.com/profile.php?id=123"), "https://facebook.com/profile.php?id=123")
  assert.equal(normalizeFacebookPageUrl("https://fb.me/example"), "https://fb.me/example")
})
test("rejects unsafe, malformed, unrelated, or overlong URLs", () => {
  for (const value of [
    "javascript:alert(1)", "http://facebook.com/page", "not a URL",
    "https://facebook.com.attacker.test/page", "https://user:pass@facebook.com/page",
    "https://facebook.com:444/page", "https://example.com/page",
    "https://facebook.com/" + "x".repeat(2000),
  ]) assert.equal(normalizeFacebookPageUrl(value), null)
})
