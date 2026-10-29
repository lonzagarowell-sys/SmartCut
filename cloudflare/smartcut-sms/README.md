# Per-shop booking SMS — Cloudflare backend

This replaces the old fixed-recipient routing. Repository
edits do not deploy the Worker. The legacy Node listener under `functions/` is
an alternative single-shop listener and must remain stopped when using Cloudflare.
Never run both backends.

## Deploy and configure

1. Deploy `firestore.rules` and `firestore.indexes.json` to `smartcutpre`.
   Wait for the appointments `createdAt` collection-group index to be ready.
2. Paste the complete `worker.js` into the existing Cloudflare Worker dashboard
   for `smartcut-sms.jplazo.workers.dev` and deploy.
3. Retain the existing secrets `FIREBASE_SERVICE_ACCOUNT_JSON` and
   `PHILSMS_API_TOKEN`, plus `PHILSMS_SENDER_ID` and the original timezone-qualified
   `SMS_START_AT`. Rotate any previously exposed credentials.
4. Keep the every-minute Cron `* * * * *`.
5. GET `/` should show `"version":"shop-routing-v13"`. The public endpoint cannot
   send SMS; it only reports deployment metadata.
6. Each Manager opens **Settings → SMS**, enters a Philippine mobile number,
   and clicks **Save SMS number**. Shops start with no SMS number: no texts are sent
   until a manager saves one. There is no hardcoded fallback number and no
   shop-name restriction.

## Privacy and routing

The number is stored under `shops/{shopId}/settings/sms` as `number`, `enabledAt`,
and `updatedAt`. It is readable/writable only by shop management and global
Administrators, not customers or service providers. It is separate from the
shop's public contact number. Blank means disabled. Re-enabling starts a new
activation time; changing an enabled number preserves the original activation.

The Worker scans a collection group but accepts only paths matching
`shops/{shopId}/appointments/{id}`. It derives the shop from that document path,
reads only that shop's SMS settings and customer membership, and ignores any
phone number or shop ID supplied in a booking. Customer-created appointments
only qualify (`customerId == createdBy`); staff-created bookings, cancellations,
rejections, and bookings before the shop enabled SMS are skipped.

The recipient is read when processing a booking. Changing the number affects
future send attempts, not messages already accepted or ambiguously sent.
There is no automatic historical backfill when a shop enables SMS.
The Worker re-reads the same shop's SMS document immediately before its atomic
delivery claim. The claim stores `shopId`, `recipient`, and `settingsUpdatedAt`
so routing can be audited without relying on another shop's state.
The outbound message uses a fixed appointment-notice template with only the
canonical date, time, and a short appointment reference. It intentionally
excludes free-form shop and customer text because PhilSMS/carrier spam filters
can reject words from manager-entered shop names.

## Cursor, duplicate protection, and quotas

Each invocation scans up to five appointments across all shops, oldest first,
using a persistent global cursor at `smsWorkerState/shopBookings`. Concurrent
checkpoint writes use optimistic preconditions. A failed scan does not advance
past an unprocessed booking. Per-shop deterministic delivery claims remain at
`shops/{shopId}/smsDeliveries/{appointmentId}`, so claims from the previous
single-shop Worker also prevent duplicate sends.

At most 44 outbound requests are needed per run, including OAuth and checkpoint
writes, below a 50-request ceiling. This is five scanned bookings per minute
across all shops, not five per shop. Existing appointments since `SMS_START_AT`
may require several scans; pre-opt-in bookings are skipped. Reads still consume
Spark quota. Larger installations need quota/throughput planning.

The Worker uses portable AbortController timeouts and manual redirects.
It does not automatically retry an ambiguous provider send.
`manual` controls HTTP redirects, not the Cron schedule or automatic sending.
Timeouts now include reading the response body.

## Diagnosing HTTP 404 without exposing private data

The documented PhilSMS endpoint remains unchanged:
`POST https://dashboard.philsms.com/api/v3/sms/send`.
Removing a hardcoded recipient does not itself explain a provider HTTP 404.
The Worker records `providerHttpStatus` and a bounded `providerResponseType`
(`json`, `html`, `empty`, `other`, or `unavailable`) with the delivery result.
An HTML 404 is a page-style response; a JSON 404 may be an API error. Neither
alone establishes whether the underlying cause is routing, authentication,
or provider infrastructure. Version v7 also saves a redacted, length-limited
`providerErrorMessage` from the JSON `message` field in the private delivery
ledger only. It is not added to logs or the public health endpoint. Known secrets,
phone numbers, emails, and long identifiers are stripped; inspect and remove any
remaining private information before sharing it. Raw bodies are never logged.
Failures also log the processing stage. No automatic resend or endpoint probing
is introduced. Previously claimed failures remain untouched.
Successful responses save PhilSMS's bounded `providerMessageId` and
`providerDeliveryStatus` when supplied. `PHILSMS_ACCEPTED` means the gateway
accepted and charged for the request; only a status such as `Delivered` indicates
the provider reported handset delivery. Carrier delivery can still be delayed or
fail after initial acceptance.

## Live verification

Version v13 formats the stored Manila `HH:mm` booking time as `h:mm AM/PM`
in SMS notices. It does not change the stored time or convert timezones.

Version v12 centralizes validation and construction of the single-recipient
plain-text payload before claiming a send. New delivery records also store
`requestedSmsType`, `providerSmsType`, and `providerTypeMismatch` to expose a
provider response such as `voice` for a `plain` request. A mismatch does not
trigger a resend, change the provider-reported status, or prove the cause of
non-delivery. Existing claims, activation dates, and cursor remain unchanged.
This refactor is not a confirmed fix for carrier delivery. Avoid repeated,
nearly identical test sends: PhilSMS warns these may trigger temporary filtering.

Version v11 uses a link-free message, unlike the website-link variant pasted in
chat. URLs can be filtered differently by carrier; removing them is a precaution,
not proof of the cause of a missing message. There is no recipient allowlist in
this Worker. Do not reset claims or resend charged messages blindly.

For a charged but missing SMS, compare the private delivery record's `recipient`
with the newly saved number, then use `providerMessageId` to locate the message
in PhilSMS delivery history. If the recipient matches, ask PhilSMS to investigate
the final delivery status, sender-ID approval for that network, and account
restrictions. If it does not match, verify the deployed Worker version and stop
any legacy listener. Saving settings alone does not send a text: test with a new
Customer-created booking after saving. Never share credentials or full phone
numbers when reporting delivery issues.

1. Configure distinct numbers for two test shops.
2. Make a new Customer booking in each shop after enabling SMS.
3. Check scheduled logs and each shop's delivery ledger:
   - `accepted`: PhilSMS accepted the message, not proof of handset delivery.
   - `needs_review`: reconcile with PhilSMS delivery history before retrying.
   - `sending`: interrupted or ambiguous; investigate before retrying.
4. Confirm each alert reaches only its own shop's number.
5. Change one shop's number, make another booking, and confirm the new recipient.
6. Clear and save a number; confirm new bookings do not send.
7. Confirm later Cron invocations do not duplicate any alert.

Never delete an ambiguous delivery claim without checking provider history.
Disable Cron before reconciled manual retries. Resetting the global cursor
rescans all shops since `SMS_START_AT`; existing claims still protect duplicates.

## Local checks

```sh
node --test cloudflare/smartcut-sms/worker.test.mjs
node --check cloudflare/smartcut-sms/worker.js
```

Tests use mock HTTP responses and test-only credentials. They do not send SMS,
access Firebase, or confirm deployment, IAM, indexes, credits, or carrier delivery.
