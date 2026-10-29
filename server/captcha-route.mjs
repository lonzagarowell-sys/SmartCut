export const captchaFunctionUrl =
  "https://asia-southeast1-smartcutpre.cloudfunctions.net/verifyCaptcha/api/verify-captcha"

// Registered before Vite's SPA middleware. Never forwards HTML or redirects.
export function createCaptchaRoute(fetchImpl = fetch, endpoint = captchaFunctionUrl) {
  return async (request, response, next) => {
    if (request.url?.split("?")[0] !== "/api/verify-captcha") return next()
    const send = (status, body) => {
      response.statusCode = status
      response.setHeader("Content-Type", "application/json; charset=utf-8")
      response.setHeader("Cache-Control", "no-store")
      response.end(JSON.stringify(body))
    }
    if (request.method !== "POST") {
      return send(405, { success: false, reason: "METHOD_NOT_ALLOWED: use POST" })
    }
    try {
      let body = ""
      for await (const chunk of request) {
        body += chunk
        if (Buffer.byteLength(body) > 16384) {
          return send(400, { success: false, reason: "INVALID_REQUEST: body too large" })
        }
      }
      let data
      try { data = JSON.parse(body) } catch {
        return send(400, { success: false, reason: "INVALID_REQUEST: expected JSON" })
      }
      console.info("[CAPTCHA route]", {
        method: request.method, path: "/api/verify-captcha",
        tokenExists: typeof data?.token === "string" && !!data.token,
      })
      if (typeof data?.token !== "string" || !data.token.trim()) {
        return send(400, { success: false, reason: "MISSING: complete the CAPTCHA" })
      }
      const upstream = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: request.headers.origin || "",
        },
        body: JSON.stringify({ token: data.token, siteKey: data.siteKey }),
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      })
      let result
      try {
        result = await upstream.json()
      } catch {
        throw new Error(`Verification upstream returned HTTP ${upstream.status} with non-JSON content`)
      }
      if (!result || typeof result.success !== "boolean" ||
          (!upstream.ok && result.success)) throw new Error("Invalid verification response")
      return send(result.success ? 200 : upstream.status >= 500 ? 500 : 400,
        result.success ? { success: true } : {
          success: false, reason: result.reason || "CAPTCHA verification failed",
        })
    } catch (error) {
      console.error("[CAPTCHA route] Upstream request failed", { error: error.message })
      return send(500, { success: false, reason: "CAPTCHA verification service error" })
    }
  }
}
