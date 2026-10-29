# SmartCut

A responsive salon and grooming workspace using React, TypeScript, Tailwind CSS, Firebase Authentication, and Firestore. All amounts use Philippine pesos and booking times use `Asia/Manila`.

## Shop membership and isolation

- Administrators have platform-wide management access. **Manage another shop** opens a searchable directory of all active, paused, and inactive shops. Selecting and confirming updates only the Administrator's `activeShopId`; it never changes shop ownership, creates a customer connection, or moves records. The selected business still determines every dashboard query and write. Global Administrator authorization is enforced by Firestore rules and callable functions, not by adding the Administrator to every shop. Manager, provider, and customer access remains shop-scoped, and financial integrity checks and one-time trial protection still apply. Deploy the updated rules and functions before using this access.

- Registration creates a Customer identity, then shows searchable shop cards and a confirmation step. Confirmation atomically creates the selected shop's membership and customer record. The account remembers its active shop and previously joined shops.
- **Switch shop** loads only that shop's services, staff, pricing, promotions, bookings, notifications, and receipts. Switching does not transfer historical records. Previously joined inactive shops remain accessible for history, but cannot accept new bookings.
- Unassigned Managers and Administrators complete shop setup. Each owner-created shop uses its owner's authentication UID. New Manager/Administrator accounts created through Team establish their own business on first sign-in; Service Providers join the creating business and cannot switch shops.
- `users/{uid}` holds global identity. Business records live under `shops/{shopId}`: members, clients, team, services, appointments, appointmentSchedules, sales, payments, payroll, payrollPeriods, settings, notifications, promotions, reviews, and subscription records. Firestore rules enforce scoped membership, not just browser filtering.
- **Settings → Business** controls Active / Inactive and accepting new customers independently. Pausing never deletes relationships or records. The deployed service-change function refreshes directory specialties.
- Starter trial eligibility is per shop. Manual GCash references have a server-only global uniqueness ledger; payment requests and approvals remain shop-scoped.

### Existing-data migration

New shop creation now atomically saves the shop, owner membership, account context, and booking settings, so partial initialization cannot leave a new shop without its booking schema. For existing shops with missing or older booking settings, management sees **Review booking setup**. Open **Settings → Business**, confirm the actual Asia/Manila opening hours, and save. The form preserves the selected shop's directory details; saving checks for active legacy appointments before enabling reservations. Loading settings does not count as an incomplete setup, and customer booking access remains blocked until valid settings are saved. Deploy the current rules before creating new shops with atomic setup.

Back up Firestore before deployment. This version does not guess ownership or automatically migrate old root-level collections. Legacy business records remain stored but are denied by the new rules until a trusted migration assigns them to their correct shops. Migrate related services, memberships, providers, bookings, schedules, receipts, settings, and payroll together, preserving document IDs and references. Staff identities also need their correct `shopId` and `activeShopId`. Never copy another shop's history into a newly selected business.

Deploy rules, indexes, and functions together before live testing. The scheduled subscription expiry function uses the collection-group settings status index in `firestore.indexes.json`. Production deployment and migration are not performed by the app or the Vite build.

## Firebase setup

Login offers **Remember me on this device** for both email/password and Google.
Checked uses Firebase local persistence (survives browser restarts); unchecked
uses session persistence (ends when the tab/window session closes). Passwords
are never saved by this option. Google sign-in uses Firebase's popup flow and the
existing profile initialization: new users receive Customer access, while existing
roles are preserved. Enable **Google** in Authentication → Sign-in method, set a
support email, and authorize the production/preview hostnames in Authentication
settings. Browser popup/privacy restrictions can affect login inside Figma.
Production CAPTCHA remains required for both login methods; Figma previews are
exempt. The checkbox is currently a frontend gate, not server-verified anti-bot
protection.

The application connects to **`smartcutpre`**. Switching the web configuration does not migrate Authentication accounts or Firestore data from `newsmartcut-4d4b8`; provision or migrate them separately in the new project. No service-account credentials or private API keys belong in browser code. Firebase's public web configuration identifies the project; deployed Firestore rules enforce access.

1. Enable **Email/Password** in Firebase Authentication. Add your preview and production hosts to Authentication's authorized domains. Configure the password-reset email template and your desired password policy in the console.
2. Create a Firestore database if one does not already exist. Back up existing records before changing their schema or permissions.
3. Sign in to the Firebase CLI and deploy the rules explicitly:

   ```sh
   firebase deploy --only firestore,functions --project smartcutpre
   ```

   Deployment is not performed automatically by the app or by the Vite production build. Review these rules before using them with production data.
