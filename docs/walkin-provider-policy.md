# Specific providers and Cash/E-wallet for walk-ins

## Current behavior

- A walk-in requires a specific, active Service Provider. The form cannot advance
  to payment or submit without one, including keyboard submission. A provider
  becoming inactive while the form is open also blocks payment.
- There is no **Any available** walk-in option. Solo shops use the specifically
  identified active manager-provider profile.
- New walk-in payments allow **Cash** and **E-wallet** only. **Card** is removed
  from the walk-in controls and rejected by validation and Firestore rules.
- Multiple services and cent-accurate totals retain the existing quote workflow
  and atomic visit/sales/payment commit.
- Existing unassigned walk-ins remain in financial history and gross sales, but
  are excluded from provider earnings/payroll. The system does not guess who
  performed them. An Administrator can correct a historical record to a real
  active provider; changing its provider ID also resolves its canonical name.
- Historical Card transactions are not erased or reclassified. New Card choices
  cannot be introduced through walk-in corrections.

## Record time editing

Administrator and Manager record editors no longer expose an editable time.
Existing date corrections and other permitted Administrator edits remain.
Rules freeze each record's original `time` and `startMinute`; a booking's
`startsAt` can follow a date correction only at the original clock time.
Corrections never add synthetic time fields to old walk-in/receipt documents.

## Reservations are unchanged

Ordinary reservation creation still offers named or **Any available provider**,
uses the existing date/time picker and capacity reservations, and retains its
existing appointment payment methods. The walk-in provider/payment restrictions
do not apply to reservation creation or appointment checkout. Only the separately
requested record-edit time controls are made read-only.

## Publish both rules and app

Complete rules: `firestore.rules` and the identical
`public/smartcut-firestore.rules.txt`.

```sh
firebase deploy --only firestore:rules --project smartcutpre
```

Deploy the rules, then publish the app in Figma Make. Refresh old clients. Old
clients attempting blank-provider or Card walk-ins, or changing record times,
will be denied by the new rules. No production data is migrated, deleted, or
automatically assigned by this change.

## Verification

- Production build passed.
- All 188 non-emulator tests passed, including rendered form/editor checks.
- All 26 tests in the full demo-only Firestore emulator suite passed. These cover
  named-provider Cash/E-wallet walk-ins up to 50 services, raw requests attempting
  blank-provider/Card creation, immutable record times, preserved legacy receipt
  fields, ordinary any-provider reservations, linked-customer bookings,
  240-minute services, concurrent claims, and cancellation/rejection.
- The ordinary reservation form, checkout, booking/assignment/status transaction
  functions, core slot rules, and domain helpers remain unchanged.
