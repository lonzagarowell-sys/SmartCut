export function normalizeSmsNumber(value) {
  if (typeof value !== "string") return null
  const phone = value.trim().replace(/[\s()-]/g, "")
  if (!phone) return ""
  if (/^09\d{9}$/.test(phone)) return `63${phone.slice(1)}`
  if (/^\+?639\d{9}$/.test(phone)) return phone.replace(/^\+/, "")
  return null
}
