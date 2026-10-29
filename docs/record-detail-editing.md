# Record detail editing

The temporary Manager **Edit date** feature has been removed and revoked.
There are no date, time, or duration controls in the record editor.

The **Edit details** buttons have also been removed entirely from Appointments,
customer booking history, and Sales & Payments, for all roles. The separate
Delete buttons are unchanged. The retained correction API remains restricted
at the data layer to:

- Global Administrators, across shops.
- The current shop's actual owner, identified by `shops/{shopId}.ownerId`,
  with a Manager account and Manager membership in that shop.

A Manager role alone does not grant record correction access. Firestore also
requires active shop access for the owner's Manager membership. Ordinary
booking creation, provider assignment, service progression, and checkout keep
their existing permissions; this policy concerns record-detail corrections.

## Preserved scheduling

The editor groups customer, service/provider, payment/status, and additional
details. Date, time, duration, start minute, start timestamp, identity, and
original creation metadata cannot be changed by a record correction. Legacy
walk-ins without stored times do not acquire a time.

The save transaction verifies ownership again, rejects stale snapshots, and
updates linked receipts atomically. Provider corrections retain the original
date/time/duration, transferring reservation holds only when needed and rejecting
conflicts. Walk-in provider and Cash/E-wallet restrictions remain in place.

The legacy `editManagerRecordDate` API now rejects every call. The rules'
temporary date-editing switch is false, rejecting previously published clients'
date-correction writes after the updated rules are deployed.

Existing audit field names are retained for backward compatibility; an authorized
owner correction can also populate `editedByAdmin` / `adminEditedAt`. These are
audit fields, not authorization evidence: the rules independently verify the
requester's account, membership, and shop ownership.

## Deployment

The complete updated rules are in `firestore.rules`, with an identical
downloadable copy at `public/smartcut-firestore.rules.txt`. Do not use an older
export in `.tmp/paper-export` to deploy this change.

Deploy the rules first:

```sh
firebase deploy --only firestore:rules --project smartcutpre
```

Then publish in Figma Make. Local edits and verification do not deploy rules or
publish the production site.
