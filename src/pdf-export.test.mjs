import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createExportPdf, downloadPdf, exportDefinition, exportFilename } from "./pdf-export.mjs"

test("exports use PDF filenames, including former CSV names", () => {
  assert.equal(exportFilename("appointments"), "appointments.pdf")
  assert.equal(exportFilename("customers.csv"), "customers.pdf")
  assert.equal(exportFilename("receipt-123"), "receipt-123.pdf")
  assert.equal(exportFilename("payroll.pdf"), "payroll.pdf")
})

test("table definitions retain all data, repeated headers, and Manila metadata", () => {
  const columns = ["Name", "Email", "Phone", "Notes", "PHP"]
  const rows = [["José Peña", "client@example.test", "private", "Long note ".repeat(80), "₱1,500.00"]]
  const definition = exportDefinition("customers", columns, rows, new Date("2026-10-12T00:00:00Z"))
  assert.equal(definition.pageOrientation, "landscape")
  assert.equal(definition.content[3].table.headerRows, 1)
  assert.deepEqual(definition.content[3].table.body[1].map((cell) => cell.text), rows[0])
  assert.match(definition.content[2].text, /Asia\/Manila/)
  assert.match(definition.footer(2, 3).text, /Page 2 of 3/)
})

test("empty exports generate an explicit empty state", () => {
  const definition = exportDefinition("analytics", ["Metric", "Value"], [])
  assert.equal(definition.pageOrientation, "portrait")
  assert.equal(definition.content.at(-1).text, "No records match this export.")
})

test("generated downloads contain actual multi-page PDF bytes", async () => {
  const rows = Array.from({ length: 150 }, (_, index) => [
    `Client ${index} · José Peña`, "₱150.00", "Service notes ".repeat(20),
  ])
  const pdf = await createExportPdf("appointments", ["Client", "PHP", "Notes"], rows)
  const buffer = Buffer.from(await new Promise((resolve) => pdf.getBuffer(resolve)))
  const bytes = buffer.toString("latin1")
  assert.match(bytes, /^%PDF-/)
  assert.match(bytes, /%%EOF/)
  assert.ok((bytes.match(/\/Type \/Page\b/g) || []).length > 1)
})

test("all existing export actions share the PDF download path", () => {
  const source = readFileSync(new URL("./app/App.tsx", import.meta.url), "utf8")
  assert.match(source, /downloadPdf\(name, columns, rows, details\)/)
  assert.doesNotMatch(source, /text\/csv|link\.download = .*\.csv/)
  assert.equal((source.match(/\bdownload\(/g) || []).length, 7)
})

test("misaligned rows fail rather than silently dropping exported values", () => {
  assert.throws(() => exportDefinition("test", ["Name"], [["Maria", "lost value"]]), /must match/)
})

test("summary values are included without changing transaction rows", () => {
  const definition = exportDefinition("payments", ["PHP"], [["₱150.00"]], new Date(), [["Gross sales", "₱150.00"]])
  assert.equal(definition.content[3].table.body[1][0].text, "₱150.00")
  assert.deepEqual(definition.content.at(-1).table.body[1], ["Gross sales", "₱150.00"])
})

test("browser download saves a PDF blob and cleans up its temporary link", async () => {
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const create = URL.createObjectURL
  const revoke = URL.revokeObjectURL
  let blob
  let clicked = false
  let removed = false
  let revoked = false
  const link = {
    click() { clicked = true },
    remove() { removed = true },
  }
  try {
    globalThis.document = {
      createElement: () => link,
      body: { appendChild() {} },
    }
    globalThis.window = { setTimeout: (callback) => callback() }
    URL.createObjectURL = (value) => { blob = value; return "blob:test" }
    URL.revokeObjectURL = () => { revoked = true }
    await downloadPdf("receipt-test", ["Field", "Value"], [["Amount", "PHP 150"]])
    assert.equal(blob.type, "application/pdf")
    assert.equal(link.download, "receipt-test.pdf")
    assert.equal(link.href, "blob:test")
    assert.ok(clicked && removed && revoked)
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    URL.createObjectURL = create
    URL.revokeObjectURL = revoke
  }
})
