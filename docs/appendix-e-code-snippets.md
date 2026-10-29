# APPENDIX E
# CODE SNIPPETS

The following are verbatim excerpts from the SmartCut project at the time this appendix was prepared. Source locations identify each excerpt. Imports and surrounding declarations are omitted where noted; these boxes are documentation excerpts, not independent programs. Do not replace project code with an isolated excerpt. No private credentials are included.

## 1. Role-Based Access and Workspace Routing

Defines role-specific workspace pages and redirects a user away from a page outside the allowed menu. Firebase Authentication supplies the account; Firestore rules separately enforce database permissions.

**Source:** `src/app/App.tsx`, lines 250–264.

```tsx
const rolePages: Record<UserRole, Page[]> = {
  Administrator: managementPages,
  Manager: managementPages,
  "Service Provider": [
    "Overview",
    "Appointments",
    "Ratings & Reviews",
    "Services",
    "Customers",
    "Payroll",
    "Settings",
    "Feedback",
  ],
  Customer: ["Overview", "Appointments", "Services", "Payments", "Settings", "Feedback"],
}
```

**Source:** `src/app/App.tsx`, lines 2707–2713.

```tsx
  if (!pathPage || !allowed.includes(page))
    return (
      <Navigate
        to="/overview"
        replace
      />
    )
```

**Implementation note:** These are frontend excerpts. The role matrix references managementPages and Page/UserRole types in the same project. Hiding or redirecting a page is not a replacement for Firestore authorization.

## 2. Reservation Slot Availability and Overlap Checking

Generates every 15-minute block touched by the selected service and selects an active provider whose calendar has no occupied required block.

**Source:** `src/domain.ts`, lines 138–158.

```typescript
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
```

**Source:** `src/domain.ts`, lines 181–189.

```typescript
export function reservationProvider(
  candidates: { id: string; active: unknown; role: unknown; slots: Record<string, string> }[],
  keys: string[],
  soloProviderId = "",
): string {
  return candidates.find((candidate) => candidate.active === true &&
    candidate.role === "Service Provider" && (!soloProviderId || candidate.id === soloProviderId) &&
    keys.every((key) => !candidate.slots[key]))?.id || ""
}
```

**Implementation note:** The caller uses these helpers inside createAppointment's Firestore transaction. The transaction, together with calendar rules, protects concurrent bookings; an in-memory check alone would not prevent races.

## 3. Reservation Validation and Creation

Checks a future Philippine date/time, reads the canonical service price and duration, checks business hours, and saves the appointment and calendar reservation.

**Source:** `src/domain.ts`, lines 159–180.

```typescript
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
```

**Source:** `src/firebase.ts`, lines 1155–1186.

```typescript
    const service = await transaction.get(shopDoc(shopId, "services", input.serviceId))
    if (!service.exists() || service.data().status !== "Active")
      throw new Error(
        "This service is no longer available. Refresh your selection.",
      )
    const settings = await transaction.get(shopDoc(shopId, "settings", "business"))
    if (role !== "Customer" && input.customerId) {
      const customer = await transaction.get(shopDoc(shopId, "members", input.customerId))
      if (!customer.exists() || customer.data().role !== "Customer")
        throw new Error("This customer has not connected with your shop. Ask them to select your shop, or book them as a walk-in without an account UID.")
    }
    const hours = settings.data()
    if (hours?.shopType === "solo" && input.providerId && input.providerId !== hours.managerProviderId)
      throw new Error("Solo shop bookings must use the manager’s barber profile.")
    if (hours?.bookingSchemaVersion !== 2)
      throw new Error(
        "An Administrator or Manager must finish business setup and legacy booking migration in Settings before new reservations are enabled.",
      )
    const durationMinutes = Number(service.data().durationMinutes)
    const amount = moneyNumber(service.data().amount)
    const slotKeys = bookingSlots(input.time, durationMinutes)
    if (hours?.open && hours?.close) {
      if (
        input.time < hours.open ||
        Number(slotKeys[0]) + durationMinutes >
          Number(hours.close.split(":")[0]) * 60 +
            Number(hours.close.split(":")[1])
      )
        throw new Error(
          "Choose a time within business hours, including the full service duration.",
        )
    }
```

