import test from "node:test"
import assert from "node:assert/strict"
import { normalizePhone, isCustomerBooking, sendOwnerSms } from "./owner-sms.js"
import { ownerSmsRoute } from "./owner-sms-route.js"

const booking = {
  customerId: "customer", createdBy: "customer",
  date: "2026-06-15", time: "14:00",
}
const config = {
  endpoint: "https://dashboard.philsms.com/api/v3/sms/send",
  token: "test-only-token", phone: "09171234567", senderId: "PhilSMS",
}
test("has no default recipient and routes only to the shop's saved SMS number", () => {
  const enabledAt = { toDate: () => new Date("2026-06-01T00:00:00Z") }
  const createdAt = { toDate: () => new Date("2026-06-15T00:00:00Z") }
  assert.equal(ownerSmsRoute("shop-one", undefined, createdAt), null)
  assert.equal(ownerSmsRoute("shop-one", { number: "", enabledAt }, createdAt), null)
  assert.equal(ownerSmsRoute("shop-one", { number: "123", enabledAt }, createdAt), null)
  assert.deepEqual(ownerSmsRoute("shop-one", { number: "09171234567", enabledAt }, createdAt), {
    shopId: "shop-one", phone: "639171234567",
  })
  assert.deepEqual(ownerSmsRoute("shop-two", { number: "09181234567", enabledAt }, createdAt), {
    shopId: "shop-two", phone: "639181234567",
  })
  assert.equal(ownerSmsRoute("shop-one", { number: "09171234567", enabledAt }, {
    toDate: () => new Date("2026-05-01T00:00:00Z"),
  }), null)
})
test("normalizes local and international Philippine mobile numbers", () => {
  assert.equal(normalizePhone("09171234567"), "639171234567")
  assert.equal(normalizePhone("+639171234567"), "639171234567")
  assert.throws(() => normalizePhone("123"))
})
test("only customer-created bookings qualify", () => {
  assert.equal(isCustomerBooking(booking), true)
  assert.equal(isCustomerBooking({ ...booking, createdBy: "manager" }), false)
  assert.equal(isCustomerBooking({ customerId: "", createdBy: "" }), false)
})
test("sends server-controlled recipient and Manila appointment details", async () => {
  await sendOwnerSms(config, booking, async (url, options) => {
    assert.equal(url, config.endpoint)
    assert.equal(options.headers.Authorization, "Bearer test-only-token")
    assert.equal(options.redirect, "error")
    const payload = JSON.parse(options.body)
    assert.equal(payload.recipient, "639171234567")
    assert.match(payload.message, /2026-06-15 at 14:00 \(Asia\/Manila\)/)
    return { ok: true, json: async () => ({ status: "success" }) }
  })
})
test("rejects a website URL instead of an API endpoint", async () => {
  await assert.rejects(sendOwnerSms({ ...config, endpoint: "https://philsms.com" }, booking))
})
test("does not treat HTTP 200 provider rejection as acceptance", async () => {
  await assert.rejects(sendOwnerSms(config, booking, async () => ({
    ok: true, json: async () => ({ status: "error" }),
  })))
})
