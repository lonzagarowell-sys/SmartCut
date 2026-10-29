import test from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync, verify } from "node:crypto"
import worker, {
  configuration,
  scanBookings,
  safeFailureDetails,
  normalizeSmsNumber,
  fetchJson,
  redactProviderMessage,
  bookingMessage,
  formatSmsTime,
  safeProviderField,
  smsPayload,
} from "./worker.js"
import { normalizeSmsNumber as normalizeFrontendNumber } from "../../src/sms-phone.mjs"

const shop = "shops/test-shop-one"
const root =
  "https://firestore.googleapis.com/v1/projects/smartcutpre/databases/(default)/documents"
const str = (value) => ({ stringValue: value })
const env = {
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: "smartcutpre",
    client_email: "test@example.test",
    private_key: "test-only",
  }),
  PHILSMS_API_TOKEN: "test-only",
  PHILSMS_SENDER_ID: "PhilSMS",
  SMS_START_AT: "2026-10-09T12:00:00Z",
}
const document = (id, overrides = {}) => ({
  name: `${root.replace("https://firestore.googleapis.com/v1/", "")}/${shop}/appointments/${id}`,
  fields: {
    customerId: str("customer"),
    createdBy: str("customer"),
    status: str("Pending"),
    date: str("2026-10-10"),
    time: str("14:00"),
    createdAt: { timestampValue: "2026-10-09T12:01:00.123456Z" },
    ...overrides,
  },
})
const response = (body, status = 200) => Response.json(body, { status })

