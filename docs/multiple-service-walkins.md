# Multi-service walk-in payments

Walk-ins no longer have a fixed five-service limit. Select any number of distinct
active services that fit within normal Firestore document/transaction limits and
the project's quotas. Duplicate selections are still rejected. Administrator
record corrections also support the resulting larger service lists.

New walk-ins require a specific active provider and allow only Cash or E-wallet.
Unassigned historical walk-ins remain in sales history but are excluded from
provider payroll. Ordinary reservation provider choices are unchanged.

## Why raising the old limit alone was not sufficient

The old walk-in rule validated every selected service document while authorizing
the same payment write. Besides the explicit five-service cap, this made
authorization grow with the selection and approach Firestore's rule access and
expression budgets. Provider, membership, shop-access, and paired-ledger checks
also consume that budget.

## Bounded price validation

The app prepares short-lived quote steps under:

```
shops/{shopId}/walkInQuotes/{quoteId}
```

Each immutable step adds exactly one active service to the previous step. Rules
validate the actual shop service name and price, the accumulated service arrays,
the cent-accurate total, the actor, the visit ID, and the original quote time.
Each step needs only one service read and at most one previous-quote read.
Quotes expire five minutes after their first step; extending a quote does not
extend its lifetime.

The final transaction rechecks the selected menu and quoted total, then writes
one completed walk-in plus matching sales/payment mirrors atomically. Its rules
compare the visit with one validated final quote, not every service document.
Receipt rules continue enforcing provider validity, shop state, and matching
financial mirrors. Quotes alone never count as revenue.

This works with the existing Firebase Spark setup; no Cloud Function deployment,
paid backend, or price-validation bypass is introduced. Larger selections take
more quote operations and use more Firestore quota.

The app attempts to delete its temporary quote steps after success or failure.
Cleanup is best-effort and does not delay or invalidate an acknowledged payment.
Closing the browser or losing connectivity can leave staging documents behind;
Administrators can remove abandoned quotes. No automatic TTL policy is assumed.
The saved visit retains its service snapshots even after staging cleanup.

## Deployment

1. Use the complete updated `firestore.rules`, also available as the identical
   copy-and-paste file `public/smartcut-firestore.rules.txt`.
2. Deploy:

   ```sh
   firebase deploy --only firestore:rules --project smartcutpre
   ```

3. Publish the updated app in Figma Make. New clients require the quote rules.
   Existing records do not require migration.

The legacy pricing branch remains for older clients during rollout; only the
new app uses the unbounded quote flow. New rules reject blank-provider and Card
walk-in creation from old clients too.

## Verification

Unit/UI regressions cover more than five selections, enabled remaining menu
options, cent-accurate totals, quote cleanup, idempotent retries, stale prices,
inactive services, unauthorized roles, and invalid providers.

The demo-only emulator suite exercises 1, 3, 4, 5, 6, 10, 25, and 50 services
with specific providers and Cash/E-wallet, including a four-service PHP 1,907.96
total. It also tests forged quote prices/names, expired quotes, unauthorized quote
creation, tampered final totals, and partial payment rejection.

Use the emulator command documented in `docs/firestore-verification.md`. A
temporary emulator config with a different localhost port may be needed when
8080 is already in use. Never point these synthetic tests at production.

Earlier emulator runs exposed a rejection/cancellation expression-budget failure.
The latest correction guards avoid unnecessary work on ordinary reservations,
without changing their permitted operations. The latest full demo-only emulator
run passes, including rejection/cancellation, manager-created linked bookings,
240-minute services, and the walk-in provider/payment restrictions.
