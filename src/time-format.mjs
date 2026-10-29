export function parseTime24(value) {
  const match = typeof value === "string" ? value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/) : null
  return match ? { hour: Number(match[1]), minute: match[2] } : null
}

export function formatTime12(value, fallback = "—") {
  const parts = parseTime24(value)
  if (parts) return `${parts.hour % 12 || 12}:${parts.minute} ${parts.hour >= 12 ? "PM" : "AM"}`
  // Keep already formatted legacy times readable without guessing a timezone.
  const legacy = typeof value === "string" ? value.trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s+(AM|PM)$/i) : null
  return legacy ? `${Number(legacy[1])}:${legacy[2]} ${legacy[3].toUpperCase()}` : fallback
}

export function timeTo24(hour, minute, period) {
  if (!/^(?:[1-9]|1[0-2])$/.test(String(hour)) || !/^[0-5]\d$/.test(String(minute)) ||
    !["AM", "PM"].includes(period)) throw new Error("Choose a valid hour, minute, and AM/PM.")
  return `${String(Number(hour) % 12 + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`
}

export function formatNotificationTime(message, time) {
  const text = String(message ?? "")
  const raw = typeof time === "string" && parseTime24(time) ? time.trim() : null
  return raw ? text.replace(new RegExp(`\\bat ${raw}(?![:\\d]|\\s*(?:AM|PM)\\b)`, "gi"), `at ${formatTime12(raw)}`) : text
}

export function formatDateManila(value, fallback = "Date not recorded") {
  const text = typeof value === "string" ? value : ""
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00+08:00`) : null
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })
    : text || fallback
}

export function timestampMillis(value) {
  if (!value) return 0
  const milliseconds = typeof value.toMillis === "function" ? value.toMillis()
    : typeof value.toDate === "function" ? value.toDate()?.getTime()
    : typeof value.seconds === "number" ? value.seconds * 1000
    : value instanceof Date ? value.getTime() : 0
  return Number.isFinite(milliseconds) ? milliseconds : 0
}

export function formatTimestampManila(value, fallback = "Time not recorded") {
  const milliseconds = timestampMillis(value)
  return milliseconds ? new Date(milliseconds).toLocaleString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }) : fallback
}