function harness({
  bookings = [document("new-booking")],
  existing = false,
  providerStatus = 200,
  providerData = { uid: "test-message-id", status: "Delivered" },
  state = null,
  shops = {
    [shop]: {
      name: "Test Shop One",
      number: "639181234567",
      enabledAt: env.SMS_START_AT,
    },
  },
} = {}) {
  const calls = []
  const payloads = []
  let payload
  return {
    calls,
    payloads,
    get payload() {
      return payload
    },
    fetchImpl: async (url, options = {}) => {
      const path = String(url).replace(root, "").replace(/^\//, "")
      calls.push({ path, options })
      if (shops[path])
        return response({ fields: { name: str(shops[path].name) } })
      if (path.endsWith("/settings/sms")) {
        const settings = shops[path.replace("/settings/sms", "")]
        return settings
          ? response({
              fields: {
                number: str(settings.number),
                enabledAt: { timestampValue: settings.enabledAt },
              },
            })
          : response({}, 404)
      }
      if (path === "smsWorkerState/shopBookings")
        return state ? response(state) : response({}, 404)
      if (path === ":runQuery")
        return response(bookings.map((document) => ({ document })))
      if (path.endsWith("/members/customer"))
        return response({ fields: { role: str("Customer") } })
      if (path.includes("/smsDeliveries/") && !options.method)
        return response({}, existing ? 200 : 404)
      if (String(url).startsWith("https://dashboard.philsms.com/")) {
        payload = JSON.parse(options.body)
        payloads.push(payload)
        return response(
          {
            status: providerStatus === 200 ? "success" : "error",
            data: providerStatus === 200 ? providerData : undefined,
          },
          providerStatus,
        )
      }
      if (["POST", "PATCH"].includes(options.method)) return response({})
      throw new Error(`Unexpected test path ${path}`)
    },
  }
}

test("health endpoint identifies corrected version; POST cannot send SMS", async () => {
  const health = await (
    await worker.fetch(new Request("https://example.test/"))
  ).json()
  assert.equal(health.version, "shop-routing-v13")
  assert.equal(health.defaultRecipient, null)
  assert.equal(
    (
      await worker.fetch(
        new Request("https://example.test/", { method: "POST" }),
      )
    ).status,
    404,
  )
})
test("validates project, token, sender and explicit activation timezone", () => {
  assert.equal(configuration(env).sender, "PhilSMS")
  assert.throws(() => configuration({ ...env, SMS_START_AT: "2026-10-09" }))
  assert.throws(() => configuration({ ...env, PHILSMS_API_TOKEN: "" }))
  assert.throws(() =>
    configuration({ ...env, FIREBASE_SERVICE_ACCOUNT_JSON: "{}" }),
  )
  assert.throws(
    () => configuration({ ...env, FIREBASE_SERVICE_ACCOUNT_JSON: "null" }),
    /INVALID_SERVICE_ACCOUNT/,
  )
  assert.throws(
    () => configuration({ ...env, PHILSMS_API_TOKEN: 123 }),
    /MISSING_PHILSMS_TOKEN/,
  )
  assert.throws(
    () => configuration({ ...env, PHILSMS_SENDER_ID: {} }),
    /INVALID_SENDER_ID/,
  )
})
test("unexpected errors expose only type and source coordinates, never messages", () => {
  const error = new TypeError("test-secret-must-not-be-logged")
  error.stack =
    "TypeError: test-secret-must-not-be-logged\n at scan (worker.js:123:45)"
  assert.deepEqual(safeFailureDetails(error), {
    code: "UNEXPECTED_BACKEND_FAILURE",
    errorType: "TypeError",
    location: "123:45",
  })
})
test("SMS payload validates a single recipient and always requests plain text", () => {
  const payload = smsPayload("+639171234567", " PhilSMS ", document("example"), "example")
  assert.equal(payload.recipient, "639171234567")
  assert.equal(payload.sender_id, "PhilSMS")
  assert.equal(payload.type, "plain")
  assert.doesNotMatch(payload.message, /https?:\/\//)
  for (const number of ["", "09123", "639171234567,639181234567"])
    assert.throws(() => smsPayload(number, "PhilSMS", document("example"), "example"), /INVALID_SMS_RECIPIENT/)
})

test("provider type mismatch is recorded without retrying an accepted message", async () => {
  const mock = harness({
    providerData: { uid: "example-id", status: "Delivered", sms_type: "voice" },
  })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.equal(mock.payloads.length, 1)
  assert.equal(mock.payload.type, "plain")
  const update = mock.calls.find((call) => call.path.includes("updateMask"))
  const fields = JSON.parse(update.options.body).fields
  assert.equal(fields.status.stringValue, "accepted")
  assert.equal(fields.requestedSmsType.stringValue, "plain")
  assert.equal(fields.providerSmsType.stringValue, "voice")
  assert.equal(fields.providerTypeMismatch.booleanValue, true)
})

test("sends the shop-configured recipient and confirmed PhilSMS payload, then saves cursor", async () => {
  const mock = harness()
  await scanBookings(env, {
    fetchImpl: mock.fetchImpl,
    accessToken: "test-google-token",
  })
  assert.equal(mock.payload.recipient, "639181234567")
  assert.equal(mock.payload.sender_id, "PhilSMS")
  assert.equal(mock.payload.type, "plain")
  assert.equal(
    mock.payload.message,
    "SmartCut appointment notice. Date: 2026-10-10. Time: 2:00 PM Manila. Reference: ooking.",
  )
  const status = mock.calls.find((call) => call.path.includes("updateMask"))
  assert.equal(
    JSON.parse(status.options.body).fields.status.stringValue,
    "accepted",
  )
  const deliveryFields = JSON.parse(status.options.body).fields
  assert.equal(deliveryFields.diagnostic.stringValue, "PHILSMS_ACCEPTED")
  assert.equal(deliveryFields.providerMessageId.stringValue, "test-message-id")
  assert.equal(deliveryFields.providerDeliveryStatus.stringValue, "Delivered")
  const cursor = mock.calls.at(-1)
  assert.match(cursor.path, /currentDocument.exists=false/)
  assert.equal(
    JSON.parse(cursor.options.body).fields.cursorTime.timestampValue,
    "2026-10-09T12:01:00.123456Z",
  )
})
test("continues after persistent cursor rather than getting stuck at 30 bookings", async () => {
  const last = document("booking-30")
  const mock = harness({
    state: {
      updateTime: "2026-10-09T12:02:00Z",
      fields: {
        activation: str(configuration(env).start),
        cursorTime: last.fields.createdAt,
        cursorName: { referenceValue: last.name },
      },
    },
  })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  const query = JSON.parse(
    mock.calls.find((call) => call.path.endsWith(":runQuery")).options.body,
  ).structuredQuery
  assert.equal(query.startAt.values[1].referenceValue, last.name)
  assert.equal(query.startAt.before, false)
  assert.equal(query.from[0].allDescendants, true)
  assert.equal(query.limit, 5)
  assert.match(mock.calls.at(-1).path, /currentDocument.updateTime=/)
})
test("existing claim skips SMS but still advances cursor", async () => {
  const mock = harness({ existing: true })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.equal(mock.payload, undefined)
  assert.match(mock.calls.at(-1).path, /smsWorkerState/)
})
test("manager-created and cancelled bookings never send", async () => {
  const mock = harness({
    bookings: [
      document("staff", { createdBy: str("manager") }),
      document("cancelled", { status: str("Cancelled") }),
    ],
  })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.equal(mock.payload, undefined)
})
test("provider rejection persists safe diagnostic and does not retry", async () => {
  const mock = harness({ providerStatus: 401 })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  const saved = JSON.parse(
    mock.calls.find((call) => call.path.includes("updateMask")).options.body,
  )
  assert.equal(saved.fields.status.stringValue, "needs_review")
  assert.equal(saved.fields.diagnostic.stringValue, "PHILSMS_HTTP_401")
})
test("signs a valid service-account OAuth assertion without real credentials", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  })
  const mock = harness({ bookings: [] })
  const testEnv = {
    ...env,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: "smartcutpre",
      client_email: "test@example.test",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    }),
  }
  let signed = false
  await scanBookings(testEnv, {
    fetchImpl: async (url, options) => {
      if (url === "https://oauth2.googleapis.com/token") {
        const assertion = options.body.get("assertion")
        const [header, payload, signature] = assertion.split(".")
        assert.equal(
          verify(
            "RSA-SHA256",
            Buffer.from(`${header}.${payload}`),
            publicKey,
            Buffer.from(signature, "base64url"),
          ),
          true,
        )
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString())
        assert.equal(claims.aud, "https://oauth2.googleapis.com/token")
        assert.equal(claims.scope, "https://www.googleapis.com/auth/datastore")
        signed = true
        return response({ access_token: "test-only" })
      }
      return mock.fetchImpl(url, options)
    },
  })
  assert.equal(signed, true)
})
test("database failure does not checkpoint past unprocessed bookings", async () => {
  const mock = harness()
  await assert.rejects(
    scanBookings(env, {
      accessToken: "test",
      fetchImpl: (url, options) => {
        if (String(url).includes("/smsDeliveries?documentId="))
          return response({}, 403)
        return mock.fetchImpl(url, options)
      },
    }),
    /DELIVERY_CLAIM_403/,
  )
  assert.equal(
    mock.calls.some((call) => call.path.includes("currentDocument")),
    false,
  )
  assert.equal(mock.payload, undefined)
})
test("bounds a full batch below 50 outbound requests", async () => {
  const mock = harness({
    bookings: Array.from({ length: 5 }, (_, i) => document(`booking-${i}`)),
  })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.equal(mock.calls.length + 1, 44) // Includes one OAuth request.
})

