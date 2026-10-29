// Preview exemption only; production and unknown hosts remain fail-closed.
export function requiresCaptcha(hostname) {
  const host = hostname.toLowerCase()
  const figmaLive = /^app-[a-z0-9]+\.makeproxy-c\.figma\.site$/.test(host)
  const figmaManaged = /^ta-[a-z0-9]+-[0-9]+-[a-z0-9]+\.makeproxy-m\.figma\.site$/.test(host)
  const figmaCached = /^[a-z0-9-]+-figmacachedpreview\.figma\.site$/.test(host)
  return !(figmaLive || figmaManaged || figmaCached)
}
