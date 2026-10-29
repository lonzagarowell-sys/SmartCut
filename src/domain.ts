export type BookingInput = {
  client: string
  customerId: string
  serviceId: string
  providerId: string
  date: string
  time: string
  notes: string
}
export function appointmentStatus(value: unknown): string {
  return ({ Confirmed: "Accepted", "Pending Approval": "Pending", "In Service": "In Progress" } as Record<string, string>)[String(value)] || String(value)
}
export function canChangeAppointment(role: string, current: unknown, next: string, assigned: boolean, owner: boolean): boolean {
  const before = appointmentStatus(current)
  if (next === "Cancelled") return (["Administrator", "Manager"].includes(role) && ["Pending", "Accepted", "In Progress"].includes(before)) || (role === "Customer" && owner && ["Pending", "Accepted"].includes(before))
  if (["Administrator", "Manager"].includes(role) && before === "Pending") return ["Accepted", "Rejected"].includes(next)
  if (["Administrator", "Manager"].includes(role) || (role === "Service Provider" && assigned))
    return (before === "Accepted" && next === "In Progress") || (before === "In Progress" && next === "Completed")
  return false
}
type ReviewRecord = { id: string; [key: string]: unknown }
export function canRecordAppointmentPayment(role: string, status: unknown, paymentStatus: unknown, assigned: boolean): boolean {
  return ["Completed", "Rated"].includes(appointmentStatus(status)) &&
    paymentStatus === "Unpaid" &&
    (["Administrator", "Manager"].includes(role) || (role === "Service Provider" && assigned))
}
export function awaitingPayment(record: Record<string, unknown>): boolean {
  return ["Completed", "Rated"].includes(appointmentStatus(record.status)) &&
    record.paymentStatus === "Unpaid" &&
    typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount >= 0
}
export type ReviewEntry = {
  id: string
  customer: string
  provider: string
  providerId: string
  service: string
  serviceId: string
  appointmentDate: string
  ratingDate: string
  ratingTime: number
  serviceRating: number
  providerRating?: number
  comment: string
}
export type ReviewFilters = {
  search: string
  providerId: string
  serviceId: string
  rating: string
  scoreType: "service" | "provider"
  dateType: "rating" | "appointment"
  start: string
  end: string
}
export function completedReviewEntries(reviews: ReviewRecord[], appointments: ReviewRecord[], role: string, uid: string): ReviewEntry[] {
  const bookings = new Map(appointments.map((appointment) => [appointment.id, appointment]))
  const validScore = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
  return reviews.flatMap((review): ReviewEntry[] => {
    const appointment = bookings.get(String(review.appointmentId))
    if (!appointment || !["Completed", "Rated"].includes(appointmentStatus(appointment.status)) || review.customerId !== appointment.customerId || review.providerId !== appointment.providerId) return []
    const allowed = ["Administrator", "Manager"].includes(role) || (role === "Service Provider" && review.providerId === uid) || (role === "Customer" && review.customerId === uid)
    const serviceRating = review.serviceRating ?? review.rating
    if (!allowed || !validScore(serviceRating)) return []
    const timestamp = review.createdAt as { toDate?: () => Date; seconds?: number } | undefined
    const date = timestamp?.toDate?.() || (typeof timestamp?.seconds === "number" ? new Date(timestamp.seconds * 1000) : undefined)
    const ratingTime = date && Number.isFinite(date.getTime()) ? date.getTime() : 0
    return [{
      id: review.id,
      customer: String(appointment.client || "Customer"),
      provider: String(appointment.provider || "Service provider"),
      providerId: String(review.providerId || ""),
      service: String(appointment.service || "Service"),
      serviceId: String(appointment.serviceId || `legacy:${appointment.service || "Service"}`),
      appointmentDate: String(appointment.date || ""),
      ratingDate: ratingTime && date ? manilaDate(date) : "",
      ratingTime,
      serviceRating,
      providerRating: validScore(review.providerRating) ? review.providerRating : undefined,
      comment: String(review.comment || ""),
    }]
  }).sort((first, second) => second.ratingTime - first.ratingTime)
}
export function filterReviewEntries(entries: ReviewEntry[], filters: ReviewFilters): ReviewEntry[] {
  const query = filters.search.trim().toLocaleLowerCase("en-PH")
  return entries.filter((entry) => {
    const date = filters.dateType === "appointment" ? entry.appointmentDate : entry.ratingDate
    const score = filters.scoreType === "provider" ? entry.providerRating : entry.serviceRating
    return (!filters.providerId || entry.providerId === filters.providerId) &&
      (!filters.serviceId || entry.serviceId === filters.serviceId) &&
      (!filters.rating || score === Number(filters.rating)) &&
      (!filters.start || (date !== "" && date >= filters.start)) &&
      (!filters.end || (date !== "" && date <= filters.end)) &&
      (!query || [entry.customer, entry.provider, entry.service, entry.comment].join(" ").toLocaleLowerCase("en-PH").includes(query))
  })
}
export const peso = (amount: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    amount,
  )
