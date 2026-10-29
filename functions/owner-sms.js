// Server-only helpers. Never import this module into the browser.
export function normalizePhone(value) {
  const phone = String(value || "").replace(/[\s+-]/g, "")
  if (/^09\d{9}$/.test(phone)) return `63${phone.slice(1)}`
  if (/^639\d{9}$/.test(phone)) return phone
  throw new Error("The shop SMS number must be a Philippine mobile number")
}

export function isCustomerBooking(data) {
  return typeof data?.customerId === "string" &&
    data.customerId.length > 0 && data.createdBy === data.customerId
}

export function bookingMessage(data) {
  // Bookings already store a canonical Manila date and time.
  return `SmartCut: New customer booking on ${data.date} at ${data.time} (Asia/Manila). Open SmartCut to review the appointment.`
}

export function validateSmsConfig(config) {
  const endpoint = new URL(config.endpoint)
  if (endpoint.protocol !== "https:" ||
      !["philsms.com", "app.philsms.com", "dashboard.philsms.com"].includes(endpoint.hostname) ||
      endpoint.pathname === "/" || endpoint.username || endpoint.password) {
    throw new Error("Configure the HTTPS SMS-send API endpoint from PhilSMS documentation")
  }
  normalizePhone(config.phone)
  return endpoint.toString()
}

export async function sendOwnerSms(config, booking, fetchImpl = fetch) {
  const endpoint = validateSmsConfig(config)
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: normalizePhone(config.phone),
      sender_id: config.senderId,
      type: "plain",
      message: bookingMessage(booking),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  })
  // HTTP success alone is not proof the provider accepted the message.
  const result = await response.json()
  if (!response.ok || result?.status !== "success") {
    throw new Error("PhilSMS did not confirm acceptance; check the provider dashboard")
  }
}
