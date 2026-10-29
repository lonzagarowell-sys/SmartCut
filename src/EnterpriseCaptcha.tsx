import { useEffect, useRef } from "react"
import { requiresCaptcha } from "./captcha-policy.mjs"

const CAPTCHA_SITE_KEY = "6LcTUuUtAAAAAJ4Tz7QCs493yRD6xpbVp-thyVQf"
const LOAD_ERROR = "CAPTCHA could not be loaded. Please refresh the page and try again."

type EnterpriseApi = {
  ready: (callback: () => void) => void
  render: (container: HTMLElement, options: {
    sitekey: string
    callback: (token: string) => void
    "expired-callback": () => void
    "error-callback": () => void
  }) => number
  reset: (widget: number) => void
}

declare global {
  interface Window {
    grecaptcha?: { enterprise?: EnterpriseApi }
    smartCutEnterpriseScript?: Promise<EnterpriseApi>
    onCaptchaSuccess?: (token: string) => void
    onCaptchaExpired?: () => void
    onCaptchaError?: () => void
  }
}

function loadEnterprise() {
  if (!window.smartCutEnterpriseScript) {
    window.smartCutEnterpriseScript = new Promise<EnterpriseApi>((resolve, reject) => {
      if (window.grecaptcha?.enterprise) {
        const api = window.grecaptcha.enterprise
        api.ready(() => resolve(api))
        return
      }
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src^="https://www.google.com/recaptcha/enterprise.js"]',
      )
      const script = existing ?? document.createElement("script")
      const cleanup = () => {
        script.removeEventListener("load", loaded)
        script.removeEventListener("error", failed)
      }
      const loaded = () => {
        cleanup()
        const api = window.grecaptcha?.enterprise
        if (!api) {
          script.remove()
          reject(new Error(LOAD_ERROR))
          return
        }
        api.ready(() => resolve(api))
      }
      const failed = () => {
        cleanup()
        script.remove()
        reject(new Error(LOAD_ERROR))
      }
      script.addEventListener("load", loaded)
      script.addEventListener("error", failed)
      if (!existing) {
        script.src = "https://www.google.com/recaptcha/enterprise.js?render=explicit"
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
    }).catch((error) => {
      // A failed load must not poison subsequent login-page mounts.
      window.smartCutEnterpriseScript = undefined
      throw error
    })
  }
  return window.smartCutEnterpriseScript
}

export default function EnterpriseCaptcha({
  resetVersion,
  onToken,
  onError,
}: {
  resetVersion: number
  onToken: (token: string) => void
  onError: (message: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const captchaRequired = requiresCaptcha(window.location.hostname)
  const captchaSiteKey = CAPTCHA_SITE_KEY
  const widget = useRef<number | undefined>(undefined)
  const api = useRef<EnterpriseApi | undefined>(undefined)
  const callbacks = useRef({ onToken, onError })
  callbacks.current = { onToken, onError }

  useEffect(() => {
    if (!captchaRequired) {
      callbacks.current.onToken("")
      callbacks.current.onError("")
      return
    }
    let disposed = false
    const previous = {
      success: window.onCaptchaSuccess,
      expired: window.onCaptchaExpired,
      error: window.onCaptchaError,
    }
    const onCaptchaSuccess = (token: string) => {
      if (disposed) return
      callbacks.current.onToken(token)
      callbacks.current.onError("")
    }
    const onCaptchaExpired = () => {
      if (disposed) return
      callbacks.current.onToken("")
      callbacks.current.onError("CAPTCHA expired. Please complete it again.")
      if (widget.current !== undefined) api.current?.reset(widget.current)
    }
    const onCaptchaError = () => {
      if (disposed) return
      if (import.meta.env.DEV) console.error("[SmartCut CAPTCHA] BROWSER_ERROR", {
        hostname: window.location.hostname,
        siteKey: captchaSiteKey,
        hint: "Check network access and the Google Enterprise key's authorized domains and checkbox type. Google does not expose a specific reason to this callback.",
      })
      callbacks.current.onToken("")
      // Do not reset here: network errors can cause an error/reset loop.
      callbacks.current.onError(
        `CAPTCHA could not connect. Check your connection or disable blocking extensions, then refresh. If this persists, the site owner must authorize ${window.location.hostname} for the original reCAPTCHA Enterprise checkbox key in Google Cloud.`,
      )
    }
    window.onCaptchaSuccess = onCaptchaSuccess
    window.onCaptchaExpired = onCaptchaExpired
    window.onCaptchaError = onCaptchaError
    loadEnterprise().then((enterprise) => {
      if (disposed || !container.current || widget.current !== undefined) return
      api.current = enterprise
      widget.current = enterprise.render(container.current, {
        sitekey: captchaSiteKey,
        callback: onCaptchaSuccess,
        "expired-callback": onCaptchaExpired,
        "error-callback": onCaptchaError,
      })
    }).catch((error) => {
      if (import.meta.env.DEV) console.error("[SmartCut CAPTCHA] Script/render error", error)
      if (!disposed) {
        callbacks.current.onToken("")
        callbacks.current.onError(LOAD_ERROR)
      }
    })
    return () => {
      disposed = true
      if (window.onCaptchaSuccess === onCaptchaSuccess) window.onCaptchaSuccess = previous.success
      if (window.onCaptchaExpired === onCaptchaExpired) window.onCaptchaExpired = previous.expired
      if (window.onCaptchaError === onCaptchaError) window.onCaptchaError = previous.error
    }
  }, [captchaRequired])

  useEffect(() => {
    if (!captchaRequired) return
    if (widget.current !== undefined) {
      callbacks.current.onToken("")
      api.current?.reset(widget.current)
    }
  }, [resetVersion, captchaRequired])

  if (!captchaRequired) return null

  return (
    <div className="overflow-x-auto" aria-label="Account security verification">
      <div
        ref={container}
        className="g-recaptcha"
        data-sitekey={captchaSiteKey}
        data-callback="onCaptchaSuccess"
        data-expired-callback="onCaptchaExpired"
        data-error-callback="onCaptchaError"
      />
    </div>
  )
}