**Source:** `src/firebase.ts`, lines 1211–1239.

```typescript
    transaction.set(appointment, {
      client: role === "Customer" ? profile.data()!.name : input.client.trim(),
      customerId: role === "Customer" ? user.uid : input.customerId || "",
      serviceId: input.serviceId,
      service: service.data().name,
      providerId: input.providerId,
      provider: input.providerId ? provider.name : "To be assigned at shop",
      ...(!input.providerId ? { providerPreference: "any", reservedProviderId: heldProviderId } : {}),
      date: input.date,
      time: input.time,
      startMinute: Number(slotKeys[0]),
      durationMinutes,
      amount,
      startsAt: Timestamp.fromDate(
        new Date(`${input.date}T${input.time}:00+08:00`),
      ),
      scheduleId,
      slotKeys,
      notes: input.notes.trim(),
      status: "Pending",
      paymentStatus: "Unpaid",
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    })
    transaction.set(schedule, {
      slots,
      appointmentId: appointment.id,
      updatedAt: serverTimestamp(),
    })
```

**Implementation note:** The two firebase.ts blocks are separate excerpts from inside createAppointment, not a standalone function. Profile/membership checks, provider candidate reads, reservationProvider selection, and notification creation remain in the complete function. Service, price, and calendar writes are also validated by deployed Firestore rules.

## 4. Booking Acceptance, Rejection, and Provider Assignment

Updates authorized booking states and customer notifications. Provider assignment for an accepted any-provider booking is a separate transaction that checks and transfers calendar reservations.

**Source:** `src/domain.ts`, lines 13–20.

```typescript
export function canChangeAppointment(role: string, current: unknown, next: string, assigned: boolean, owner: boolean): boolean {
  const before = appointmentStatus(current)
  if (next === "Cancelled") return (["Administrator", "Manager"].includes(role) && ["Pending", "Accepted", "In Progress"].includes(before)) || (role === "Customer" && owner && ["Pending", "Accepted"].includes(before))
  if (["Administrator", "Manager"].includes(role) && before === "Pending") return ["Accepted", "Rejected"].includes(next)
  if (["Administrator", "Manager"].includes(role) || (role === "Service Provider" && assigned))
    return (before === "Accepted" && next === "In Progress") || (before === "In Progress" && next === "Completed")
  return false
}
```

**Source:** `src/firebase.ts`, lines 1330–1381.

