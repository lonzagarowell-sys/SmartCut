export const productionHosts = ["smartcutph.com", "www.smartcutph.com"]
export const productionKey = "6LcTUuUtAAAAAJ4Tz7QCs493yRD6xpbVp-thyVQf"
export const developmentKey = "6LcrUuUtAAAAABFA4jHmg529oc43-F4eLDXBpMbG"

export function validateCaptchaProperties(properties, hostname, now = Date.now()) {
  if (properties?.valid !== true) {
    return properties?.invalidReason || "INVALID_TOKEN"
  }
  if (properties.hostname?.toLowerCase() !== hostname) return "DOMAIN_MISMATCH"
  const createdAt = Date.parse(properties.createTime)
  if (!Number.isFinite(createdAt)) return "MISSING_CREATE_TIME"
  if (now - createdAt > 120000 || createdAt - now > 5000) return "EXPIRED"
  // Checkbox tokens have no expected action. If an action is configured explicitly,
  // validate it without adding expectedAction to the checkbox assessment request.
  if (process.env.CAPTCHA_EXPECTED_ACTION &&
      properties.action !== process.env.CAPTCHA_EXPECTED_ACTION) return "ACTION_MISMATCH"
  return null
}
