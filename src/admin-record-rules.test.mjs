import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
const correction = rules.slice(
  rules.indexOf("function adminRecordCorrection()"),
  rules.indexOf("function cashier()"),
)

test("record corrections require an Administrator or actual shop owner and server audit timestamps", () => {
  assert.match(correction, /recordEditor\(\)/)
  const authorization = rules.slice(rules.indexOf("function recordEditor("), rules.indexOf("function recordTimeUnchanged("))
  assert.match(authorization, /globalAdministrator\(\)/)
  assert.match(authorization, /role\(\) == "Manager"/)
  assert.match(authorization, /ownerId == request.auth.uid/)
  assert.match(correction, /get\("editedByAdmin", ""\) == request\.auth\.uid/)
  assert.match(correction, /get\("adminEditedAt", null\) == request\.time/)
  assert.match(correction, /updatedAt == request\.time/)
  assert.doesNotMatch(correction, /manager\(\)|cashier\(\)|shopAccessActive\(/)
})

test("only existing booking, walk-in and finance records get correction permissions", () => {
  for (const name of ["appointments", "walkins"]) {
    assert.match(rules, new RegExp(`match /${name}/\\{id\\} \\{\\s*allow update: if adminRecordCorrection\\(\\)(?: && adminWalkInDetails\\(resource.data, request.resource.data\\))?;`))
  }
  assert.match(rules, /allow update: if collectionName in \["sales", "payments"\] && adminRecordCorrection\(\)/)
  assert.equal((rules.match(/allow update:.*adminRecordCorrection\(\)/g) || []).length, 3)
})

test("corrections freeze scheduling, record identity, and creation metadata", () => {
  assert.match(correction, /recordTimeUnchanged\(resource.data, request.resource.data\)/)
  assert.doesNotMatch(correction, /startsAt > request\.time/)
  const fields = correction.slice(correction.indexOf("affectedKeys().hasOnly"))
  for (const field of ["createdAt", "createdBy", "appointmentId", "walkInId", "currency", "date", "time", "durationMinutes", "startsAt", "startMinute"])
    assert.ok(!fields.includes(`"${field}"`), `${field} must stay immutable`)
  assert.match(correction, /amountCents == math\.round\(request\.resource\.data\.amount \* 100\)/)
})

test("calendar corrections require an audited booking and limit changed slot keys", () => {
  const calendar = rules.slice(
    rules.indexOf("function adminScheduleCorrection("),
    rules.indexOf("function scheduleChange("),
  )
  assert.match(calendar, /recordEditor\(\)/)
  assert.match(calendar, /recordTimeUnchanged\(before, booking\)/)
  assert.match(calendar, /booking\.get\("adminEditedAt", null\) == request\.time/)
  assert.match(calendar, /booking\.get\("editedByAdmin", ""\) == request\.auth\.uid/)
  assert.ok(calendar.indexOf('booking.get("adminEditedAt"') < calendar.indexOf("recordEditor()"))
  assert.match(calendar, /affectedKeys\(\)\.hasOnly\(before\.get\("slotKeys", \[\]\)\.concat\(booking\.slotKeys\)\)/)
  assert.match(calendar, /oldSlots\.values\(\)\.removeAll\(data\.slots\.values\(\)\)/)
})

test("exact-minute corrections retain full ownership checks for a 17-block service", () => {
  const ownership = rules.slice(rules.indexOf("function slotsHeld("), rules.indexOf("function validSlotKeys("))
  assert.match(ownership, /count <= 17/)
  assert.match(ownership, /slots\[keys\[16\]\] == id/)
  const creation = rules.slice(rules.indexOf("function validSlotKeys("), rules.indexOf("function newBookingSlotsHeld("))
  assert.match(creation, /count <= 16/)
})

test("the downloadable copy exactly matches the deployment rules", () => {
  assert.equal(readFileSync(new URL("../public/smartcut-firestore.rules.txt", import.meta.url), "utf8"), rules)
})
