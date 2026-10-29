let enginePromise

async function pdfEngine() {
  if (!enginePromise) {
    enginePromise = Promise.all([
      import("pdfmake/build/pdfmake.js"),
      import("pdfmake/build/vfs_fonts.js"),
    ]).then(([engine, fonts]) => {
      engine.default.addVirtualFileSystem(fonts.default)
      return engine.default
    }).catch((error) => {
      enginePromise = undefined
      throw error
    })
  }
  return enginePromise
}

export function exportFilename(name) {
  return `${String(name).replace(/\.(csv|pdf)$/i, "").replace(/[^a-z0-9_-]+/gi, "-") || "smartcut-export"}.pdf`
}

export function exportDefinition(name, columns, rows, generatedAt = new Date(), details = []) {
  if (!columns.length) throw new Error("An export needs at least one column.")
  if (rows.some((row) => row.length !== columns.length))
    throw new Error("Export columns and row values must match.")
  const title = String(name)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
  const generated = generatedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila", hour12: true })
  return {
    info: { title: `SmartCut — ${title}`, author: "SmartCut", creator: "SmartCut" },
    pageSize: "A4",
    pageOrientation: columns.length > 4 ? "landscape" : "portrait",
    pageMargins: [32, 40, 32, 40],
    defaultStyle: { font: "Roboto", fontSize: 8, color: "#24352d" },
    content: [
      { text: "SMARTCUT", fontSize: 10, bold: true, color: "#245c42", margin: [0, 0, 0, 6] },
      { text: title, fontSize: 20, bold: true, margin: [0, 0, 0, 8] },
      { text: `Generated ${generated} · Asia/Manila · ${rows.length} ${rows.length === 1 ? "record" : "records"}`, color: "#64756c", margin: [0, 0, 0, 16] },
      {
        table: {
          headerRows: 1,
          widths: columns.map(() => "*"),
          body: [
            columns.map((text) => ({ text: String(text), bold: true, color: "#ffffff", fillColor: "#245c42" })),
            ...rows.map((row) => columns.map((_, index) => ({ text: String(row[index] ?? ""), margin: [0, 3, 0, 3] }))),
          ],
        },
        layout: "lightHorizontalLines",
      },
      ...(!rows.length ? [{ text: "No records match this export.", margin: [0, 12, 0, 0] }] : []),
      ...(details.length ? [{
        margin: [0, 16, 0, 0],
        table: {
          headerRows: 1,
          widths: ["auto", "*"],
          body: [
            [{ text: "Summary", bold: true }, { text: "Value", bold: true }],
            ...details.map(([label, value]) => [String(label ?? ""), String(value ?? "")]),
          ],
        },
        layout: "lightHorizontalLines",
      }] : []),
    ],
    footer: (currentPage, pageCount) => ({
      text: `SmartCut · Page ${currentPage} of ${pageCount}`,
      alignment: "right",
      fontSize: 8,
      color: "#64756c",
      margin: [32, 12, 32, 0],
    }),
  }
}

export async function createExportPdf(name, columns, rows, details = []) {
  // Capture the click-time values before the lazily loaded engine resolves.
  const definition = exportDefinition(name, [...columns], rows.map((row) => [...row]), new Date(), details.map((row) => [...row]))
  const engine = await pdfEngine()
  return engine.createPdf(definition)
}

export async function downloadPdf(name, columns, rows, details = []) {
  const pdf = await createExportPdf(name, columns, rows, details)
  const blob = await new Promise((resolve) => pdf.getBlob(resolve))
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = url
    link.download = exportFilename(name)
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}
