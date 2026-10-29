// Paste this complete file into Cloudflare's worker.js editor.
// No npm dependencies, frontend imports, or embedded credentials.
const PROJECT = "smartcutpre"
const ENDPOINT = "https://dashboard.philsms.com/api/v3/sms/send"
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const STATE = "smsWorkerState/shopBookings"
const VERSION = "shop-routing-v13"
// At most 44 outbound requests per run, including OAuth and checkpoint writes.
const BATCH_SIZE = 5
const encoder = new TextEncoder()
const field = (document, key) => {
  const value = document?.fields?.[key]?.stringValue
  return typeof value === "string" ? value : ""
}
const str = (value) => ({ stringValue: value })
const now = () => ({ timestampValue: new Date().toISOString() })

function fail(code) {
  throw new Error(code)
}

export function normalizeSmsNumber(value) {
  if (typeof value !== "string") return null
  const phone = value.trim().replace(/[\s()-]/g, "")
  if (!phone) return ""
  if (/^09\d{9}$/.test(phone)) return `63${phone.slice(1)}`
  if (/^\+?639\d{9}$/.test(phone)) return phone.replace(/^\+/, "")
  return null
}

// Persist only the selected error message in the private ledger, never the body.
// Strip known credentials and personal identifiers before bounding its length.
export function redactProviderMessage(value, privateValues = []) {
  if (typeof value !== "string") return ""
  let message = value
  for (const secret of privateValues) {
    if (typeof secret === "string" && secret.length >= 3)
      message = message.split(secret).join("[redacted]")
  }
  return message
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?63|0)9\d{9}\b/g, "[redacted-phone]")
    .replace(/[A-Za-z0-9|_-]{24,}/g, "[redacted-id]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 240)
}

export function safeProviderField(value, pattern, maxLength) {
  return typeof value === "string" &&
    value.length <= maxLength &&
    pattern.test(value)
    ? value
    : ""
}

// Timeout includes reading the body. Never follow redirects with credentials.
export async function fetchJson(
  fetchImpl,
  url,
  options = {},
  timeoutMs = 15000,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      ...options,
      redirect: "manual",
      signal: controller.signal,
    })
    const text = await response.text()
    let data = null
    let validJson = false
    if (text) {
      try {
        data = JSON.parse(text)
        validJson = true
      } catch {
        // Raw upstream bodies can contain private data. Never store or log them.
      }
    }
    const contentType = response.headers.get("content-type") || ""
    const responseType = validJson
      ? "json"
      : !text
        ? "empty"
        : /text\/html/i.test(contentType) ||
            /^\s*<!doctype html|^\s*<html/i.test(text)
          ? "html"
          : "other"
    return {
      ok: response.ok,
      status: response.status,
      data,
      validJson,
      responseType,
    }
  } catch {
    fail(
      controller.signal.aborted ? "REQUEST_TIMEOUT" : "REQUEST_NETWORK_FAILURE",
    )
  } finally {
    clearTimeout(timer)
  }
}

export function configuration(env) {
  let account
  try {
    account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)
  } catch {
    fail("INVALID_SERVICE_ACCOUNT_JSON")
  }
  if (
    !account ||
    account.project_id !== PROJECT ||
    typeof account.client_email !== "string" ||
    !account.client_email ||
    typeof account.private_key !== "string" ||
    !account.private_key
  )
    fail("INVALID_SERVICE_ACCOUNT")
  const token =
    typeof env.PHILSMS_API_TOKEN === "string"
      ? env.PHILSMS_API_TOKEN.trim()
      : ""
  const sender =
    typeof env.PHILSMS_SENDER_ID === "string"
      ? env.PHILSMS_SENDER_ID.trim()
      : ""
  if (!token) fail("MISSING_PHILSMS_TOKEN")
  if (!sender || sender.length > 11) fail("INVALID_SENDER_ID")
  // Require an explicit timezone; do not accept ambiguous local dates.
  if (
    typeof env.SMS_START_AT !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(env.SMS_START_AT)
  )
    fail("INVALID_SMS_START_AT")
  const start = new Date(env.SMS_START_AT)
  if (!Number.isFinite(start.getTime())) fail("INVALID_SMS_START_AT")
  return { account, token, sender, start: start.toISOString() }
}

