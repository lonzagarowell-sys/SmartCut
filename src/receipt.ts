import { createWorker } from "tesseract.js"
import { validateServiceImage } from "./cloudinary"

export async function readReceiptReference(file: File): Promise<string> {
  validateServiceImage(file)
  const worker = await createWorker("eng")
  try {
    const { data } = await worker.recognize(file)
    const match = data.text.match(/(?:reference|ref)\s*(?:number|no\.?|#)?\s*[:.\-]?\s*([\d][\d\s-]{5,30})/i)
    const reference = match?.[1].replace(/\D/g, "") || ""
    if (!/^\d{6,20}$/.test(reference))
      throw new Error("We could not clearly read the GCash reference. Upload a sharper screenshot showing the reference number.")
    return reference
  } finally {
    await worker.terminate()
  }
}
