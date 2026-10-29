export type WalkInInput = {
  client: string
  email: string
  phone: string
  serviceIds: string[]
  requestedProviderId: string
  method: string
  quotedTotal: number
}
export declare const walkInPaymentMethods: string[]
export declare function normalizeWalkInInput(input: WalkInInput): WalkInInput
export declare function canClaimWalkIn(
  role: string | undefined,
  uid: string,
  visit: Record<string, unknown>,
  providerId: string,
): boolean
export declare function canAdvanceWalkIn(
  role: string | undefined,
  uid: string,
  visit: Record<string, unknown>,
  next: string,
): boolean