```typescript
export async function updateAppointmentStatus(id: string, status: string, reason = "") {
  const shopId = businessId()
  const appointment = shopDoc(shopId, "appointments", id)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(appointment)
    if (!snapshot.exists()) throw new Error("Appointment not found.")
    const data = snapshot.data()
    const user = currentUser()
    const profile = await transaction.get(doc(db, "users", user.uid))
    const provider = await transaction.get(shopDoc(shopId, "team", user.uid))
    if (status === "In Progress" && !data.providerId)
      throw new Error("Assign a service provider before starting the service.")
    if (!canChangeAppointment(profile.data()?.role || "", data.status, status, data.providerId === user.uid && provider.data()?.active === true && provider.data()?.role === "Service Provider", data.customerId === user.uid))
      throw new Error("Your role cannot perform this action at the current appointment stage.")
    if (reason.length > 1000) throw new Error("Keep the rejection reason under 1,000 characters.")
    const schedule = data.scheduleId
      ? shopDoc(shopId, "appointmentSchedules", data.scheduleId)
      : null
    const calendar =
      ["Cancelled", "Rejected"].includes(status) && schedule
        ? await transaction.get(schedule)
        : null
    if (calendar?.exists() && schedule) {
      const slots = { ...calendar.data().slots }
      ;(data.slotKeys as string[]).forEach((key) => {
        if (slots[key] === id) delete slots[key]
      })
      transaction.set(schedule, {
        slots,
        appointmentId: id,
        updatedAt: serverTimestamp(),
      })
    }
    const changes: Record<string, unknown> = { status, updatedAt: serverTimestamp() }
    if (status === "Accepted") changes.acceptedAt = serverTimestamp()
    if (status === "Rejected") { changes.rejectedAt = serverTimestamp(); changes.rejectionReason = reason.trim() }
    if (status === "In Progress") changes.startedAt = serverTimestamp()
    if (status === "Completed") changes.completedAt = serverTimestamp()
    transaction.update(appointment, changes)
    if (data.customerId) {
      const updates: Record<string, [string, string]> = {
        Accepted: ["Appointment Accepted", "Your appointment has been accepted by the manager."],
        Rejected: ["Appointment Rejected", "Unfortunately, your appointment request has been rejected."],
        "In Progress": ["Service Started", "Your service has started."],
        Completed: ["Service Completed", "Your service has been completed. Please rate your experience."],
        Cancelled: ["Appointment Cancelled", "Your appointment has been cancelled."],
      }
      const [title, message] = updates[status]
      transaction.set(doc(shopCollection(shopId, "notifications")), { userId: data.customerId, title, message, appointmentId: id, read: false, createdAt: serverTimestamp() })
    }
  })
}
```

**Source:** `src/firebase.ts`, lines 1250–1291.

```typescript
export async function assignAppointmentProvider(id: string, targetId: string) {
  const shopId = businessId()
  const uid = currentUser().uid
  const appointment = shopDoc(shopId, "appointments", id)
  await runTransaction(db, async (transaction) => {
    const [snapshot, actor, target, actorTeam] = await Promise.all([
      transaction.get(appointment),
      transaction.get(doc(db, "users", uid)),
      transaction.get(shopDoc(shopId, "team", targetId)),
      transaction.get(shopDoc(shopId, "team", uid)),
    ])
    const data = snapshot.data()
    if (!data || !canAssignBooking(actor.data()?.role || "", uid, data, targetId,
      actorTeam.data()?.active === true && actorTeam.data()?.role === "Service Provider"))
      throw new Error("This booking is no longer unassigned, or you cannot assign it.")
    if (target.data()?.active !== true || target.data()?.role !== "Service Provider")
      throw new Error("Choose an active service provider.")
    const oldSchedule = shopDoc(shopId, "appointmentSchedules", data.scheduleId)
    const scheduleId = `${targetId}_${data.date}`
    const newSchedule = shopDoc(shopId, "appointmentSchedules", scheduleId)
    const [oldCalendar, newCalendar] = await Promise.all([
      transaction.get(oldSchedule), transaction.get(newSchedule),
    ])
    const keys = data.slotKeys as string[]
    const oldSlots: Record<string, string> = { ...(oldCalendar.data()?.slots || {}) }
    const slots: Record<string, string> = { ...(newCalendar.data()?.slots || {}) }
    if (!keys?.length || keys.some((key) => oldSlots[key] !== id))
      throw new Error("The booking's capacity reservation needs manager review.")
    if (keys.some((key) => slots[key] && slots[key] !== id))
      throw new Error("That provider is booked at this time. Choose another available provider.")
    keys.forEach((key) => { slots[key] = id })
    if (data.scheduleId !== scheduleId) {
      keys.forEach((key) => { delete oldSlots[key] })
      transaction.set(oldSchedule, { slots: oldSlots, appointmentId: id, updatedAt: serverTimestamp() })
    }
    transaction.set(newSchedule, { slots, appointmentId: id, updatedAt: serverTimestamp() })
    transaction.update(appointment, {
      providerId: targetId, provider: target.data()!.name, reservedProviderId: targetId,
      scheduleId, assignedBy: uid, assignedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  })
}
```

