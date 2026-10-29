import type { SmartCutRecord } from "./firebase"

// Scheduling fields are never exposed by the record editor.
// Identity, audit history and reservation internals are maintained by transactions.
export const adminRecordFields = [
  ["client", "Customer name", "text"],
  ["customerId", "Customer account UID (optional)", "text"],
  ["email", "Email", "email"],
  ["phone", "Phone", "text"],
  ["service", "Service name", "text"],
  ["serviceId", "Service ID", "text"],
  ["provider", "Provider name", "text"],
  ["providerId", "Provider UID (blank for any available)", "text"],
  ["amount", "Amount (PHP)", "number"],
  ["method", "Payment method", "text"],
  ["status", "Record status", "text"],
  ["paymentStatus", "Payment status", "text"],
  ["notes", "Notes", "text"],
  ["rejectionReason", "Rejection reason", "text"],
] as const

export function recordEditFields(record: SmartCutRecord) {
  return adminRecordFields.filter(([key]) =>
    ["client", "service", "provider", "providerId", "amount", "status", "notes"].includes(key) ||
    key in record)
}

export function adminRecordTime(record: SmartCutRecord): string {
  if (typeof record.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(record.time)) return record.time
  const stamp = record.createdAt as { toDate?: () => Date; seconds?: number } | undefined
  const date = stamp?.toDate?.() ?? (typeof stamp?.seconds === "number" ? new Date(stamp.seconds * 1000) : undefined)
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)
    : ""
}

// Preserve legacy exact-minute starts when transferring provider reservations.
// Reserve every touched 15-minute block without shifting the recorded time.
export function adminBookingSlots(time: string, duration: number): string[] {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid time.")
  const [hour, minute] = time.split(":").map(Number)
  const start = hour * 60 + minute
  const end = start + duration
  if (!Number.isInteger(duration) || duration < 1 || duration > 240 || end > 1440)
    throw new Error("Choose a whole-minute duration of 1–240 minutes, ending by midnight.")
  const firstBlock = Math.floor(start / 15) * 15
  return Array.from({ length: Math.ceil((end - firstBlock) / 15) }, (_, index) => String(firstBlock + index * 15))
}

export function normalizeAdminEdit(record: SmartCutRecord, input: Record<string, unknown>) {
  for (const key of ["date", "durationMinutes", "startsAt", "startMinute"]) {
    if (key in input && JSON.stringify(input[key] ?? null) !== JSON.stringify(record[key] ?? null))
      throw new Error("Record date, time, and duration are read-only and cannot be changed.")
  }
  if ("time" in input && String(input.time ?? "") !== adminRecordTime(record))
    throw new Error("Record time is read-only and cannot be changed.")
  const changes: Record<string, unknown> = {}
  for (const [key, , type] of recordEditFields(record)) {
    const value = input[key]
    if (type === "number") {
      const number = Number(value)
      if (value === "" || !Number.isFinite(number) || number < 0)
        throw new Error(`Enter a valid ${key === "amount" ? "amount" : "duration"}.`)
      changes[key] = number
    } else changes[key] = String(value ?? "").trim()
  }
  for (const key of ["date", "durationMinutes"])
    if (record[key] !== undefined) changes[key] = record[key]
  if (String(changes.client).length < 2 || !changes.service)
    throw new Error("Enter a customer name and service.")
  for (const key of ["customerId", "providerId", "serviceId"]) {
    if (String(changes[key] || "").includes("/")) throw new Error("Account and service IDs cannot contain slashes.")
  }
  if (record.type === "Walk-in" && changes.providerId !== record.providerId && !changes.providerId)
    throw new Error("Choose a specific active service provider for the walk-in.")
  // Preserve stored times exactly; do not invent a time on legacy walk-ins
  // whose display time comes from their original creation timestamp.
  if (record.time !== undefined) changes.time = record.time
  if (record.durationMinutes !== undefined &&
    (!Number.isInteger(changes.durationMinutes) || Number(changes.durationMinutes) < 1 ||
      Number(changes.durationMinutes) > 240))
    throw new Error("Duration must be a whole number of 1–240 minutes.")
  const statuses = record.type === "Walk-in"
    ? ["Pending", "Accepted", "In Service", "Paid"]
    : ["Pending", "Accepted", "In Progress", "Completed", "Rated", "Rejected", "Cancelled", "Paid"]
  if (!statuses.includes(String(changes.status))) throw new Error(`Status must be one of: ${statuses.join(", ")}.`)
  if (changes.paymentStatus !== undefined && !["Paid", "Unpaid"].includes(String(changes.paymentStatus)))
    throw new Error("Payment status must be Paid or Unpaid.")
  const methods = record.type === "Walk-in" ? ["Cash", "E-wallet"] : ["Cash", "Card", "E-wallet", "GCash", "Bank transfer"]
  if (changes.method !== undefined && changes.method !== record.method && !methods.includes(String(changes.method)))
    throw new Error(record.type === "Walk-in" ? "Choose Cash or E-wallet." : "Choose Cash, Card, E-wallet, GCash, or Bank transfer.")
  changes.amount = Math.round(Number(changes.amount) * 100) / 100
  changes.amountCents = Math.round(Number(changes.amount) * 100)
  if (Array.isArray(record.serviceNames)) {
    const lines = input.lines as { id: string; name: string; amount: string }[]
    if (!Array.isArray(lines) || !lines.length ||
      lines.some((line) => !line.id.trim() || line.id.includes("/") || !line.name.trim() ||
        line.amount === "" || !Number.isFinite(Number(line.amount)) || Number(line.amount) < 0))
      throw new Error("Enter one or more services with valid IDs, names, and amounts.")
    changes.serviceIds = lines.map((line) => line.id.trim())
    if (new Set(changes.serviceIds as string[]).size !== lines.length)
      throw new Error("Each service must have a different ID.")
    changes.serviceNames = lines.map((line) => line.name.trim())
    changes.serviceAmounts = lines.map((line) => Math.round(Number(line.amount) * 100) / 100)
    changes.service = (changes.serviceNames as string[]).join(" + ")
    changes.amountCents = (changes.serviceAmounts as number[]).reduce((sum, amount) => sum + Math.round(amount * 100), 0)
    changes.amount = Number(changes.amountCents) / 100
    changes.requestedProviderId = changes.providerId
  }
  return changes
}

export function adminRecordDate(value: unknown) {
  const [year, month, day] = String(value || "").split("-")
  return year && month && day ? `${month}/${day}/${year.slice(-2)}` : "MM/DD/YY"
}
