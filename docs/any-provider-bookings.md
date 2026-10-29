# Any available provider bookings

Customers may leave the provider preference as “Any available provider — choose
at the shop.” A named selection keeps its existing provider reservation.

For an any-provider booking, a transaction holds all required 15-minute blocks
on one active provider's calendar as a conservative capacity reservation. The
booking remains unassigned (`providerId: ""`), with `providerPreference: "any"`,
and uses `reservedProviderId` only for scheduling. This is not the final service
assignment. Existing appointments require no migration.

Manager acceptance does not assign or start the booking. At arrival, a manager
selects a provider, or a provider confirms that the customer agrees and takes
the booking themselves. The transaction checks current availability, moves the
calendar hold if necessary, and assigns the booking once. A conflicting choice
is rejected without releasing the existing hold. Named-provider bookings cannot
be claimed by someone else, and providers cannot assign an unassigned booking
to a colleague.

Start is available only after assignment. Existing management override and
assigned-provider completion/payment permissions remain unchanged. Cancellation
or rejection releases the internal hold through the existing calendar transaction.
Accepted unassigned bookings are subscribed in real time separately from a
provider's own bookings; pending unassigned bookings are not shared with providers.

## Deployment

Repository edits do not deploy Firebase rules or indexes. Before using the new
feature in production, deploy the updated rules:

```sh
firebase deploy --only firestore:rules --project smartcutpre
```

Then deploy indexes:

```sh
firebase deploy --only firestore:indexes --project smartcutpre
```

Wait for the appointments `providerId` / `status` / `providerPreference` composite
index to finish building. No Cloudflare SMS change is required: booking alerts
continue routing by shop, independently of provider preference.

## Live checks

- Create an any-provider booking and a named-provider booking in the same shop.
- Confirm capacity cannot be exceeded across both kinds of reservations.
- Accept the any-provider booking; verify it appears for providers only now.
- Confirm two concurrent claims result in only one assignment.
- Try assigning a busy provider; ensure the original hold remains.
- Verify assignment updates manager/customer/provider screens without refreshing.
- Verify unassigned bookings cannot start, named selections cannot be taken by
  someone else, and payment remains restricted to management/assigned providers.
- Cancel an unassigned booking and confirm its held time becomes bookable again.
