export function normalizeFacebookPageUrl(value) {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return ""
  if (text.length > 2000) return null
  try {
    const url = new URL(text)
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.me"].includes(url.hostname))
      return null
    return url.href
  } catch { return null }
}
