export const walkInPaymentMethods = ["Cash", "E-wallet"]

export function normalizeWalkInInput(input) {
  const client = String(input.client || "").trim()
  const email = String(input.email || "")
    .trim()
    .toLowerCase()
  const phone = String(input.phone || "").trim()
  const serviceIds = input.serviceIds
  const requestedProviderId = typeof input.requestedProviderId === "string"
    ? input.requestedProviderId.trim() : ""
  if (client.length < 2 || client.length > 120)
    throw new Error("Enter a client name between 2 and 120 characters.")
  if (
    email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  )
    throw new Error("Enter a valid optional email address.")
  if (phone.length > 30)
    throw new Error("Phone numbers must be 30 characters or fewer.")
  if (
    !Array.isArray(serviceIds) ||
    !serviceIds.length ||
    serviceIds.some(
      (id) => typeof id !== "string" || !id || id.includes("/"),
    ) ||
    new Set(serviceIds).size !== serviceIds.length
  )
    throw new Error("Choose one or more different active services.")
  if (!walkInPaymentMethods.includes(input.method))
    throw new Error("Choose Cash or E-wallet.")
  if (!requestedProviderId || requestedProviderId.includes("/"))
    throw new Error("Choose a specific active service provider before continuing.")
  if (!Number.isFinite(input.quotedTotal) || input.quotedTotal < 0)
    throw new Error("Review the service total before confirming payment.")
  return {
    client,
    email,
    phone,
    serviceIds,
    method: input.method,
    requestedProviderId,
    quotedTotal: input.quotedTotal,
  }
}

export function canClaimWalkIn(role, uid, visit, providerId) {
  if (visit.status !== "Pending" || visit.acceptedBy) return false
  if (!providerId) return false
  if (visit.requestedProviderId && visit.requestedProviderId !== providerId)
    return false
  return (
    ["Administrator", "Manager"].includes(role) ||
    (role === "Service Provider" && uid === providerId)
  )
}

export function canAdvanceWalkIn(role, uid, visit, next) {
  const permitted =
    ["Administrator", "Manager"].includes(role) ||
    (role === "Service Provider" && visit.providerId === uid)
  return (
    permitted &&
    ((visit.status === "Accepted" && next === "In Service") ||
      (visit.status === "In Service" &&
        next === "Paid" &&
        visit.paymentStatus === "Paid"))
  )
}
