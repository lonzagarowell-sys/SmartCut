# SmartCut Enterprise checkbox verification

Login uses Google's visible Enterprise “I'm not a robot” checkbox, not App Check.
The widget is initialized once per mounted login screen, remains mounted during
typing and mode switches, stores the token in React state, and clears it on expiry
or after submission. Firebase password sign-in runs only after backend success.

## Endpoint and routing

`POST /api/verify-captcha` accepts `{ "token": "CAPTCHA_TOKEN" }` and returns
`{ "success": true }` or `{ "success": false, "reason": "..." }`.

The frontend defaults to the explicit deployed function URL on all hosts, avoiding
static hosts that serve HTML for `/api/*`. `VITE_CAPTCHA_VERIFY_URL` may override
this only with a confirmed JSON endpoint. Both token and siteKey are submitted;
the server rejects a key that differs from the origin-derived expected key.

Firebase Hosting can serve this same-origin path. `firebase.json` includes the Firebase
Hosting rewrite to the `verifyCaptcha` function in `asia-southeast1`.
If smartcutph.com uses another hosting provider, configure its equivalent
reverse proxy, or set the public `VITE_CAPTCHA_VERIFY_URL` to the HTTPS function
URL before building. This setting is an endpoint URL, never a secret.

Figma Make and other development hosts call
`https://asia-southeast1-smartcutpre.cloudfunctions.net/verifyCaptcha/api/verify-captcha`
directly, because the Vite preview does not serve Firebase Functions.

Vite development and `vite preview` now register `/api/verify-captcha` before
the SPA fallback and proxy to that function. Upstream HTML, redirects, malformed
responses, and network failures return HTTP 500 JSON, never index.html.
This Vite middleware is not a production backend for static Make publishing:
deploy the Cloud Function, and use its direct URL or an actual hosting rewrite.
Set `CAPTCHA_DEBUG=true` in the Functions environment for safe request/assessment
diagnostics; full Google assessments are never logged because they contain tokens.

## Required live configuration

### Current Figma preview browser error

The reported `BROWSER_ERROR` happens inside Google's checkbox before the
verification endpoint is called. The development key selection is correct;
the callback alone cannot distinguish an unauthorized domain from a blocked
Google request.

In the [Google Cloud reCAPTCHA console](https://console.cloud.google.com/security/recaptcha?project=smartcutpre),
open development key `6LcrUuUtAAAAABFA4jHmg529oc43-F4eLDXBpMbG`:

- Confirm its web integration type is **Checkbox**, not score-based.
- Add this exact domain under allowed domains (no `https://`, path, or port):

  ```text
  app-aabikk4z6fxux3cobaneh2a2rs23hr3yxvyn635bb7xk367l55yg.makeproxy-c.figma.site
  ```

- Keep domain validation enabled. Do not change the production key or authorize
  all Figma users via a shared parent domain.
- Save, allow the configuration to propagate, and reload the preview once.
  If it persists, inspect browser Network requests to `www.google.com/recaptcha`
  and `www.gstatic.com/recaptcha` for blocked/failed requests; try disabling
  content blockers or a different network/browser.

The local ignored `functions/.env.smartcutpre` now contains this exact hostname
for backend authorization on the next deployment. It does **not** configure
Google's allowed domains, and it does not change an already deployed function.
If the preview hostname changes, update both allowlists. No browser CAPTCHA
bypass or automatic reset/reinitialization loop has been added.

1. Enable the reCAPTCHA Enterprise API in project `smartcutpre`.
2. Grant the function runtime service account `roles/recaptchaenterprise.agent`.
   The backend uses Application Default Credentials, with no frontend Cloud key.
3. Both keys must be Enterprise **checkbox** keys owned by this project:
   - Production: `6LcTUuUtAAAAAJ4Tz7QCs493yRD6xpbVp-thyVQf`, only for
     `smartcutph.com` and `www.smartcutph.com`.
   - Development: `6LcrUuUtAAAAABFA4jHmg529oc43-F4eLDXBpMbG`, all other hosts.
4. Authorize the exact preview document hostname on the Google development key.
   Use `window.location.hostname` inside the preview, not the outer Figma editor.
   Also set `CAPTCHA_DEV_HOSTNAMES` in `functions/.env.smartcutpre` to those
   comma-separated exact hostnames. Localhost and 127.0.0.1 are already allowed.
   Wildcards are intentionally not accepted.
5. Deploy with an authorized Firebase CLI:

   ```sh
   firebase deploy --only functions:verifyCaptcha --project smartcutpre
   ```

   Functions require billing (Blaze); Spark cannot deploy this backend.
   For Firebase-hosted production, build using `pnpm build`, then deploy hosting:

   ```sh
   firebase deploy --only hosting --project smartcutpre
   ```

6. Configure Firestore TTL for `loginCaptchaTokens.expiresAt` to clean up consumed
   token hashes. The function service account must be allowed to create these
   documents; client access must remain denied.

## Verification and diagnostics

The server derives the site key from the allowed request Origin and POSTs only
`{ "event": { "token": "...", "siteKey": "..." } }` to
`https://recaptchaenterprise.googleapis.com/v1/projects/smartcutpre/assessments`.
It never sends `expectedAction`. It checks validity, the exact origin hostname,
creation time (two-minute freshness), and duplicate consumption. Checkbox actions
are normally absent; only set `CAPTCHA_EXPECTED_ACTION` if an action is actually
configured and required.

Invalid Google reasons are returned unchanged, including EXPIRED, DUPE, MISSING,
BROWSER_ERROR, and KEY_MISMATCH if Google reports it. HTTP API failures retain
Google's status/message; backend/network/routing failures remain distinct.
The browser error callback cannot reveal Google's specific domain/key reason;
development diagnostics explain this limitation rather than inventing one.
Logs never intentionally include tokens, passwords, or credentials.

Live testing must confirm both production domains and each actual preview host.
Check stable rendering, disabled submit without a token, successful login,
expiry, duplicate tokens, wrong hostname/key, and fail-closed API/network errors.
Local tests do not establish deployment, IAM, billing, or domain configuration.

This gates the application's login flow, not Firebase Authentication's public
password API. Preventing clients from bypassing this UI requires a separately
supported Authentication/Identity Platform enforcement mechanism.