function base64url(bytes) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function googleToken(account, fetchImpl) {
  const encode = (value) => base64url(encoder.encode(JSON.stringify(value)))
  const seconds = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: seconds,
    exp: seconds + 3600,
  })}`
  const pem = account.private_key.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
    "",
  )
  let key
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      Uint8Array.from(atob(pem), (character) => character.charCodeAt(0)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    )
  } catch {
    fail("INVALID_PRIVATE_KEY")
  }
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsigned),
  )
  const response = await fetchJson(
    fetchImpl,
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
      }),
    },
  )
  if (!response.ok) fail(`GOOGLE_AUTH_HTTP_${response.status}`)
  if (
    !response.validJson ||
    typeof response.data?.access_token !== "string" ||
    !response.data.access_token
  )
    fail("GOOGLE_AUTH_INVALID_RESPONSE")
  return response.data.access_token
}

export function bookingEligible(booking) {
  const customer = field(booking, "customerId")
  return (
    customer !== "" &&
    customer === field(booking, "createdBy") &&
    !["Cancelled", "Rejected"].includes(field(booking, "status"))
  )
}

export function formatSmsTime(value) {
  const match = typeof value === "string"
    ? value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/) : null
  if (!match) return "Time not recorded"
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`
}

export function bookingMessage(booking, appointmentId) {
  // Keep provider-facing content fixed. Free-form shop/customer text can trigger
  // carrier spam filters and is not needed to identify the appointment.
  // Keep URLs out too: carrier link filtering can vary by recipient network.
  return `SmartCut appointment notice. Date: ${field(booking, "date")}. Time: ${formatSmsTime(field(booking, "time"))} Manila. Reference: ${appointmentId.slice(-6)}.`
}

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

