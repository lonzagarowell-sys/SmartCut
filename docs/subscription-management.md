# Administrator subscription management and access locks

## Manager reconnection and renewal

Workspace listeners are scoped to the signed-in account, selected shop, and
current license revision. Switching shops waits for the server-confirmed user
profile and shop document; callbacks from disposed listeners cannot populate the
new workspace. Customer booking-access loading is distinct from a confirmed
subscription pause. A real operational permission denial is reconciled with the
live access document; a legitimate lock routes staff to renewal, while unrelated
permission errors remain visible. Extending access or changing the plan restarts
terminated operational listeners without requiring a page refresh.

Self-barber profiles preserve the account's Manager or Administrator membership.
The team document may represent that account as a Service Provider without
changing its management privileges. Model-transition checks apply only when the
model actually changes. Assigned booking safeguards remain enforced when
disabling an available profile.

Booking-status notifications rely on the paired appointment update's full
authorization checks rather than repeating the entire transition rule, reducing
rule evaluation work. Unauthorized status updates and cross-shop writes remain
denied. Emulator fixtures cover Manager-barber acceptance, notifications, service
completion, payment, Administrator profile changes, and unauthorized acceptance.

The workspace subscribes to `settings/subscription` directly, not the entire
settings collection. A settings-wide query is intentionally denied while the
shop is locked: billing permission is not permission to read SMS/configuration
documents or operational data. Both the normal subscription page and locked
renewal portal show connection errors and can recreate their billing listeners.
The access-check screen also retries its exact access-document listener without
reloading the browser. Payment and trial actions wait for confirmed live billing
data. The receipt button explicitly submits the verification form.

Subscription payments buy SmartCut workspace access. They do not pay for a
salon's customer services. The bundled SmartCut QR remains the payment route;
shop-owned `gcashNumber` / `gcashName` settings are never used for subscription
fees. Optionally set public `VITE_SMARTCUT_GCASH_NUMBER` and
`VITE_SMARTCUT_GCASH_NAME` to the verified SmartCut recipient before publishing.
These are display details, not wallet credentials. Confirm that the bundled QR
and full payment image still point to the intended SmartCut recipient.

The screenshot/reference is submitted as Pending. OCR only helps read a
reference; it does not verify the payment. A global Administrator verifies the
actual transaction and approves it. Approval extends the subscription by one
calendar month, records the payment and audit entry, and updates the access
summary atomically. Manual requirements locks remain until explicitly cleared.

The full updated rules are in root `firestore.rules`. A complete text copy is
available at `/smartcut-firestore.rules.txt` in the preview for copying into the
Firebase console. Deploy the rules before publishing the app. Local unit tests
are not a substitute for the isolated emulator suite or live acceptance testing.

The core GCash submission, approval, and administrator adjustment flow now uses
Firestore transactions and validated rules. It does not need a new callable
Function for basic billing on Spark. Screenshots remain Pending until a global
Administrator approves them. Prices stay Starter PHP99, Professional PHP399,
and Business PHP599 per billing month.

Administrators select a shop from Manage another shop, then use Subscription:

- Review the screenshot, amount, date, recipient, and reference before approval.
- Approval adds one calendar month from the later of now or the existing end.
- Set a plan and an access-through Manila date, or extend by one billing month.
- Set a manual requirements lock with a message visible to shop members.
- A payment approval preserves a requirements lock. Clear it explicitly once
  requirements are met, and keep a future access-through date.
- Reject invalid proof without activating access.
- New adjustments and approvals create immutable subscription audit events.

Operational access for Manager/Service Provider memberships requires an active
`shops/{shopId}/settings/access` document and an unexpired server-time deadline.
The rules enforce the deadline without relying on an hourly scheduler or a
trustworthy browser clock. Global Administrators are exempt and can always
manage locked shops. Customers retain their own history/receipts but cannot
create bookings for a locked or expired shop. Firebase Authentication accounts
are not disabled: staff can still sign in to the restricted renewal/help and
personal-security portal.

Passwords remain outside Firestore. Approved payment receipts and historical
business transactions are not rewritten to make a manual grant look like a
bank payment.

## Legacy subscriptions

When a Manager opens a shop without an access summary, the renewal portal can
reflect the existing subscription's actual plan, deadline, and lock flag into
the missing access document. Rules prevent extending it, changing the plan,
or overwriting an Administrator's existing lock during reflection. Invalid or
missing legacy subscriptions need Administrator review. New shops can start
their existing one-time Starter trial from the restricted portal.

## Rollout

Back up Firestore. Deploy the complete current rules first:

Plan a coordinated rollout: staff using an older app may temporarily lose access
when the new rules require a license summary. Valid legacy subscriptions can be
reflected by their Manager in the new renewal portal; missing or invalid
subscriptions require Administrator activation. Review each existing shop's
subscription before enforcement rather than silently granting free access.

```sh
firebase deploy --only firestore:rules --project smartcutpre
```

Then publish the application. Keep the existing indexes enabled. If legacy
callable Functions such as addExistingStaff are deployed, deploy their updated
code as well so they enforce subscription locks:

```sh
firebase deploy --only functions --project smartcutpre
```

Cloud Functions deployment may require a billing-enabled Firebase plan; it is
not required for the core new client-transaction billing flow. Existing
Cloudflare booking SMS needs no code change.

Run `docs/firestore-verification.md` before production rollout, then verify:

1. A Manager cannot activate or extend a paid subscription directly.
2. Submitted proof stays Pending and does not unlock the shop.
3. Approval adds one month, records payment once, and updates live access.
4. A manual lock remains after approval until explicitly cleared.
5. Deadline expiry blocks staff reads/writes even with a modified browser clock.
6. Administrators remain able to manage an expired or locked shop.
7. Renewing/clearing the lock reopens the live workspace without deleting data.
