import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const app = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
const code = ts.transpileModule(source.slice(source.indexOf("export async function editManagerRecordDate("), source.indexOf("export async function readAdminShopRecord(")), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace("export ", "")
const edit = new Function(`${code}; return editManagerRecordDate;`)()

test("the retired date-edit API rejects every call without reading or writing Firebase", async () => {
  for (const date of ["2026-10-12", "", "invalid"]) {
    await assert.rejects(edit("shop", "appointments", { id: "record" }, date), /date and time editing is disabled/)
    await assert.rejects(edit("shop", "walkins", { id: "record" }, date, "10:14"), /disabled/)
  }
})

test("all temporary date editors, pickers, and edit-date buttons are removed", () => {
  assert.doesNotMatch(app, /ManagerDateEditor|AdminDatePicker|dateTimeOnly|Edit date|Save date|TEMPORARY_MANAGER_DATE_EDITING/)
  assert.match(readFileSync(new URL("./manager-date-edit.ts", import.meta.url), "utf8"), /TEMPORARY_MANAGER_DATE_EDITING = false/)
})

test("old clients cannot use the retired date-correction rules", () => {
  assert.match(rules, /temporaryManagerDateEditingEnabled\(\) \{ return false; \}/)
  const frozen = rules.slice(rules.indexOf("function recordTimeUnchanged("), rules.indexOf("function adminWalkInDetails("))
  for (const key of ["date", "time", "durationMinutes", "startMinute", "startsAt"])
    assert.ok(frozen.includes(`after.get("${key}", null) == before.get("${key}", null)`))
})

test("record edit buttons and editor entry points are removed while deletion stays gated", () => {
  assert.doesNotMatch(app, /AdminRecordEditButton|<AdminRecordEditor\b|Edit details/)
  assert.equal((app.match(/\{canEditRecords && <RecordDeleteButton/g) || []).length, 3)
  assert.equal((app.match(/canEditRecords=\{account.role === "Administrator" \|\| \(account.role === "Manager" && shop.ownerId === account.uid\)\}/g) || []).length, 3)
})
