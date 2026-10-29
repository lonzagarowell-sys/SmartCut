import test from "node:test"
import assert from "node:assert/strict"
import { requiresCaptcha } from "./captcha-policy.mjs"

test("Figma live and cached previews do not require CAPTCHA", () => {
  assert.equal(requiresCaptcha("app-l6mla4yvsmedjxscuje2qulgjila6y4hawgl4hu4nna6njg5zldz.makeproxy-c.figma.site"), false)
  assert.equal(requiresCaptcha("app-cjcdazkakracpek3czx654gzqi3e7rnunmglnoffmz76uw2isggh.makeproxy-c.figma.site"), false)
  assert.equal(requiresCaptcha("a6123599-7627-44c1-967b-d04e9af3b201-figmacachedpreview.figma.site"), false)
  assert.equal(requiresCaptcha("ta-01m4jzn7aptpqv0ch7jpxgkhys-1380-gvdpufi3jcodskrjd37mwo9fv.makeproxy-m.figma.site"), false)
  assert.equal(requiresCaptcha("TA-01M4JZN7APTPQV0CH7JPXGKHYS-1380-GVDPUFI3JCODSKRJD37MWO9FV.MAKEPROXY-M.FIGMA.SITE"), false)
})

test("production and unknown hosts still require CAPTCHA", () => {
  for (const host of [
    "smartcutph.com", "www.smartcutph.com", "SMARTCUTPH.COM",
    "example.com", "figma.site",
    "app-example.makeproxy-c.figma.site.attacker.test",
    "ta-example-1380-preview.makeproxy-m.figma.site.attacker.test",
    "makeproxy-m.figma.site",
    "example.makeproxy-m.figma.site",
  ]) assert.equal(requiresCaptcha(host), true)
})