**Implementation note:** Acceptance and provider assignment are separate operations. Authorized providers may also claim eligible unassigned bookings. This excerpt documents implemented behavior; it does not claim that an arbitrary role can update every booking.

## 5. Walk-In Checkout

Prepares a validated multi-service quote, then atomically writes one completed walk-in and matching payment/sales mirrors. Stable form IDs prevent duplicate payment creation on retries.

**Source:** `src/firebase.ts`, lines 1748–1843.

```typescript
export async function createPaidWalkIn(id: string, rawInput: {
  client: string; email: string; phone: string; serviceIds: string[]
  requestedProviderId: string; method: string; quotedTotal: number
}) {
  const input = normalizeWalkInInput(rawInput)
  const shopId = businessId()
  const user = currentUser()
  const visitRef = shopDoc(shopId, "walkins", id)
  // A lost payment acknowledgement must not prepare a new quote or charge twice.
  const saved = await runTransaction(db, async (transaction) => {
    const [actor, existing] = await Promise.all([
      transaction.get(doc(db, "users", user.uid)), transaction.get(visitRef),
    ])
    if (!["Administrator", "Manager"].includes(actor.data()?.role))
      throw new Error("Only shop management can record a walk-in payment.")
    if (!existing.exists()) return null
    if (existing.data().createdBy !== user.uid)
      throw new Error("This walk-in belongs to another account.")
    return existing.data()
  })
  if (saved) return saved
  const quotes: ReturnType<typeof shopDoc>[] = []
  try {
    const quoteRef = await createWalkInQuote(shopId, id, input.serviceIds, user.uid, quotes)
    if (businessId() !== shopId || currentUser().uid !== user.uid)
      throw new Error("The selected shop or account changed. Reopen the walk-in form.")
    return await runTransaction(db, async (transaction) => {
      const [existing, actor, shop, quote, ...menu] = await Promise.all([
        transaction.get(visitRef),
        transaction.get(doc(db, "users", user.uid)),
        transaction.get(doc(db, "shops", shopId)),
        transaction.get(quoteRef),
        ...input.serviceIds.map((serviceId: string) =>
          transaction.get(shopDoc(shopId, "services", serviceId))),
      ])
      if (!["Administrator", "Manager"].includes(actor.data()?.role))
        throw new Error("Only shop management can record a walk-in payment.")
      if (existing.exists()) {
        if (existing.data().createdBy !== user.uid)
          throw new Error("This walk-in belongs to another account.")
        return existing.data() // Stable form ID makes a retry safe after a lost acknowledgement.
      }
      if (!shop.exists() || !shop.data().active)
        throw new Error("This shop is not accepting new services.")
      if (menu.some((item) => !item.exists() || item.data().status !== "Active" ||
        !Number.isFinite(item.data().amount) || item.data().amount < 0))
        throw new Error("One of these services is no longer available. Review the selection.")
      const settings = await transaction.get(shopDoc(shopId, "settings", "business"))
      if (settings.data()?.shopType === "solo" &&
        input.requestedProviderId !== settings.data()?.managerProviderId)
        throw new Error("Solo shop walk-ins must use the manager's barber profile.")
      const provider = input.requestedProviderId
        ? await transaction.get(shopDoc(shopId, "team", input.requestedProviderId)) : null
      if (provider && (!provider.exists() || !provider.data().active ||
        provider.data().role !== "Service Provider"))
        throw new Error("Choose an active provider or Any available.")
      const serviceNames = menu.map((item) => String(item.data()!.name))
      const serviceAmounts = menu.map((item) => Number(item.data()!.amount))
      const amountCents = serviceAmounts.reduce((sum, value) => sum + Math.round(value * 100), 0)
      const amount = amountCents / 100
      const quoted = quote.data()
      if (!quoted || quoted.amountCents !== amountCents ||
        JSON.stringify([quoted.serviceIds, quoted.serviceNames, quoted.serviceAmounts]) !==
          JSON.stringify([input.serviceIds, serviceNames, serviceAmounts]))
        throw new Error("The service selection or prices changed. Review the total and try again.")
      if (Math.round(amount * 100) !== Math.round(input.quotedTotal * 100))
        throw new Error("The service prices changed. Review the new total before recording payment.")
      const financial = {
        type: "Walk-in", walkInId: id,
        client: input.client, customerId: "",
        service: serviceNames.join(" + "), serviceIds: input.serviceIds,
        providerId: input.requestedProviderId,
        provider: provider ? String(provider.data()!.name) : "Any available",
        amount, amountCents, method: input.method, status: "Paid",
        currency: "PHP", date: manilaDate(),
        createdBy: user.uid, createdAt: serverTimestamp(),
      }
      transaction.set(visitRef, {
        ...financial, status: "Paid", completedAt: serverTimestamp(),
        quoteId: quoteRef.id,
        email: input.email, phone: input.phone,
        serviceNames, serviceAmounts,
        requestedProviderId: input.requestedProviderId,
        acceptedBy: "", acceptedByName: "",
        paymentStatus: "Paid", paidAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      transaction.set(shopDoc(shopId, "payments", id), financial)
      transaction.set(shopDoc(shopId, "sales", id), financial)
      return financial
    })
  } finally {
    // Staging quotes are not business records. Cleanup failure must never turn
    // an acknowledged payment into an apparent failure and encourage a retry.
    void Promise.allSettled(quotes.map((reference) => deleteDoc(reference)))
  }
}
```

