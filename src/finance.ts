import type { SmartCutRecord, SyncState } from "./firebase"

type FinanceState = { records: SmartCutRecord[]; status: SyncState; error?: string }

// Modern transactions have a visit and two ledgers. Never let a surviving
// mirror resurrect a deleted visit/payment. Unlinked legacy ledgers remain valid.
export function reconcileFinance(
  data: Record<string, FinanceState>,
): Record<string, FinanceState> {
  const sales = data.sales
  const payments = data.payments
  if (!sales || !payments) return data
  const saleIds = new Set(sales.records.map((record) => record.id))
  const paymentIds = new Set(payments.records.map((record) => record.id))
  const appointmentIds = new Set(data.appointments?.records.map((record) => record.id))
  const walkInIds = new Set(data.walkins?.records.map((record) => record.id))
  const filter = (state: FinanceState): FinanceState => {
    const dependencies = [sales, payments, data.appointments, ...(data.walkins ? [data.walkins] : [])].filter(Boolean)
    const status = dependencies.some((item) => item.status === "error") ? "error"
      : dependencies.every((item) => item.status === "connected") ? "connected" : "connecting"
    return {
      ...state,
      status,
      error: dependencies.find((item) => item.error)?.error,
      records: state.records.filter((record) => {
        const linkedId = String(record.walkInId || record.appointmentId || "")
        if (!linkedId) return true
        if (!saleIds.has(record.id) || !paymentIds.has(record.id)) return false
        return record.walkInId ? walkInIds.has(linkedId) : appointmentIds.has(linkedId)
      }),
    }
  }
  return { ...data, sales: filter(sales), payments: filter(payments) }
}

// Ledger dates are the payment-recording date, not the appointment date.
export function financeDate(record: SmartCutRecord): string {
  if ((record.adminEditedAt || record.dateEditedAt) && typeof record.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) return record.date
  const timestamp = record.createdAt as { toDate?: () => Date; seconds?: number } | undefined
  const date = timestamp?.toDate?.() ?? (typeof timestamp?.seconds === "number" ? new Date(timestamp.seconds * 1000) : undefined)
  if (date && Number.isFinite(date.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
    return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-")
  }
  if (typeof record.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) return record.date
  return String(record.rows?.[0] || "")
}
export function financeRange(records: SmartCutRecord[], start: string, end: string): SmartCutRecord[] {
  return records.filter((record) => {
    const date = financeDate(record)
    return (!start || date >= start) && (!end || (date !== "" && date <= end))
  })
}
export function providerEarnings(records: SmartCutRecord[], providers: SmartCutRecord[] = []) {
  const groups = new Map<string, { id: string; name: string; cents: number; count: number }>()
  for (const provider of providers) groups.set(provider.id, { id: provider.id, name: String(provider.name), cents: 0, count: 0 })
  for (const record of records) {
    const name = String(record.provider || "Not recorded")
    const id = String(record.providerId || "")
    // Keep unassigned historical revenue in Sales, not in a fictitious payroll
    // provider. Never guess which person performed an unassigned walk-in.
    if (!id && (record.type === "Walk-in" || record.walkInId ||
      ["any available", "any available provider", "to be assigned at shop", "not recorded"].includes(name.trim().toLowerCase())))
      continue
    // Never guess a provider ID from a legacy name when recording payroll.
    const key = id || `legacy:${name}`
    const group = groups.get(key) || { id, name, cents: 0, count: 0 }
    const amount = Number(String(record.amount ?? record.rows?.[4] ?? 0).replace(/[₱,\s]/g, ""))
    if (!Number.isFinite(amount) || amount < 0) continue
    group.cents += Math.round(amount * 100)
    group.count++
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => ({ ...group, earnings: group.cents / 100 }))
}
export function percentagePay(earnings: number, percentage: string): number | undefined {
  const rate = Number(percentage)
  if (!percentage.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) return undefined
  return Math.round(Math.round(earnings * 100) * rate / 100) / 100
}

// Checkout mirrors the same ID into both collections. Prefer the receipt,
// while retaining older records that exist only in the sales ledger.
export function combinedFinance(sales: FinanceState, payments: FinanceState): FinanceState {
  const records = new Map<string, SmartCutRecord>()
  for (const [state, amountIndex, methodIndex] of [
    [sales, 5, 4],
    [payments, 4, 3],
  ] as const) {
    for (const record of state.records) {
      const previous = records.get(record.id)
      records.set(record.id, {
        ...previous,
        ...record,
        amount: record.amount ?? record.rows?.[amountIndex] ?? previous?.amount,
        method: record.method ?? record.rows?.[methodIndex] ?? previous?.method,
        provider: record.provider ?? (amountIndex === 5 ? record.rows?.[3] : undefined) ?? previous?.provider,
      })
    }
  }
  return {
    records: [...records.values()],
    status: sales.status === "error" || payments.status === "error" ? "error"
      : sales.status === "connected" && payments.status === "connected" ? "connected" : "connecting",
    error: sales.error || payments.error,
  }
}
