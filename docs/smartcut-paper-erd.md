# Paper-aligned SmartCut ERD

Source reviewed: the uploaded Chapters 1–3 paper, including the scope and
limitations, FR-01–FR-21, Figure 7, and Tables 7–13.

Paste all of `docs/smartcut-paper-erd.dbml` into dbdiagram.io. Export the core
entities as the main Figure 7, and consider a separate supporting diagram or
appendix for `Paper_Supporting_Requirements` so labels stay readable.

This is a proposed **logical** model aligned to the manuscript, not a literal
export of Firestore, an implemented migration, or a change to Firebase rules.
Snake-case names and integer-centavo amounts are documentation conventions.
Existing Firestore paths, field names, arrays, and mirrored records need a
physical mapping if the paper claims to document the deployed database exactly.

## Corrections to the manuscript's collection tables

- Only identifiers are primary keys; `full_name`, `email`, `role`, and
  `created_at` are not all primary keys. Email can have a unique constraint.
- A foreign key is an identifier linking an entity, not every non-ID field.
  Phone, address, status, date, title, message, amount, and timestamps are not
  foreign keys merely because they appear beside one.
- Do not put a password field in the Firestore Users collection. Firebase
  Authentication owns credential handling.
- Use Service Provider rather than Barber for the wider salon/spa scope.
- Model three business groups: Management, Service Provider, and Customer.
  Keep Administrator and Manager as separate application roles. Remove the
  separate Cashier actor unless the requirements and implementation are changed.
- Add Shops and Memberships for the five-establishment scope. Partner shop names
  are records, not five different database tables.
- A walk-in does not require an online reservation or registered user account.
- Multiple services are represented by logical sale-service line items. In the
  app, corresponding fields can remain embedded arrays rather than separate
  Firestore collections.
- Sales and payments are physical mirrors of one logical transaction; diagram
  them as one sale rather than implying double revenue.

## Paper-versus-implementation boundaries

The manuscript describes provider shift scheduling, automatic commissions at
checkout, commission-to-payroll allocation, and overhead-cost analytics. These
are explicitly marked as proposed supporting structures in the diagram.
Including them does not prove those features or collections exist in the app.
Reconcile the final implementation with these claims before submission. If
expense tracking is out of scope, remove Expenses and the overhead-cost claims.

Subscription/access settings are summarized as one current Shop Subscription
entity. In-app notifications and SMS delivery records are summarized as one
logical Notification entity; they may have different physical storage.
Appointment reservation-lock maps remain a Firestore implementation detail.
An ERD alone does not enforce double-booking prevention or permissions.

Receipts, sales reports, analytics, and customer histories are outputs derived
from transactional data, so they do not need separate stored tables merely
because the system generates them. CAPTCHA and Facebook are external
integrations, not financial or reservation entities.

## Resolve these inconsistencies before finalizing Chapters 1–3

1. The planning section says three user groups and no separate cashier; the
   use-case/context descriptions still introduce Cashier as a fourth actor.
2. The limitations say cash-only counter sales; other sections mention GCash QR.
   Decide whether the scope allows recording externally received QR payments.
   Recording such a payment is different from integrating a payment gateway.
3. The scope specifies five months, while a later section specifies three.
4. Checkout permissions differ among passages: some restrict checkout to
   management, while a testing passage also includes service providers.
5. The text claims automatic checkout commission persistence and overhead
   analytics; a manual percentage calculator or gross-sales report alone is not
   equivalent to either claim.

## Suggested replacement Figure 7 caption

**Figure 7. Proposed Logical Entity–Relationship Diagram of SmartCut**

The diagram illustrates the proposed logical relationships among user accounts,
partner establishments, shop memberships, customer profiles, service providers,
services, reservations, walk-in visits, sales transactions, service line items,
notifications, and subscription access. Each shop-owned record is scoped to its
establishment. A sale originates from either a reservation or a walk-in and may
contain multiple service line items. The supporting model describes the
manuscript's provider-shift, commission, payroll-allocation, and expense
requirements. Firebase Authentication manages credentials, while the logical
entities are mapped to Firestore documents, embedded fields, and derived outputs
as appropriate.
