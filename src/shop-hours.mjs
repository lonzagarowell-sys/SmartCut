export function formatShopHours(open, close) {
  const valid = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  if (!valid(open) || !valid(close) || open >= close) return "Opening hours not published"
  const format = (value) => {
    const [hour, minute] = value.split(":")
    return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) < 12 ? "AM" : "PM"}`
  }
  return `${format(open)} – ${format(close)} · Manila time`
}
