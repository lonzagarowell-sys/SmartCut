import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const source = readFileSync(new URL("./domain.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
})
const { bookingSlots, canChangeAppointment } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)

test("services accept any whole-minute duration and reserve partial blocks", () => {
  for (let duration = 1; duration <= 240; duration++) {
    const slots = bookingSlots("09:00", duration)
    assert.equal(slots.length, Math.ceil(duration / 15))
    assert.equal(slots[0], "540")
    assert.equal(Number(slots.at(-1)), 540 + (slots.length - 1) * 15)
  }
  assert.deepEqual(bookingSlots("09:00", 20), ["540", "555"])
  assert.deepEqual(bookingSlots("09:00", 45), ["540", "555", "570"])
})

test("duration bounds and existing start-time restrictions remain enforced", () => {
  for (const duration of [0, -1, 241, 1.5, NaN, Infinity])
    assert.throws(() => bookingSlots("09:00", duration))
  assert.throws(() => bookingSlots("09:01", 20))
  assert.throws(() => bookingSlots("23:45", 16))
  assert.deepEqual(bookingSlots("23:45", 14), ["1425"])
})

test("management can start and complete any booking while providers remain assignment-restricted", () => {
  for (const role of ["Manager", "Administrator"]) {
    assert.equal(
      canChangeAppointment(role, "Accepted", "In Progress", false, false),
      true,
    )
    assert.equal(
      canChangeAppointment(role, "In Progress", "Completed", false, false),
      true,
    )
    assert.equal(
      canChangeAppointment(role, "Pending", "Completed", false, false),
      false,
    )
  }
  assert.equal(
    canChangeAppointment(
      "Service Provider",
      "Accepted",
      "In Progress",
      false,
      false,
    ),
    false,
  )
  assert.equal(
    canChangeAppointment(
      "Service Provider",
      "Accepted",
      "In Progress",
      true,
      false,
    ),
    true,
  )
  assert.equal(
    canChangeAppointment("Customer", "Accepted", "In Progress", false, true),
    false,
  )
})

test("acceptance does not let another provider start or complete the selected provider's booking", () => {
  for (const [before, next] of [
    ["Accepted", "In Progress"],
    ["Confirmed", "In Progress"],
    ["In Progress", "Completed"],
    ["In Service", "Completed"],
  ]) {
    assert.equal(canChangeAppointment("Service Provider", before, next, true, false), true)
    assert.equal(canChangeAppointment("Service Provider", before, next, false, true), false)
    for (const role of ["Manager", "Administrator"])
      assert.equal(canChangeAppointment(role, before, next, false, false), true)
  }
  assert.equal(canChangeAppointment("Service Provider", "Pending", "Accepted", true, false), false)
  assert.equal(canChangeAppointment("Service Provider", "Pending", "In Progress", true, false), false)
})
