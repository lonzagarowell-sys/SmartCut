import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { normalizeFacebookPageUrl } from "./facebook-page.mjs"

const source = readFileSync(new URL("./firebase.ts", import.meta.url), "utf8")
const code = ts.transpileModule(source.slice(source.indexOf("export async function saveBusinessSettings("), source.indexOf("export async function createPayrollStatement(")), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/export /g, "")
const record = (id, data) => ({ id, data: () => data })
function harness(previous = {}, appointments = []) {
  const writes = []
  const team = [record("owner", { name: "Owner", role: "Service Provider", active: true }),
    record("other", { name: "Other", role: "Service Provider", active: true })]
  const ui = {
    normalizeFacebookPageUrl, businessId: () => "shop", currentUser: () => ({ uid: "owner" }),
    shopDoc: (shop, name, id) => `shops/${shop}/${name}/${id}`, shopCollection: (shop, name) => `shops/${shop}/${name}`,
    getDocFromServer: async () => record("business", { shopType: "team", bookingSchemaVersion: 2, ...previous }),
    getDoc: async () => record("owner", { name: "Owner", role: "Manager" }),
    getDocsFromServer: async (path) => ({ docs: path.endsWith("team") ? team : path.endsWith("appointments") ? appointments.map((row) => record(row.id, row)) : [] }),
    appointmentStatus: (value) => ({ Confirmed: "Accepted", "In Service": "In Progress" }[value] || value),
    db: {}, doc: (...args) => args.slice(1).join("/"), serverTimestamp: () => "server-time",
    writeBatch: () => ({
      set: (path, value) => writes.push({ path, value }),
      update: (path, value) => writes.push({ path, value }),
      commit: async () => {},
    }),
  }
  const save = new Function("ui", `const { ${Object.keys(ui).join(",")} } = ui; ${code}; return saveBusinessSettings;`)(ui)
  const settings = { shopType: "team", name: "Shop", open: "09:00", close: "18:00", openingMinute: 540, closingMinute: 1080, managerWorksAsBarber: true, barberAvailable: false }
  return { save: (overrides = {}) => save({ ...settings, ...overrides }), writes }
}
test("team owner can toggle their barber availability without changing shop type or colleagues", async () => {
  const mock = harness()
  await mock.save()
  assert.equal(mock.writes.find((write) => write.path.endsWith("settings/business")).value.shopType, "team")
  assert.equal(mock.writes.find((write) => write.path.endsWith("team/owner")).value.active, false)
  assert.ok(mock.writes.every((write) => !write.path.endsWith("team/other")))
})
test("solo transition checks apply only to an actual model change", async () => {
  await assert.rejects(harness().save({ shopType: "solo" }), /Deactivate other/)
  await harness({ shopType: "solo" }).save({ shopType: "solo", barberAvailable: true })
})
test("existing team appointments do not incorrectly trigger model migration validation", async () => {
  const active = [{ id: "old", status: "Accepted", providerId: "other" }]
  await harness({}, active).save()
  await assert.rejects(harness({ bookingSchemaVersion: 1 }, active).save(), /legacy bookings/)
})
test("availability safeguards preserve assigned reservations without modifying bookings", async () => {
  const mock = harness({}, [{ id: "pending", status: "Accepted", providerId: "owner", scheduleId: "owner_day" }])
  await assert.rejects(mock.save(), /assigned appointments/)
  assert.equal(mock.writes.length, 0)
  await harness({ barberAvailable: false }, [{ id: "old", status: "Accepted", providerId: "owner", scheduleId: "owner_day" }]).save()
})