4. Create the first account in Firebase Authentication or use the app's **Create account** screen, then sign in. The app automatically creates a missing `users/{authenticationUid}` profile and the `users` collection on its first successful write. Console-created accounts receive their display name or email prefix as an initial name; it can be changed in Account settings. All automatic profiles receive only Customer access, and existing profiles/roles are preserved. To provision the first Administrator, use the trusted Firestore console to change that profile's `role` to `"Administrator"`. Public registration cannot bootstrap a privileged account. Afterward, only Administrators can assign registered accounts' roles through **Team**.
5. Sign in as that account and complete **Create your shop**. Review **Settings → Business**, configure opening hours, and publish the shop's location, description, optional logo, and availability. New shops initialize booking schema version 2. Review legacy records before migration.
6. Add the real menu in **Services**. In **Team → Create team account**, an Administrator can enter a member's name, email, initial password, and role (Service Provider, Manager, or Administrator). Managers can create Service Provider accounts only: their assigned role is fixed, and existing team roles are read-only. This creates a real Firebase Authentication login and atomically writes its profile and minimal team-directory entry without signing management out. Share the password securely; the member can request a password-reset email from Account settings. Only Administrators can change existing registered accounts' roles through Team. Either management role can use **Publish provider** for existing Service Providers missing from the directory. The directory contains name, role, and active status, not account email addresses.

Team creation uses a temporary, in-memory Firebase Auth instance and management-authenticated Firestore writes. Deploy the updated rules before using it. Public registrations still receive Customer access only; no first-administrator self-bootstrap is permitted. Passwords never enter Firestore. Authentication and Firestore cannot commit in one transaction: if profile creation fails, the app attempts to delete the newly created Auth login and reports cleanup failures with the UID for console review. Firebase signup quotas and password policies apply; staff invitation emails and a trusted provisioning backend are separate enhancements.

**Team → Add Existing Staff** links an existing Service Provider by email without creating a duplicate login or changing their password or role. The trusted `addExistingStaff` callable checks management membership, the Authentication account, its Service Provider profile, and existing shop assignments before atomically updating the account context, shop membership, and booking directory. Other-shop assignments, disabled logins, and non-provider roles are rejected; existing business history is never moved. Repeat additions are harmless. Deploy the callable and the `members.uid` collection-group index with `firebase deploy --only functions:addExistingStaff,firestore:indexes --project smartcutpre` before using this option. No additional client Firestore permissions are needed.

Administrator and Manager share business-management tools, with a Team permissions exception: only Administrators can change assigned roles or create Administrator/Manager accounts. Managers can view roles and create Service Provider accounts only. Administrators cannot change their own role. Either management role can publish an existing Service Provider to the booking directory without changing their role. Service Providers see their assigned appointments and can start/complete confirmed services, but cannot create appointments. Service Providers also handle cashier duties: they can create/update customer records, view sales/payments, and record received payments. The rules permit checkout and cancellation only for their assigned appointments within their shop. There is no separate Cashier role. Customers can book, cancel their own pending/confirmed bookings, and read their own receipts. Payroll creation, analytics, team administration, and business settings remain management-only; providers can read their own payroll statements. URL guards are a usability measure; the Firestore rules enforce the actual permissions.

Legacy Cashier accounts are not silently granted Service Provider access. Their sign-in screen explains that migration is required; Administrators see the unsupported role marked as requiring migration in **Team**, rather than an incorrectly selected current role. Once compatible rules are deployed, an Administrator can explicitly choose **Service Provider** and confirm the change in Team, which updates the profile and booking directory together. Otherwise, use the trusted migration described above before deployment. Existing appointment, sale, payment, and receipt records are not rewritten by a role change.

## Connected workflows

### Published shop hours

Managers set **Opens at** and **Closes at** under Settings → Business. Saving
atomically updates booking settings and the shop directory's `open`/`close`
fields. Customer shop cards show those published hours in 12-hour Manila time,
without granting access to private business settings. Existing shops display
“Opening hours not published” until management saves once. Deploy the updated
`firestore.rules` before saving: the directory schema now permits validated hours
that match the business settings. The existing same-day opening-before-closing
requirement remains; overnight and per-weekday schedules are not introduced.

### Owner SMS booking alerts

