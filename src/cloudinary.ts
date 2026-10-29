const cloudName = "dijbiwcbo"
const uploadPreset = "SmartCut"

export function validateServiceImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG, or WebP image.")
  if (file.size === 0 || file.size > 5 * 1024 * 1024)
    throw new Error("Choose a non-empty image smaller than or equal to 5 MB.")
}

export function isServiceImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return (
      url.origin === "https://res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/image/upload/`)
    )
  } catch {
    return false
  }
}

export async function uploadServiceImage(file: File) {
  validateServiceImage(file)
  const body = new FormData()
  body.append("file", file)
  body.append("upload_preset", uploadPreset)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body, signal: controller.signal },
    )
    if (!response.ok)
      throw new Error(
        'Photo upload failed. Check that Cloudinary has an unsigned upload preset named "SmartCut" allowing JPG, PNG, and WebP images up to 5 MB, then retry.',
      )
    const result = await response.json()
    if (
      !isServiceImageUrl(result.secure_url) ||
      typeof result.public_id !== "string" ||
      !result.public_id
    )
      throw new Error("Cloudinary returned an invalid image. Please retry.")
    return { imageUrl: result.secure_url, imagePublicId: result.public_id }
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "Photo upload timed out. Check your connection and retry.",
      )
    if (error instanceof TypeError)
      throw new Error(
        "Cloudinary is unreachable. Check your connection and retry.",
      )
    throw error
  } finally {
    clearTimeout(timer)
  }
}
