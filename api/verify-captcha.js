import { createCaptchaRoute } from "../server/captcha-route.mjs"

const route = createCaptchaRoute()

export default async function handler(request, response) {
  await route(request, response, () => {
    response.statusCode = 404
    response.setHeader("Content-Type", "application/json; charset=utf-8")
    response.setHeader("Cache-Control", "no-store")
    response.end(JSON.stringify({ success: false, reason: "NOT_FOUND" }))
  })
}