For the configured Cloudflare backend, use
[Cloudflare setup and verification](cloudflare/smartcut-sms/README.md) and paste
`cloudflare/smartcut-sms/worker.js` into the Worker editor. It uses a persistent
scan cursor and one-minute Cron trigger. No frontend/rules changes are required.
Do not run the legacy Node listener at the same time.

A server-only PhilSMS listener is available for Firebase Spark without deploying
Cloud Functions. See [setup and security instructions](functions/OWNER-SMS.md).
It requires an always-on backend, a confirmed PhilSMS API endpoint, private
credentials, and an explicit shop ID. It is not activated by the browser app.
Existing Firestore rules already deny client access to its delivery ledger;
no additional client permissions are needed.

- **Booking:** select a real service and active provider. Price and duration are loaded again inside the transaction. Reservations lock every 15-minute interval for the full duration (15–240 minutes), including bookings with different start times that overlap. Server rules validate service pricing, provider identity, future Manila date/time, configured business hours, canonical reserved intervals, and ownership. Cancellation releases intervals in the same transaction.
- **Service menu:** the **Services** section is the single service library and customer-facing catalog. Administrator, Manager, and Service Provider can add services with optional photos. Only Administrator and Manager can edit/archive existing services or migrate legacy catalog records. Customers see active services and can start a booking directly from the same section. Archive services rather than deleting them. Existing bookings retain their original price and duration.
- **Customer records:** studio contact records are distinct from sign-in accounts. Optionally link the exact Customer Authentication UID so staff-created bookings and receipts appear in that customer's account. Blank UID means a walk-in, not an invented customer account.
- **Role workspaces:** Administrator and Manager share full management access. Service Providers use **My appointments** for their own assigned services, service viewing/creation with optional photos, customer add/edit tools, sales/receipt viewing and exports, checkout for their own completed appointments, their own payroll statements, and personal account settings. Customers have their own bookings, the active menu in **Services**, their own receipts, and personal account settings. Provider checkout, appointment lists, and dashboards are restricted to their assigned services. Providers cannot create bookings, edit existing services, create payroll statements, view another provider's payroll, assign roles, access analytics, or change business settings. Customer edits do not rewrite existing bookings or receipts.

## Cloudinary service photos

The app uploads optional service photos to cloud `dijbiwcbo` using the case-sensitive upload preset `SmartCut`. In Cloudinary **Settings → Upload → Upload presets**, create/configure `SmartCut` as **Unsigned**, restrict allowed formats to JPG/PNG/WebP and maximum file size to 5 MB, disable overwrites, and configure a dedicated service-photo folder. No API secret is needed or stored in browser code. Client validation alone does not protect the public unsigned endpoint: enforce restrictions in the preset and monitor usage. For production role-enforced uploads, add a trusted signed-upload backend; Firebase permissions cannot protect a public Cloudinary preset.

Photos are uploaded when saving; their secure URL and public ID are stored on the Firestore service and displayed in the unified Services section. Removing/replacing a photo unlinks it from the service but does not delete Cloudinary assets. If upload succeeds and the Firestore write fails, the form retains the uploaded URL for retry; closing it may leave an unused asset. Asset deletion/cleanup requires Cloudinary console access or a trusted backend. Deploy the updated Firestore rules before testing Service Provider service creation.
- **Checkout:** confirm, start, and complete the service before recording received payment. A transaction creates an immutable matching payment and sale, and marks the appointment paid. Deterministic appointment-based receipt IDs prevent duplicate checkout. Cash change is a calculator; it is not revenue. Cash, GCash, Card, and Bank transfer are recording methods, not gateway integrations.
- **Payroll:** compensation statements record a provider's base pay for the selected pay period; commission rates, bonuses, and deductions are not part of the workflow. Integer-cent fields avoid decimal arithmetic errors. Transactions reserve the provider's pay period to prevent concurrent overlapping statements through this app. Statements do not transfer money, compute tax, or mark payroll paid.
- **Analytics:** reports use recorded sales and appointments, with date filters and formula-safe CSV exports. Booking estimates are not presented as collected revenue.
- **Notifications/settings:** in-app booking/payment notifications and shared business settings persist in Firestore. Failed writes do not fall back to local pretend-success records. Connection/cache states are explicit, and save confirmations occur only after Firebase acknowledges the write.
- **Subscription:** Administrator and Manager can choose Starter (one-time 7-day free trial, then ₱99/month), Professional (₱399/month), or Business (₱599/month). The Starter button activates the workspace trial without payment or Administrator approval. An atomic Firestore transaction creates `settings/subscription` and the immutable `subscriptionTrials/starter` marker. Rules restrict this client write to the exact free-trial schema, seven days, zero PHP, and Firestore server timestamps; paid activation and trial resets remain forbidden. The end date is derived from the trusted `trialStartedAt` plus seven days, not the browser clock. Existing trials with `currentPeriodEnd` remain supported. Billing displays the exact end date/time in Asia/Manila and shows expiration even before the scheduled backend updates the stored status. Paid plans use the supplied GCash QR and manual transaction-reference submission, followed by Administrator approval through Cloud Functions. No payment gateway or automatic wallet debit is used.

