import type { ErrorBody, ErrorCode } from './contracts.ts';

/** A domain failure that can be returned to the API client without leaking internals. */
export class ApiError extends Error {
  readonly details: Record<string, unknown>;

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
  }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function httpError(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): Response {
  const body: ErrorBody = { error: { code, message, details } };
  return json(body, status);
}

// ---- CORS ----------------------------------------------------------------

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'authorization, content-type, idempotency-key';
const PREFLIGHT_MAX_AGE_SECONDS = '86400';

/** Parses ALLOWED_ORIGINS (comma-separated). Empty/missing means no origin is allowed. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return (raw ?? '').split(',').map((o) => o.trim()).filter((o) => o.length > 0);
}

/**
 * CORS headers for a request. `Access-Control-Allow-Origin` is only emitted when the
 * request origin is in the allow list; `Vary: Origin` is always set.
 */
export function corsHeaders(req: Request, allowedOrigins: string[]): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = req.headers.get('Origin');
  if (origin !== null && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
    headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    headers.set('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS);
  }
  return headers;
}

export function withCors(res: Response, cors: Headers): Response {
  const headers = new Headers(res.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
