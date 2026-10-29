# Firestore transaction verification

Mock transaction tests do not execute Firebase security rules. Run the emulator
suite before changing booking, capacity, assignment, or payment permissions.

Prerequisites: Java 21+, Firebase CLI, and installed project dependencies.

```sh
firebase emulators:exec --only firestore --project demo-smartcut-audit \
  "node --test src/firestore-integration.test.mjs"
```

This uses synthetic fixtures and the `demo-smartcut-audit` project only. It does
not contact `smartcutpre`, send SMS, or use production credentials. The ordinary
test command skips this suite when `FIRESTORE_EMULATOR_HOST` is absent.

The suite exercises the actual application transaction functions against the
rules, including creation of missing calendars, short/long service durations,
assignment/hold transfer, concurrent claims, provider-only payment creation,
private finance reads, cancellations, and global Administrator access.

The former booking rule hit Firebase's 1,000-expression evaluation limit for a
60-minute unassigned booking. Keep role checks, repeated property lookups, and
date/time parsing lean. Slot ownership must still be checked for every held block;
do not resolve budget errors by opening collections to unrestricted writes.

## Booking-rule budget regression

An actual isolated emulator run reproduced the 1,000-expression denial for
customer any-provider bookings. The rules now resolve membership without
recursively repeating the complete member check, reuse business settings, and
validate creation slot order using an exact numeric, contiguous-sequence match.
Assignment still checks ownership of every held slot individually.

The emulator suite covers 1-, 20-, 45-, 60-, and 240-minute services, named and
any-provider capacity, provider claims, acceptance/completion/payment, license
locks, and atomic rejection of price changes, foreign slot values, slot gaps,
duplicate slots, embedded commas, and regex characters. Only synthetic
`demo-smartcut-audit` fixtures are used.

For staff sign-in, cached/pending access is a loading state rather than an
access-error page. Authentication callbacks are scoped to their session so a
disposed profile listener cannot replace a newly signed-in user's account.