### Free trial and manual GCash subscription setup

The free trial requires Firebase Authentication, Firestore, and the updated deployed rules. It does not require a deployed callable function, a GCash reference, or a payment gateway.

1. Authenticate the Firebase CLI and deploy the current rules:

   ```sh
   firebase login
   firebase deploy --only firestore:rules --project smartcutpre
   ```

2. Sign in as an Administrator or Manager, open **Subscription**, and select **Start 7-day free trial** on Starter. New sign-ins remain Customers; the first Administrator must still be assigned manually in the trusted Firestore console. A workspace with an existing subscription or trial marker cannot start another trial. Do not delete subscription or trial documents to reset eligibility.

3. For paid GCash reference submissions, Administrator approvals, and scheduled expiration, deploy the functions in `asia-southeast1` as well. Cloud Functions and the hourly Cloud Scheduler require the supported Firebase billing plan and APIs:

   ```sh
   firebase deploy --only firestore:rules,functions --project smartcutpre
   ```

The callable `submitSubscriptionPayment` accepts Administrator/Manager submissions and rejects duplicate transaction references. `approveSubscriptionPayment` permits only Administrators; it records the payment and activates or extends access by one calendar month, preserving remaining trial time and clamping month-end dates. The retained `activateStarterTrial` callable supports older clients, but this app uses the rule-protected transaction. Only backend code can approve paid access or change an existing subscription. Before approving, verify the actual GCash receipt; submitting a reference alone is not proof of payment.

Before release, test trial eligibility, concurrent activation, expired access, trial-to-paid conversion, duplicate references and approvals, role restrictions, and manual renewal. Local checks do not deploy anything or verify actual GCash payments.

## Existing data

Old `rows`-based services, customer, sale, payment, and payroll records remain readable by permitted staff. Managers can review and migrate old service rows in **Services**. Existing separate catalog entries appear under **Services → Existing catalog items** for review/import into the unified library; importing does not delete the source record.

Active old appointments using only a free-text provider and exact-time `appointmentSlots` are **not safe to mix** with duration-aware scheduling. Before enabling new bookings, migrate them with a reviewed, trusted admin process that resolves their service/provider/customer IDs, creates numeric amount/duration and Manila `startsAt` fields, and reserves every canonical interval in `appointmentSchedules/{providerUid}_{YYYY-MM-DD}`. Do not set `bookingSchemaVersion: 2` manually to bypass this review. Obsolete old bookings may instead be cancelled explicitly by a management account in Appointments. No legacy record is automatically cancelled or deleted. Terminal old records remain available as history. Old provider/customer records may require identity mapping before those users can query them under the narrower rules.

Previous `local-…` fallback rows were never confirmed cloud records. They are no longer merged into authoritative data and are not automatically uploaded; reconcile any locally stored records separately before treating them as real transactions.

## Verification and remaining integrations

```sh
pnpm install
pnpm exec tsc --noEmit
pnpm build
```

The development server is managed by the environment. Changes hot-reload in the preview. Local verification includes domain checks, isolated Firestore Emulator role/booking/payment/payroll checks, and browser checks with isolated test fixtures. Those fixtures never seed the production project. These checks do not establish production readiness or replace a security audit and live-project acceptance testing.

Still needed for a fully production-operational system: rules/functions deployment and Firebase-console setup, real GCash receipt verification, reviewed legacy migration, subscription entitlement enforcement around paid-only product access, appointment online payment/refund processing, scheduled email/SMS/push reminders, staff invitation/provisioning automation, provider-specific shifts and leave, payroll disbursement/tax handling, and jurisdiction-appropriate invoicing/receipts. Opening hours currently use a daily default; multi-location scheduling, deposits, and rescheduling are not implemented. These features are not represented as working buttons or fake account/plan states.
"# SmartCut" 
