# Booking and Walk-in service flow

## Entry points

Managers and global Administrators open **Services → Book a Service** or
**Appointments → New appointment**. The modal separates Booking (blue) from
Walk-in (amber). Customers retain the existing reserved Booking flow.

Booking uses a searchable name/email picker with a 240px maximum panel height,
internal scrolling, compact rows, and a fixed Add new client action. New clients
are shop-local walk-in/studio records, not Firebase Authentication accounts.
Booking continues to require an assigned provider, future Manila date/time,
reservation availability, and Manager approval.

## Walk-in payment and service lifecycle

A walk-in requires a client name, 1–5 active services, and a provider preference
or Any available. Email and phone are optional. No appointment or schedule-slot
document is created. This flow does not trigger booking SMS.

Proceed to Payment shows the service summary and total. Cash, Card, and E-wallet
are recording methods, not integrated payment processors. The Manager must
confirm funds were received; cash must cover the total.

One Firestore transaction then writes:

- `shops/{shopId}/walkins/{id}`: completed walk-in, Paid status, `completedAt`
- `shops/{shopId}/payments/{id}`: confirmed Walk-in receipt
- `shops/{shopId}/sales/{id}`: confirmed Walk-in revenue

Prices are read from the live shop service documents in the transaction. A
changed total rejects the stale quote. A stable form ID prevents duplicate Sales
records when acknowledgement is lost and the same form retries.

Confirming received payment finishes the walk-in immediately. It does not enter
the appointment list or a dashboard service queue, and there are no additional
Accept, Start service, or Complete service steps. Existing paid history is
preserved without automatic rewrites or duplicate payments.

Managers and global Administrators can approve, reject, start, and complete
reserved bookings in the selected shop, even when another barber is assigned.
Service Providers still operate only their own assigned bookings. Lifecycle
order remains enforced: Pending → Accepted → In Progress → Completed.

Sales and Payments infer old reserved records as Booking and tag new walk-in
records as Walk-in. Filters, CSV exports, payment method, provider, and Manila
timestamps are available. The walk-in's selected provider is stored at checkout.
Any available leaves it unassigned; no provider is silently claimed.

## Required deployment

Publish the updated `firestore.rules` to `smartcutpre` before using this flow:

```sh
firebase deploy --only firestore:rules --project smartcutpre
```

No Cloud Function or new index is required. Rules keep financial amounts
immutable after payment and require the walk-in, Sale, and receipt to be created
together. Legacy claim handling remains for old records, but it is not exposed
as a paid walk-in queue. Existing SMS, reviews, and customer-profile restrictions
remain.

## Verification

```sh
node --test src/walk-ins.test.mjs src/walk-in-ui.test.mjs
pnpm build
```

These tests cover validation, actual backend functions with a mocked
transactional SDK, simulated claim contention, matching financial records,
price changes, and isolated server rendering. They do not replace Firestore
emulator or live browser testing.

Live checklist after deployment:

1. Open Booking with a long customer list; search names/emails, scroll only the
   picker, and add a new client. Reserve one normal appointment.
2. Open Walk-in; ensure no date/time fields or reservation steps appear.
3. Confirm a Cash/Card/E-wallet payment. Verify one matching receipt and Sale.
4. Verify the paid walk-in has status Paid and completedAt, and does not appear
   as a reservation or in an actionable service queue.
5. As Manager, start and complete an accepted booking assigned to another barber.
   Verify an unassigned Service Provider and Customer cannot do the same.
6. Confirm another shop and Customer accounts cannot read walk-in records.
7. Filter/export Booking and Walk-in Sales; verify PHP amounts and Manila times.

The repository already has unrelated strict TypeScript errors in older MJS
imports, customer history JSX, and SMS settings. Baseline comparison confirms
the new flow introduces no additional type errors. No Java/Firebase emulator or
authenticated browser tooling is available in this environment; deployed rules
and real multi-session behavior remain unverified.
