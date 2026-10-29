// Retired feature flag retained for compatibility. All record date/time
// corrections are disabled in the UI, save API, and Firestore rules.
export const TEMPORARY_MANAGER_DATE_EDITING = false

export function correctionDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value)
    throw new Error("Choose a valid record date.")
  return value
}

export function correctionTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new Error("Choose a valid time, including the correct AM or PM.")
  return value
}
