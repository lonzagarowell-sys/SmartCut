import { normalizePhone } from "./owner-sms.js"

// No shop-name restriction or default recipient. Read management's saved settings.
export function ownerSmsRoute(shopId, settings, createdAt) {
  if (!settings?.number) return null
  const enabledAt = settings.enabledAt?.toDate?.()
  const bookedAt = createdAt?.toDate?.()
  if (!enabledAt || !bookedAt || bookedAt < enabledAt) return null
  try {
    return { shopId, phone: normalizePhone(settings.number) }
  } catch {
    return null
  }
}