test("frontend and Worker normalize only valid Philippine mobile numbers", () => {
  for (const [value, expected] of [
    ["09181234567", "639181234567"],
    ["+63 918 123 4567", "639181234567"],
    ["639181234567", "639181234567"],
    ["", ""],
    ["   ", ""],
    ["09123", null],
    ["+15551234567", null],
    [null, null],
  ]) {
    assert.equal(normalizeSmsNumber(value), expected)
    assert.equal(normalizeFrontendNumber(value), expected)
  }
})

test("each shop routes only to its own number, ignoring booking recipient and shopId", async () => {
  const second = "shops/second-shop"
  const booking = document("second-booking", {
    name: str("unused"),
    shopId: str("forged-shop"),
    recipient: str("639999999999"),
  })
  booking.name = `${root.replace("https://firestore.googleapis.com/v1/", "")}/${second}/appointments/second-booking`
  const mock = harness({
    bookings: [document("first-booking"), booking],
    shops: {
      [shop]: {
        name: "Test Shop One",
        number: "09181234567",
        enabledAt: env.SMS_START_AT,
      },
      [second]: {
        name: "Another Shop",
        number: "+639171234567",
        enabledAt: env.SMS_START_AT,
      },
    },
  })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.deepEqual(
    mock.payloads.map((payload) => payload.recipient),
    ["639181234567", "639171234567"],
  )
  assert.equal(mock.payloads[1].message.includes("Another Shop"), false)
  const claims = mock.calls.filter((call) =>
    call.path.includes("smsDeliveries?documentId"),
  )
  assert.equal(
    JSON.parse(claims[1].options.body).fields.shopId.stringValue,
    "second-shop",
  )
  assert.equal(
    JSON.parse(claims[1].options.body).fields.recipient.stringValue,
    "639171234567",
  )
})

