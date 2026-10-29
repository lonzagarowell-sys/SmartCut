# Temporary record deletion and live reconciliation

Management record rows now include **Delete** beside the existing editor in
Appointments, customer booking history, and Sales & Payments. A confirmation
identifies the customer, service, date, amount, and record ID and explains that
this is permanent, not a refund.

Administrators can delete across shops, including locked shops. Temporary Manager
deletion requires Manager membership in that same shop and an active shop license.
Customers and Service Providers cannot delete these records.

The transaction removes the booking/walk-in, both existing financial mirrors, and
the booking's rating. It releases only that booking's reservation slots, preserves
other bookings, and rejects stale records and shop switches. It does not delete
customer accounts, payroll statements, or notification history, and never sends
or reverses money. Previously exported files are not changed.

## Deletions made directly in Firebase

Live collection snapshots replace the displayed records, including empty lists.
Modern linked transactions are displayed in finance only while their source visit
and **both** financial mirrors exist. Deleting an appointment, walk-in, sale, or
payment directly in Firebase therefore removes the corresponding linked finance
entry and its contribution to live totals, reports, exports, and calculated
provider earnings. New metadata events cannot resurrect a surviving mirror.
Unlinked legacy financial records remain supported.

Deleting only a receipt in Firebase does **not** delete the original booking's
service history. Console deletions also do not cascade to other Firebase
documents or release reservation slots. Use the in-app Delete action for complete
atomic cleanup; orphaned documents from earlier console deletions may still need
manual cleanup. Listener failures show a sync error rather than a successful
financial total.

## Deployment

The complete updated rules are `firestore.rules`. The identical copy-and-paste
version is `public/smartcut-firestore.rules.txt`. Deploy these rules, then publish
the app in Figma Make:

```sh
firebase deploy --only firestore:rules --project smartcutpre
```

No production Firebase documents are deleted by editing or publishing this code.
Only confirming an in-app deletion performs that operation.

## Revoke temporary Manager deletion

1. Change `temporaryManagerRecordDeletionEnabled()` to return `false` in
   `firestore.rules`, synchronize `public/smartcut-firestore.rules.txt`, and deploy.
   This is authoritative, including for old/open clients.
2. Set `TEMPORARY_MANAGER_RECORD_DELETION = false` in `src/record-deletion.ts`,
   then publish to hide Manager delete controls. Administrator access remains.

This switch is independent of temporary Manager date/time editing and has no
automatic expiry. Existing deployments must receive the new rules before Delete
will work.