**Implementation note:** createWalkInQuote, normalizeWalkInInput, shopDoc, businessId, currentUser, and Firebase SDK imports are dependencies in the project. Quote preparation precedes the final three-document transaction. Only the visit/payment/sale commit constitutes the paid transaction; staging-quote cleanup is best-effort. New quote rules and app code must both be deployed.

## 6. Percentage-Based Payroll Calculation and Statement Recording

Calculates percentage-based pay in centavos and records a payroll statement while rejecting overlapping pay periods.

**Source:** `src/finance.ts`, lines 71–75.

```typescript
export function percentagePay(earnings: number, percentage: string): number | undefined {
  const rate = Number(percentage)
  if (!percentage.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) return undefined
  return Math.round(Math.round(earnings * 100) * rate / 100) / 100
}
```

**Source:** `src/app/App.tsx`, lines 6084–6085.

```tsx
                  const cents = Math.round(pay * 100)
                  await createPayrollStatement({ providerId: provider.id, provider: String(eligible.name), start: date, end: date, base: pay, net: pay, baseCents: cents, netCents: cents, status: "Recorded" })
```

**Source:** `src/firebase.ts`, lines 1620–1650.

```typescript
export async function createPayrollStatement(data: DocumentData) {
  const shopId = businessId()
  const statement = doc(shopCollection(shopId, "payroll"))
  const periodsRef = shopDoc(shopId, "payrollPeriods", data.providerId)
  const uid = currentUser().uid
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(periodsRef)
    const periods = snapshot.data()?.periods || {}
    if (
      Object.values(periods).some((value) => {
        const period = value as Record<"start" | "end", string>
        return period.start <= data.end && period.end >= data.start
      })
    )
      throw new Error(
        "An overlapping payroll statement was already recorded for this provider.",
      )
    transaction.set(statement, {
      ...data,
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
    transaction.set(periodsRef, {
      periods: {
        ...periods,
        [statement.id]: { start: data.start, end: data.end },
      },
      updatedAt: serverTimestamp(),
    })
  })
}
```

**Implementation note:** The short App.tsx block is a handler excerpt using pay calculated by the existing PayrollCalculator. This is a management-operated percentage calculator and statement workflow, not evidence of an automatic per-sale commission engine running at checkout. Recording does not transfer funds.

