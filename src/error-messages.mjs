export function friendlyErrorMessage(error) {
  const code = typeof error?.code === "string" ? error.code.split("/").at(-1) : ""
  if (code === "permission-denied" && /1000 expressions/i.test(String(error?.message || "")))
    return "Firestore security rules exceeded their evaluation limit. Ask the Administrator to publish the latest SmartCut rules, then retry."
  const messages = {
    "permission-denied": "Access denied. Check your role and deployed Firestore rules, then retry.",
    "unavailable": "Firebase is unreachable. Check your connection. Changes are not confirmed until Firebase acknowledges them.",
    "network-request-failed": "Check your internet connection and try again. Changes are not confirmed until Firebase acknowledges them.",
    "aborted": "This record changed in another session. Check its latest status before trying again.",
    "deadline-exceeded": "The request could not be confirmed in time. Check the latest booking or Paid status before trying again.",
    "resource-exhausted": "Firebase's usage limit has been reached. Ask management to check the project quota.",
    "not-found": "This record is no longer available. Close it and check the latest list.",
    "invalid-credential": "The email or password is incorrect.",
    "user-not-found": "The email or password is incorrect.",
    "wrong-password": "The email or password is incorrect.",
    "email-already-in-use": "This email already has an account. Sign in or reset your password.",
    "weak-password": "Choose a stronger password that meets the account password policy.",
    "password-does-not-meet-requirements": "Choose a stronger password that meets the account password policy.",
    "operation-not-allowed": "This sign-in provider is disabled. Ask management to check Firebase Authentication.",
    "popup-blocked": "Your browser blocked Google sign-in. Allow popups for this site and try again.",
    "popup-closed-by-user": "Google sign-in was cancelled. You can try again.",
    "cancelled-popup-request": "Google sign-in was cancelled. You can try again.",
    "unauthorized-domain": "This site's hostname must be authorized in Firebase Authentication.",
    "account-exists-with-different-credential": "This email uses a different sign-in method. Sign in with your existing method.",
    "invalid-email": "Enter a valid email address.",
    "too-many-requests": "Too many attempts. Wait a moment before trying again.",
    "requires-recent-login": "Your security session expired. Verify your current password again before retrying.",
    "user-token-expired": "Your sign-in session expired. Sign in again with your current password.",
    "invalid-user-token": "Your sign-in session is no longer valid. Please sign in again.",
    "user-disabled": "This account has been disabled. Contact your shop's administrator.",
    "user-mismatch": "This verification belongs to a different account. Sign in again before continuing.",
    "multi-factor-auth-required": "This account requires additional verification. Complete your account's sign-in verification before changing the password.",
  }
  if (Object.hasOwn(messages, code)) return messages[code]
  if (code === "failed-precondition")
    return /index/i.test(error?.message || "")
      ? "This live query needs a Firestore index. Ask management to deploy the required indexes and wait until they are Enabled, then reconnect."
      : "Firebase setup is incomplete. Ask management to check the latest rules and indexes before retrying."
  if (code && error.code.startsWith("auth/"))
    return "Your account request could not be completed. Check your connection and sign-in session, then try again."
  if (code) return "The request could not be completed. Check the latest record status before trying again."
  return error instanceof Error && error.message
    ? error.message.replace("Firebase: ", "")
    : "The request could not be completed. Please try again."
}