export function serviceIdentity(name: unknown, category: unknown): string {
  const normalize = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
  return JSON.stringify([normalize(name), normalize(category)])
}
export function subscriptionPeriodEnd(
  record: Record<string, unknown> | undefined,
): Date | undefined {
  const end = record?.currentPeriodEnd as { toDate?: () => Date } | undefined
  const endDate = end?.toDate?.()
  if (endDate instanceof Date && Number.isFinite(endDate.getTime()))
    return endDate
  const start = record?.trialStartedAt as { toDate?: () => Date } | undefined
  const startDate = start?.toDate?.()
  if (startDate instanceof Date && Number.isFinite(startDate.getTime()))
    return new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
  return undefined
}
export function moneyNumber(value: unknown): number {
  const amount =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[₱,\s]/g, ""))
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error("Enter a valid, non-negative PHP amount.")
  return Math.round(amount * 100) / 100
}
export function manilaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-")
}
export function bookingSlots(time: string, duration: number): string[] {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Choose a valid time.")
  const [hours, minutes] = time.split(":").map(Number)
  const start = hours * 60 + minutes
  if (
    hours > 23 ||
    minutes > 59 ||
    start % 15 ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 240 ||
    start + duration > 1440
  )
    throw new Error(
      "Choose a start time in 15-minute intervals and a whole-minute duration of 1–240 minutes, ending before midnight.",
    )
  // Reserve every scheduling block touched by the service, including a partial final block.
  return Array.from({ length: Math.ceil(duration / 15) }, (_, index) =>
    String(start + index * 15),
  )
}
export function validateBooking(input: BookingInput, now = new Date()) {
  if (input.client.trim().length < 2 || !input.serviceId)
    throw new Error(
      "Select a service and enter the client’s name.",
    )
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !/^\d{2}:\d{2}$/.test(input.time)
  )
    throw new Error("Choose a valid booking date and time.")
  const instant = new Date(`${input.date}T${input.time}:00+08:00`)
  if (
    !Number.isFinite(instant.getTime()) ||
    manilaDate(instant) !== input.date ||
    instant <= now
  )
    throw new Error(
      "Choose a future date and time in Philippine Standard Time.",
    )
  if (input.notes.length > 1000)
    throw new Error("Keep appointment notes under 1,000 characters.")
}
export function reservationProvider(
  candidates: { id: string; active: unknown; role: unknown; slots: Record<string, string> }[],
  keys: string[],
  soloProviderId = "",
): string {
  return candidates.find((candidate) => candidate.active === true &&
    candidate.role === "Service Provider" && (!soloProviderId || candidate.id === soloProviderId) &&
    keys.every((key) => !candidate.slots[key]))?.id || ""
}

export function canAssignBooking(
  role: string,
  uid: string,
  booking: { status?: unknown; providerId?: unknown; providerPreference?: unknown },
  targetId: string,
  actorActive: boolean,
): boolean {
  return booking.status === "Accepted" && booking.providerId === "" &&
    booking.providerPreference === "any" && !!targetId &&
    (["Manager", "Administrator"].includes(role) ||
      (role === "Service Provider" && actorActive && targetId === uid))
}
export function csvText(columns: string[], rows: string[][]) {
  const escape = (value: string) => {
    const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
  }
  return (
    "\uFEFF" +
    [columns, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")
  )
}
