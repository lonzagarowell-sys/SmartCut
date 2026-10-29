export const billingPlans = {
  starter: { name: "Starter", amount: 99 },
  professional: { name: "Professional", amount: 399 },
  business: { name: "Business", amount: 599 },
}

export function billingDeadline(record) {
  for (const value of [record?.expiresAt, record?.currentPeriodEnd]) {
    const date = value?.toDate?.()
    if (date instanceof Date && Number.isFinite(date.getTime())) return date
  }
  const trial = record?.trialStartedAt?.toDate?.()
  return trial instanceof Date && Number.isFinite(trial.getTime())
    ? new Date(trial.getTime() + 7 * 86400000) : undefined
}

export function workspaceAccess(record, now = Date.now()) {
  const deadline = billingDeadline(record)
  if (!record) return { allowed: false, reason: "A subscription must be activated before using this workspace." }
  if (record.manualLocked === true) return { allowed: false, reason: String(record.reason || "This workspace was locked by an Administrator. Contact management to resolve the requirements.") }
  if (!["Active", "Trial"].includes(record.status)) return { allowed: false, reason: String(record.reason || "This workspace requires Administrator approval before access can resume.") }
  if (!deadline || deadline.getTime() <= now) return { allowed: false, reason: "The subscription has expired. Submit renewal proof and wait for Administrator approval." }
  return { allowed: true, reason: "", deadline }
}

export function addBillingMonth(date) {
  const offset = 8 * 3600000
  const next = new Date(date.getTime() + offset)
  const day = next.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  next.setUTCDate(Math.min(day, last))
  return new Date(next.getTime() - offset)
}

export function manilaDueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid access-through date.")
  const date = new Date(`${value}T23:59:59.999+08:00`)
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid access-through date.")
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const rendered = ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-")
  if (rendered !== value) throw new Error("Choose a valid access-through date.")
  return date
}
