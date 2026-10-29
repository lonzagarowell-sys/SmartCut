import test from "node:test"
import assert from "node:assert/strict"
import { formatShopHours } from "./shop-hours.mjs"

test("formats manager hours in 12-hour Manila time", () => {
  assert.equal(formatShopHours("09:00", "18:00"), "9:00 AM – 6:00 PM · Manila time")
  assert.equal(formatShopHours("00:00", "12:30"), "12:00 AM – 12:30 PM · Manila time")
})
test("does not invent hours for legacy or invalid directory entries", () => {
  for (const [open, close] of [[undefined, undefined], ["25:00", "26:00"], ["18:00", "09:00"], ["09:00", "09:00"]])
    assert.equal(formatShopHours(open, close), "Opening hours not published")
})