## 7. PDF Report Export

Loads pdfmake, creates a PDF from the project's report definition, and starts a browser download. Sales & Payments supplies its filtered rows and summary values to this exporter.

**Source:** `src/pdf-export.mjs`, lines 3–17.

```javascript
async function pdfEngine() {
  if (!enginePromise) {
    enginePromise = Promise.all([
      import("pdfmake/build/pdfmake.js"),
      import("pdfmake/build/vfs_fonts.js"),
    ]).then(([engine, fonts]) => {
      engine.default.addVirtualFileSystem(fonts.default)
      return engine.default
    }).catch((error) => {
      enginePromise = undefined
      throw error
    })
  }
  return enginePromise
}
```

**Source:** `src/pdf-export.mjs`, lines 76–81.

```javascript
export async function createExportPdf(name, columns, rows, details = []) {
  // Capture the click-time values before the lazily loaded engine resolves.
  const definition = exportDefinition(name, [...columns], rows.map((row) => [...row]), new Date(), details.map((row) => [...row]))
  const engine = await pdfEngine()
  return engine.createPdf(definition)
}
```

**Source:** `src/pdf-export.mjs`, lines 83–97.

```javascript
export async function downloadPdf(name, columns, rows, details = []) {
  const pdf = await createExportPdf(name, columns, rows, details)
  const blob = await new Promise((resolve) => pdf.getBlob(resolve))
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = url
    link.download = exportFilename(name)
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}
```

**Implementation note:** enginePromise, exportDefinition, and exportFilename are defined in the same module. exportDefinition supplies A4 layout, headings, table rows, summary information, and Asia/Manila generation time. This is PDF export, not Excel export.

## 8. Per-Shop SMS Booking Alert

Builds a fixed booking-notice payload, claims a deterministic delivery record, and sends the message through PhilSMS from a scheduled Cloudflare Worker.

**Source:** `cloudflare/smartcut-sms/worker.js`, lines 205–212.

```javascript
export function bookingEligible(booking) {
  const customer = field(booking, "customerId")
  return (
    customer !== "" &&
    customer === field(booking, "createdBy") &&
    !["Cancelled", "Rejected"].includes(field(booking, "status"))
  )
}
```

**Source:** `cloudflare/smartcut-sms/worker.js`, lines 222–227.

```javascript
export function bookingMessage(booking, appointmentId) {
  // Keep provider-facing content fixed. Free-form shop/customer text can trigger
  // carrier spam filters and is not needed to identify the appointment.
  // Keep URLs out too: carrier link filtering can vary by recipient network.
  return `SmartCut appointment notice. Date: ${field(booking, "date")}. Time: ${formatSmsTime(field(booking, "time"))} Manila. Reference: ${appointmentId.slice(-6)}.`
}
```

**Source:** `cloudflare/smartcut-sms/worker.js`, lines 229–240.

```javascript
export function smsPayload(recipient, sender, booking, appointmentId) {
  const number = normalizeSmsNumber(recipient)
  if (!number) fail("INVALID_SMS_RECIPIENT")
  if (typeof sender !== "string" || !sender.trim() || sender.trim().length > 11)
    fail("INVALID_SENDER_ID")
  return {
    recipient: number,
    sender_id: sender.trim(),
    type: "plain",
    message: bookingMessage(booking, appointmentId),
  }
}
```

**Source:** `cloudflare/smartcut-sms/worker.js`, lines 367–387.

```javascript
      stage = "DELIVERY_CLAIM"
      const claim = await request(
        `${SHOP}/smsDeliveries?documentId=${encodeURIComponent(id)}`,
        {
          method: "POST",
          body: JSON.stringify({
            fields: {
              appointmentId: str(id),
              status: str("sending"),
              createdAt: now(),
              shopId: str(shopId),
              recipient: str(recipient),
              settingsUpdatedAt: confirmedSettings?.updateTime
                ? { timestampValue: confirmedSettings.updateTime }
                : now(),
            },
          }),
        },
      )
      if (claim.status === 409) continue
      if (!claim.ok) fail(`DELIVERY_CLAIM_${claim.status}`)
```