test("five shops remain isolated when one manager changes their number", async () => {
  const shops = {}
  const bookings = []
  const expected = []
  for (let index = 0; index < 5; index++) {
    const path = `shops/isolation-${index}`
    const number = `63917123456${index}`
    shops[path] = {
      name: `Shop ${index}`,
      number,
      enabledAt: env.SMS_START_AT,
    }
    const booking = document(`booking-${index}`, {
      shopId: str("forged-shop"),
      recipient: str("639999999999"),
    })
    booking.name = `${root.replace("https://firestore.googleapis.com/v1/", "")}/${path}/appointments/booking-${index}`
    bookings.push(booking)
    expected.push(number)
  }
  for (const changed of [false, true]) {
    if (changed) {
      shops["shops/isolation-2"].number = "+639181234567"
      expected[2] = "639181234567"
    }
    const mock = harness({ shops, bookings })
    await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
    assert.deepEqual(mock.payloads.map((payload) => payload.recipient), expected)
    const claims = mock.calls.filter((call) =>
      call.path.includes("smsDeliveries?documentId"),
    )
    assert.equal(claims.length, 5)
    claims.forEach((claim, index) => {
      const fields = JSON.parse(claim.options.body).fields
      assert.equal(fields.shopId.stringValue, `isolation-${index}`)
      assert.equal(fields.recipient.stringValue, expected[index])
    })
  }
})

test("a newly created shop is discovered after the global cursor and uses its own first saved number", async () => {
  const newShop = "shops/admin-created-shop"
  const newBooking = document("new-shop-booking")
  newBooking.name = `${root.replace("https://firestore.googleapis.com/v1/", "")}/${newShop}/appointments/new-shop-booking`
  newBooking.fields.createdAt = {
    timestampValue: "2026-10-09T12:03:00.123456Z",
  }
  const cursor = document("previous-booking")
  const mock = harness({
    bookings: [newBooking],
    state: {
      updateTime: "2026-10-09T12:02:00Z",
      fields: {
        activation: str(configuration(env).start),
        cursorTime: { timestampValue: "2026-10-09T12:02:00.123456Z" },
        cursorName: { referenceValue: cursor.name },
      },
    },
    shops: {
      [newShop]: {
        name: "Administrator Created Shop",
        number: "09191234567",
        enabledAt: "2026-10-09T12:02:30Z",
      },
    },
  })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.equal(mock.payload.recipient, "639191234567")
  const claim = JSON.parse(
    mock.calls.find((call) => call.path.includes("smsDeliveries?documentId"))
      .options.body,
  ).fields
  assert.equal(claim.shopId.stringValue, "admin-created-shop")
  assert.equal(claim.recipient.stringValue, "639191234567")
})

test("SMS time uses 12-hour Manila time with correct AM/PM boundaries", () => {
  for (const [value, expected] of [
    ["00:00", "12:00 AM"], ["00:15", "12:15 AM"],
    ["09:05", "9:05 AM"], ["11:59", "11:59 AM"],
    ["12:00", "12:00 PM"], ["12:30", "12:30 PM"],
    ["14:00", "2:00 PM"], ["16:15", "4:15 PM"],
    ["23:59", "11:59 PM"],
  ]) assert.equal(formatSmsTime(value), expected)
  for (const value of ["", "24:00", "12:60", "not a time", null])
    assert.equal(formatSmsTime(value), "Time not recorded")
})

