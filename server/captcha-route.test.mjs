import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { createCaptchaRoute } from "./captcha-route.mjs"

async function requestRoute(upstream, payload, method = "POST") {
  const route = createCaptchaRoute(upstream)
  const server = createServer((req, res) => route(req, res, () => {
    res.setHeader("Content-Type", "text/html")
    res.end("<html>SPA fallback</html>")
  }))
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/verify-captcha`, {
      method, headers: { "Content-Type": "application/json", Origin: "https://smartcutph.com" },
      ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
    })
    assert.match(response.headers.get("content-type"), /^application\/json/)
    return { status: response.status, body: await response.json() }
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test("POST success returns JSON, forwarding token and site key", async () => {
  const result = await requestRoute(async (url, options) => {
    assert.deepEqual(JSON.parse(options.body), { token: "test-token", siteKey: "test-key" })
    assert.equal(options.headers.Origin, "https://smartcutph.com")
    return Response.json({ success: true })
  }, { token: "test-token", siteKey: "test-key" })
  assert.deepEqual(result, { status: 200, body: { success: true } })
})

test("missing and rejected tokens return HTTP 400 JSON", async () => {
  const missing = await requestRoute(() => { throw new Error("must not fetch") }, {})
  assert.equal(missing.status, 400)
  const invalid = await requestRoute(async () => Response.json({
    success: false, reason: "EXPIRED",
  }, { status: 400 }), { token: "test-token" })
  assert.deepEqual(invalid, { status: 400, body: { success: false, reason: "EXPIRED" } })
})

test("HTTP 200 HTML and network failures become HTTP 500 JSON, never SPA HTML", async () => {
  for (const upstream of [
    async () => new Response("<html>SmartCut</html>", { status: 200 }),
    async () => { throw new Error("network failure") },
  ]) {
    const result = await requestRoute(upstream, { token: "test-token" })
    assert.deepEqual(result, {
      status: 500, body: { success: false, reason: "CAPTCHA verification service error" },
    })
  }
})

test("non-POST endpoint requests cannot fall through to SPA", async () => {
  const result = await requestRoute(() => {}, undefined, "GET")
  assert.equal(result.status, 405)
})
