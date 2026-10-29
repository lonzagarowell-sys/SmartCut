import type { IncomingMessage, ServerResponse } from "node:http"

export declare const captchaFunctionUrl: string

export declare function createCaptchaRoute(
  fetchImpl?: typeof fetch,
  endpoint?: string,
): (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>