// Injection supports local tests only; deployed handler supplies no overrides.
export async function scanBookings(
  env,
  { fetchImpl = fetch, accessToken } = {},
) {
  let stage = "CONFIGURATION"
  try {
    const config = configuration(env)
    stage = "GOOGLE_AUTH"
    const token = accessToken || (await googleToken(config.account, fetchImpl))
    const request = (path, options = {}) =>
      fetchJson(fetchImpl, `${ROOT}${path.startsWith(":") ? "" : "/"}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
    const get = async (path, optional = false) => {
      const response = await request(path)
      if (optional && response.status === 404) return null
      if (!response.ok) fail(`FIRESTORE_READ_${response.status}`)
      if (
        !response.validJson ||
        !response.data ||
        typeof response.data !== "object" ||
        Array.isArray(response.data)
      )
        fail("FIRESTORE_INVALID_DOCUMENT_RESPONSE")
      return response.data
    }
    stage = "CURSOR_READ"
    const state = await get(STATE, true)
    const query = {
      from: [{ collectionId: "appointments", allDescendants: true }],
      where: {
        fieldFilter: {
          field: { fieldPath: "createdAt" },
          op: "GREATER_THAN_OR_EQUAL",
          value: { timestampValue: config.start },
        },
      },
      orderBy: [
        { field: { fieldPath: "createdAt" }, direction: "ASCENDING" },
        { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
      ],
      limit: BATCH_SIZE,
    }
    if (state && field(state, "activation") === config.start) {
      const date = state.fields?.cursorTime?.timestampValue
      const name = state.fields?.cursorName?.referenceValue
      if (!date || !name) fail("INVALID_SCAN_CURSOR")
      query.startAt = {
        values: [{ timestampValue: date }, { referenceValue: name }],
        before: false,
      }
    }
    stage = "BOOKING_QUERY"
    const queryResponse = await request(":runQuery", {
      method: "POST",
      body: JSON.stringify({ structuredQuery: query }),
    })
    if (!queryResponse.ok) fail(`FIRESTORE_QUERY_${queryResponse.status}`)
    const rows = queryResponse.data
    if (!queryResponse.validJson || !Array.isArray(rows))
      fail("INVALID_QUERY_RESPONSE")
    const bookings = rows
      .filter((row) => row.document)
      .map((row) => row.document)
    for (const booking of bookings) {
      if (!bookingEligible(booking)) continue
      // Never trust a client-supplied shopId or phone in the booking payload.
      const route = booking.name?.match(
        new RegExp(
          `^projects/${PROJECT}/databases/\\(default\\)/documents/shops/([^/]+)/appointments/([^/]+)$`,
        ),
      )
      if (!route) continue
      const [, shopId, id] = route
      const SHOP = `shops/${encodeURIComponent(shopId)}`
      stage = "SHOP_CHECK"
      const shop = await get(SHOP, true)
      if (!shop) continue
      stage = "SMS_SETTINGS_READ"
      const smsSettings = await get(`${SHOP}/settings/sms`, true)
      let recipient = normalizeSmsNumber(field(smsSettings, "number"))
      const enabledAt = Date.parse(
        smsSettings?.fields?.enabledAt?.timestampValue || "",
      )
      const createdAt = Date.parse(
        booking.fields?.createdAt?.timestampValue || "",
      )
      // Blank/invalid numbers disable sending. Do not backfill pre-opt-in bookings.
      if (
        !recipient ||
        !Number.isFinite(enabledAt) ||
        !Number.isFinite(createdAt) ||
        createdAt < enabledAt
      )
        continue
      const deliveryPath = `${SHOP}/smsDeliveries/${encodeURIComponent(id)}`
      // Avoid sending for any booking already claimed by either backend version.
      stage = "DELIVERY_CHECK"
      if (await get(deliveryPath, true)) continue
      stage = "MEMBERSHIP_CHECK"
      const member = await get(
        `${SHOP}/members/${encodeURIComponent(field(booking, "customerId"))}`,
        true,
      )
      if (field(member, "role") !== "Customer") continue
      // Re-read immediately before claiming so an owner edit cannot route a
      // pending appointment to the number that was previously saved.
      stage = "SMS_SETTINGS_CONFIRM"
      const confirmedSettings = await get(`${SHOP}/settings/sms`, true)
      recipient = normalizeSmsNumber(field(confirmedSettings, "number"))
      const confirmedEnabledAt = Date.parse(
        confirmedSettings?.fields?.enabledAt?.timestampValue || "",
      )
      if (
        !recipient ||
        !Number.isFinite(confirmedEnabledAt) ||
        createdAt < confirmedEnabledAt
      )
        continue
      const payload = smsPayload(recipient, config.sender, booking, id)
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
      let accepted = false
      let diagnostic = "PHILSMS_NETWORK_OR_INVALID_RESPONSE"
      let providerHttpStatus = 0
      let providerResponseType = "unavailable"
      let providerErrorMessage = ""
      let providerMessageId = ""
      let providerDeliveryStatus = ""
      let providerSmsType = ""
      stage = "PHILSMS_SEND"
      try {
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
        if (accepted) {
          providerSmsType = safeProviderField(
            response.data?.data?.sms_type,
            /^[A-Za-z][A-Za-z_-]*$/,
            30,
          )
          providerMessageId = safeProviderField(
            response.data?.data?.uid,
            /^[A-Za-z0-9_-]+$/,
            100,
          )
          providerDeliveryStatus = safeProviderField(
            response.data?.data?.status,
            /^[A-Za-z][A-Za-z _-]*$/,
            50,
          )
        }
        if (!accepted && response.validJson) {
          providerErrorMessage = redactProviderMessage(response.data?.message, [
            config.token,
            config.account.private_key,
            config.account.client_email,
            recipient,
            field(booking, "client"),
            field(shop, "managerName"),
          ])
        }
        if (response.ok && !response.validJson)
          diagnostic = "PHILSMS_INVALID_RESPONSE"
        else if (!accepted && response.ok) diagnostic = "PHILSMS_REJECTED"
      } catch (error) {
        diagnostic =
          error?.message === "REQUEST_TIMEOUT"
            ? "PHILSMS_TIMEOUT"
            : "PHILSMS_NETWORK_FAILURE"
        // Ambiguous failures require manual review; no automatic duplicate texts.
      }
      stage = "DELIVERY_UPDATE"
      const updated = await request(
        `${deliveryPath}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=diagnostic&updateMask.fieldPaths=providerHttpStatus&updateMask.fieldPaths=providerResponseType&updateMask.fieldPaths=providerErrorMessage&updateMask.fieldPaths=providerMessageId&updateMask.fieldPaths=providerDeliveryStatus&updateMask.fieldPaths=requestedSmsType&updateMask.fieldPaths=providerSmsType&updateMask.fieldPaths=providerTypeMismatch`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              status: str(accepted ? "accepted" : "needs_review"),
              diagnostic: str(accepted ? "PHILSMS_ACCEPTED" : diagnostic),
              providerHttpStatus: { integerValue: String(providerHttpStatus) },
              providerResponseType: str(providerResponseType),
              providerErrorMessage: str(providerErrorMessage),
              providerMessageId: str(providerMessageId),
              providerDeliveryStatus: str(providerDeliveryStatus),
              requestedSmsType: str(payload.type),
              providerSmsType: str(providerSmsType),
              providerTypeMismatch: {
                booleanValue: !!providerSmsType && providerSmsType.toLowerCase() !== payload.type,
              },
              updatedAt: now(),
            },
          }),
        },
      )
      if (!updated.ok) fail(`DELIVERY_UPDATE_${updated.status}`)
      console.info("Shop SMS processed", {
        shopId,
        appointmentId: id,
        accepted,
        providerHttpStatus,
        providerResponseType,
        diagnostic: accepted ? "PHILSMS_ACCEPTED" : diagnostic,
      })
    }
    if (bookings.length) {
      stage = "CURSOR_SAVE"
      const last = bookings.at(-1)
      // Prevent overlapping cron invocations from moving the cursor backwards.
      const precondition = state
        ? `currentDocument.updateTime=${encodeURIComponent(state.updateTime)}`
        : "currentDocument.exists=false"
      const saved = await request(`${STATE}?${precondition}`, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            activation: str(config.start),
            cursorTime: last.fields.createdAt,
            cursorName: { referenceValue: last.name },
            updatedAt: now(),
          },
        }),
      })
      // Another invocation may have saved first. Replaying is safe via claims.
      if (!saved.ok && ![409, 412].includes(saved.status))
        fail(`CURSOR_UPDATE_${saved.status}`)
    }
    console.info("Shop SMS scan completed", { scanned: bookings.length })
  } catch (error) {
    const details = safeFailureDetails(error)
    console.error("Shop SMS scan failed", { ...details, stage })
    throw new Error(details.code)
  }
}

export function safeFailureDetails(error) {
  const code =
    typeof error?.message === "string" &&
    /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "UNEXPECTED_BACKEND_FAILURE"
  const knownTypes = [
    "Error",
    "TypeError",
    "SyntaxError",
    "RangeError",
    "DOMException",
    "AbortError",
    "TimeoutError",
  ]
  const errorType = knownTypes.includes(error?.name)
    ? error.name
    : "UnknownError"
  // Exclude the stack's message line; report only numeric source coordinates.
  const frame =
    typeof error?.stack === "string"
      ? error.stack
          .split("\n")
          .slice(1)
          .join("\n")
          .match(/:(\d+):(\d+)/)
      : null
  return {
    code,
    errorType,
    location: frame ? `${frame[1]}:${frame[2]}` : "unavailable",
  }
}

export default {
  async fetch(request) {
    if (request.method !== "GET" || new URL(request.url).pathname !== "/")
      return new Response("Not found", { status: 404 })
    return Response.json({
      service: "SmartCut shop SMS",
      version: VERSION,
      mode: "scheduled",
      batchSize: BATCH_SIZE,
      recipientSource: "shops/{shopId}/settings/sms",
      defaultRecipient: null,
      message:
        "Deployment only; check scheduled logs and delivery records for sending status.",
    })
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(scanBookings(env))
  },
}
