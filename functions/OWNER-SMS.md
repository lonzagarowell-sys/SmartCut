# Legacy Node SMS listener

Use [the Cloudflare Worker](../cloudflare/smartcut-sms/README.md) for the current
multi-shop SMS feature. Never run the Node listener alongside Cloudflare.

The alternative Node listener no longer includes a hardcoded shop, shop name,
or phone number. It requires `SMS_SHOP_ID` to select one shop and reads that
shop's recipient from `shops/{shopId}/settings/sms` for each eligible booking.
Missing, blank, invalid, or pre-activation settings disable sending.

For a standalone deployment only, provide server-side application-default
Firebase credentials plus `SMS_SHOP_ID`, `SMS_START_AT`, `PHILSMS_API_TOKEN`,
`PHILSMS_SEND_URL`, and `PHILSMS_SENDER_ID`, then run `node sms-worker.js`.
Keep credentials out of source code and rotate any exposed keys.

Managers configure their number through **Settings → SMS**. Saving blank
disables alerts. No prefilled recipient or fallback number is provided.
Customer-created bookings only qualify; rejected and cancelled bookings do not.
Per-shop delivery claims prevent automatic duplicate attempts. Ambiguous sends
require reconciliation with PhilSMS history before any manual retry.

Checks from this directory:

```sh
node --test owner-sms.test.js
node --check sms-worker.js
```

These are local checks, not verification of live deployment or handset delivery.