test("SMS content excludes free-form shop and customer text that can trigger spam filters", () => {
  const message = bookingMessage(
    document("appointment-ABC123", {
      client: str("Free prize account winner"),
      shopName: str("Click this account offer"),
    }),
    "appointment-ABC123",
  )
  assert.equal(
    message,
    "SmartCut appointment notice. Date: 2026-10-10. Time: 2:00 PM Manila. Reference: ABC123.",
  )
  for (const text of ["Free prize", "account", "winner", "Click", "offer"])
    assert.equal(message.includes(text), false)
})

test("a changed shop number becomes the recipient of new sends", async () => {
  const mock = harness({
    shops: {
      [shop]: {
        name: "Renamed shop",
        number: "09181234567",
        enabledAt: env.SMS_START_AT,
      },
    },
  })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.equal(mock.payload.recipient, "639181234567")
})

test("re-reads the same shop settings and routes to the latest saved number", async () => {
  const mock = harness()
  let settingsReads = 0
  await scanBookings(env, {
    accessToken: "test",
    fetchImpl: (url, options) => {
      if (String(url).endsWith(`${shop}/settings/sms`)) {
        settingsReads++
        const number = settingsReads === 1 ? "639181234567" : "639171234567"
        return response({
          updateTime: `2026-10-09T12:00:0${settingsReads}Z`,
          fields: {
            number: str(number),
            enabledAt: { timestampValue: env.SMS_START_AT },
          },
        })
      }
      return mock.fetchImpl(url, options)
    },
  })
  assert.equal(settingsReads, 2)
  assert.equal(mock.payload.recipient, "639171234567")
  const claim = JSON.parse(
    mock.calls.find((call) => call.path.includes("smsDeliveries?documentId"))
      .options.body,
  ).fields
  assert.equal(claim.shopId.stringValue, "test-shop-one")
  assert.equal(claim.recipient.stringValue, "639171234567")
  assert.equal(claim.settingsUpdatedAt.timestampValue, "2026-10-09T12:00:02Z")
})

test("blank, invalid, missing or newly enabled settings never send old bookings", async () => {
  for (const settings of [
    { number: "", enabledAt: env.SMS_START_AT },
    { number: "123", enabledAt: env.SMS_START_AT },
    { number: "09171234567", enabledAt: "2026-10-09T12:02:00Z" },
    { number: "09171234567", enabledAt: "" },
  ]) {
    const mock = harness({ shops: { [shop]: { name: "Shop", ...settings } } })
    await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
    assert.equal(mock.payload, undefined)
  }
  const mock = harness()
  await scanBookings(env, {
    accessToken: "test",
    fetchImpl: (url, options) =>
      String(url).endsWith("/settings/sms")
        ? response({}, 404)
        : mock.fetchImpl(url, options),
  })
  assert.equal(mock.payload, undefined)
})

test("non-shop appointment paths cannot route SMS", async () => {
  const booking = document("outside")
  booking.name = booking.name.replace(
    `${shop}/appointments`,
    "other/outside/appointments",
  )
  const mock = harness({ bookings: [booking] })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.equal(mock.payload, undefined)
})

test("redirects are not followed and failed sends are claimed for manual review", async () => {
  const mock = harness({ providerStatus: 302 })
  await scanBookings(env, { fetchImpl: mock.fetchImpl, accessToken: "test" })
  assert.ok(mock.calls.every((call) => call.options.redirect === "manual"))
  const saved = JSON.parse(
    mock.calls.find((call) => call.path.includes("updateMask")).options.body,
  )
  assert.equal(saved.fields.status.stringValue, "needs_review")
  assert.equal(saved.fields.diagnostic.stringValue, "PHILSMS_HTTP_302")
})

