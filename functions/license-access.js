export function workspaceLicenseActive(data, now = Date.now()) {
  if (!data || data.manualLocked === true) return false
  const end = data.status === "Trial"
    ? data.trialStartedAt?.toDate?.()?.getTime() + 7 * 86400000
    : data.expiresAt?.toDate?.()?.getTime()
  return ["Active", "Trial"].includes(data.status) && Number.isFinite(end) && end > now
}