**Source:** `cloudflare/smartcut-sms/worker.js`, lines 398–413.

```javascript
        const response = await fetchJson(fetchImpl, ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
        providerHttpStatus = response.status
        providerResponseType = response.responseType
        diagnostic = `PHILSMS_HTTP_${response.status}`
        accepted =
          response.ok &&
          response.validJson &&
          response.data?.status === "success"
```

**Source:** `cloudflare/smartcut-sms/worker.js`, lines 564–566.

```javascript
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scanBookings(env))
  },
```

**Implementation note:** The final three blocks are excerpts inside scanBookings and the Worker export. The full Worker derives SHOP from the appointment document path, reads and rechecks that shop's private SMS settings, checks membership/activation time, and tracks delivery results. It alerts the shop's configured number, not every customer's phone. config.token and service-account material come from Worker secrets and are not embedded here. Gateway acceptance is not proof of handset delivery.

## 9. reCAPTCHA Enterprise Verification

The Cloud Function checks the origin and site-key pairing, requests an Enterprise assessment, validates token properties, and rejects a reused token using its SHA-256 hash.

**Source:** `functions/index.js`, lines 20–86.

```javascript
export const verifyCaptcha = onRequest({ region, cors: true, invoker: "public" }, async (request, response) => {
  const fail = (status, reason) => {
    logError("CAPTCHA verification rejected", { status, reason })
    return response.status(status).json({ success: false, reason })
  }
  response.set("Cache-Control", "no-store")
  response.type("application/json")
  const development = process.env.CAPTCHA_DEBUG === "true"
  if (development) logInfo("CAPTCHA request", {
    method: request.method, path: request.path,
    tokenExists: typeof request.body?.token === "string" && !!request.body.token,
  })
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED: use POST")
  let origin
  try {
    origin = new URL(request.get("origin"))
  } catch {
    return fail(400, "DOMAIN_MISMATCH: request Origin is missing or invalid")
  }
  const hostname = origin.hostname.toLowerCase()
  const production = productionHosts.includes(hostname)
  const developmentHosts = ["localhost", "127.0.0.1", ...(process.env.CAPTCHA_DEV_HOSTNAMES || "").split(",").map(host => host.trim().toLowerCase()).filter(Boolean)]
  if ((!production && !developmentHosts.includes(hostname)) ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(hostname)))) {
    return fail(400, `DOMAIN_MISMATCH: ${hostname} is not in CAPTCHA_DEV_HOSTNAMES or the production allowlist`)
  }
  const token = request.body?.token
  if (typeof token !== "string" || !token.trim()) return fail(400, "MISSING: complete the CAPTCHA")
  if (token.length > 8192) return fail(400, "INVALID_TOKEN: token is too long")
  const siteKey = production ? productionKey : developmentKey
  if (request.body?.siteKey !== siteKey) return fail(400, "KEY_MISMATCH: site key does not match request hostname")
  try {
    const credential = await captchaCredential.getAccessToken()
    const result = await fetch("https://recaptchaenterprise.googleapis.com/v1/projects/smartcutpre/assessments", {
      method: "POST",
      headers: { Authorization: `Bearer ${credential.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ event: { token, siteKey } }),
      signal: AbortSignal.timeout(10000),
    })
    const assessment = await result.json()
    if (development) logInfo("CAPTCHA Google response (safe fields only)", {
      status: result.status,
      tokenProperties: assessment.tokenProperties,
      errorStatus: assessment.error?.status,
      // Do not log the full assessment: event contains the token.
    })
    if (!result.ok) {
      const detail = assessment.error
      logError("CAPTCHA Google API error", { status: result.status, errorMessage: detail?.message })
      return fail(500, "CAPTCHA verification service error")
    }
    const reason = validateCaptchaProperties(assessment.tokenProperties, hostname)
    if (reason) return fail(400, reason)
    const hash = createHash("sha256").update(token).digest("hex")
    try {
      await db.doc(`loginCaptchaTokens/${hash}`).create({ expiresAt: Timestamp.fromMillis(Date.now() + 300000) })
    } catch (error) {
      if (error.code === 6 || error.code === "already-exists") return fail(400, "DUPE: CAPTCHA already used")
      throw error
    }
    return response.json({ success: true })
  } catch (error) {
    // Never log request bodies, tokens, credentials, or authorization headers.
    logError("CAPTCHA verification service error", { errorMessage: error.message, code: error.code })
    return fail(500, "CAPTCHA verification service error")
  }
})
```

**Source:** `functions/captcha.js`, lines 5–18.

```javascript
export function validateCaptchaProperties(properties, hostname, now = Date.now()) {
  if (properties?.valid !== true) {
    return properties?.invalidReason || "INVALID_TOKEN"
  }
  if (properties.hostname?.toLowerCase() !== hostname) return "DOMAIN_MISMATCH"
  const createdAt = Date.parse(properties.createTime)
  if (!Number.isFinite(createdAt)) return "MISSING_CREATE_TIME"
  if (now - createdAt > 120000 || createdAt - now > 5000) return "EXPIRED"
  // Checkbox tokens have no expected action. If an action is configured explicitly,
  // validate it without adding expectedAction to the checkbox assessment request.
  if (process.env.CAPTCHA_EXPECTED_ACTION &&
      properties.action !== process.env.CAPTCHA_EXPECTED_ACTION) return "ACTION_MISMATCH"
  return null
}
```

**Implementation note:** Imports, application-default credentials, site-key constants, hostname allowlists, db, and region are defined in the project and are not repeated. No private credential values are included. This is the server verification endpoint, not proof that a deployment is currently configured or that frontend checks replace database access rules.

## 10. Subscription Access Check

Resolves the paid or trial deadline and denies ordinary workspace access when the record is missing, manually locked, unapproved, or expired.

**Source:** `src/subscription-access.mjs`, lines 7–15.

```javascript
export function billingDeadline(record) {
  for (const value of [record?.expiresAt, record?.currentPeriodEnd]) {
    const date = value?.toDate?.()
    if (date instanceof Date && Number.isFinite(date.getTime())) return date
  }
  const trial = record?.trialStartedAt?.toDate?.()
  return trial instanceof Date && Number.isFinite(trial.getTime())
    ? new Date(trial.getTime() + 7 * 86400000) : undefined
}
```

**Source:** `src/subscription-access.mjs`, lines 17–24.

```javascript
export function workspaceAccess(record, now = Date.now()) {
  const deadline = billingDeadline(record)
  if (!record) return { allowed: false, reason: "A subscription must be activated before using this workspace." }
  if (record.manualLocked === true) return { allowed: false, reason: String(record.reason || "This workspace was locked by an Administrator. Contact management to resolve the requirements.") }
  if (!["Active", "Trial"].includes(record.status)) return { allowed: false, reason: String(record.reason || "This workspace requires Administrator approval before access can resume.") }
  if (!deadline || deadline.getTime() <= now) return { allowed: false, reason: "The subscription has expired. Submit renewal proof and wait for Administrator approval." }
  return { allowed: true, reason: "", deadline }
}
```

**Implementation note:** The UI applies this helper within ShopContextGate, with special handling for customer history, manager billing access, and global Administrator override. Firestore rules separately enforce license and role permissions. An uploaded payment receipt alone does not activate a subscription.

## Verification boundary

This appendix reproduces source code; it is not a deployment or security certification. The multi-service walk-in emulator cases passed during the related fix. A separate pre-existing rejection/cancellation expression-budget failure was reproduced with both baseline and updated rules; do not describe the full emulator suite as passing.