test("404 responses retain their HTTP code and classify HTML versus JSON without exposing bodies", async () => {
  for (const [body, contentType, expected] of [
    [
      "<!doctype html><html>private-upstream-message</html>",
      "text/html",
      "html",
    ],
    [
      JSON.stringify({
        status: "error",
        message: "Sender ID not found",
        debug: "private-upstream-message",
      }),
      "application/json",
      "json",
    ],
  ]) {
    const mock = harness()
    await scanBookings(env, {
      accessToken: "test",
      fetchImpl: (url, options) =>
        String(url).startsWith("https://dashboard.philsms.com/")
          ? new Response(body, {
              status: 404,
              headers: { "content-type": contentType },
            })
          : mock.fetchImpl(url, options),
    })
    const update = mock.calls.find((call) => call.path.includes("updateMask"))
    const fields = JSON.parse(update.options.body).fields
    assert.equal(fields.status.stringValue, "needs_review")
    assert.equal(fields.diagnostic.stringValue, "PHILSMS_HTTP_404")
    assert.equal(fields.providerHttpStatus.integerValue, "404")
    assert.equal(fields.providerResponseType.stringValue, expected)
    assert.equal(
      fields.providerErrorMessage.stringValue,
      expected === "json" ? "Sender ID not found" : "",
    )
    assert.equal(
      update.options.body.includes("private-upstream-message"),
      false,
    )
    assert.equal(
      mock.calls.filter((call) =>
        call.path.includes("smsDeliveries?documentId"),
      ).length,
      1,
    )
  }
})

test("provider messages redact credentials and identifiers and remain bounded", () => {
  const message = redactProviderMessage(
    "Missing account test-only-token; recipient +639181234567; contact manager@example.test; Bearer hidden-secret\n" +
      "x".repeat(300),
    ["test-only-token"],
  )
  for (const secret of [
    "test-only-token",
    "639181234567",
    "manager@example.test",
    "hidden-secret",
  ])
    assert.equal(message.includes(secret), false)
  assert.ok(message.length <= 240)
  assert.equal(message.includes("\n"), false)
  assert.equal(redactProviderMessage(null), "")
  assert.equal(
    redactProviderMessage({ message: "do not stringify objects" }),
    "",
  )
})

test("provider delivery identifiers and statuses are stored only when safely bounded", () => {
  assert.equal(
    safeProviderField("6aca448f2f3df", /^[A-Za-z0-9_-]+$/, 100),
    "6aca448f2f3df",
  )
  assert.equal(
    safeProviderField("Delivered", /^[A-Za-z][A-Za-z _-]*$/, 50),
    "Delivered",
  )
  assert.equal(safeProviderField("bad/status", /^[A-Za-z0-9_-]+$/, 100), "")
  assert.equal(safeProviderField("x".repeat(101), /^[A-Za-z0-9_-]+$/, 100), "")
})

test("HTTP 200 with invalid JSON or null is not SMS acceptance", async () => {
  for (const body of ["not-json", "null"]) {
    const mock = harness()
    await scanBookings(env, {
      accessToken: "test",
      fetchImpl: (url, options) =>
        String(url).startsWith("https://dashboard.philsms.com/")
          ? new Response(body, { status: 200 })
          : mock.fetchImpl(url, options),
    })
    const fields = JSON.parse(
      mock.calls.find((call) => call.path.includes("updateMask")).options.body,
    ).fields
    assert.equal(fields.status.stringValue, "needs_review")
    assert.equal(fields.providerHttpStatus.integerValue, "200")
  }
})

test("portable timeout covers reading the response body, not just receiving headers", async () => {
  await assert.rejects(
    fetchJson(
      async (url, options) => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () =>
          new Promise((resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            )
          }),
      }),
      "https://example.test/",
      {},
      10,
    ),
    /REQUEST_TIMEOUT/,
  )
})

test("ambiguous network failures persist a claim and are never automatically retried", async () => {
  const mock = harness()
  let sends = 0
  await scanBookings(env, {
    accessToken: "test",
    fetchImpl: (url, options) => {
      if (String(url).startsWith("https://dashboard.philsms.com/")) {
        sends++
        throw new Error("private-network-message")
      }
      return mock.fetchImpl(url, options)
    },
  })
  const fields = JSON.parse(
    mock.calls.find((call) => call.path.includes("updateMask")).options.body,
  ).fields
  assert.equal(sends, 1)
  assert.equal(fields.status.stringValue, "needs_review")
  assert.equal(fields.diagnostic.stringValue, "PHILSMS_NETWORK_FAILURE")
  assert.equal(fields.providerHttpStatus.integerValue, "0")
  assert.equal(fields.providerResponseType.stringValue, "unavailable")
})
