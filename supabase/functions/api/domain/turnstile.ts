// Server-side Cloudflare Turnstile verification (T21). Fails closed: any network error, non-OK
// response or unexpected JSON is "not verified".
// Source: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
// Test keys: https://developers.cloudflare.com/turnstile/troubleshooting/testing/

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare documents tokens of up to 2048 characters. */
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 5000;

export interface TurnstileVerifier {
  verify(token: string): Promise<boolean>;
}

/** `remoteip` is deliberately not sent: the IP is only used (hashed) for the rate limit. */
export function createTurnstileVerifier(
  secret: string,
  fetchFn: typeof fetch = fetch,
): TurnstileVerifier {
  return {
    async verify(token) {
      if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN_LENGTH) return false;
      try {
        const body = new FormData();
        body.append('secret', secret);
        body.append('response', token);
        const res = await fetchFn(TURNSTILE_SITEVERIFY_URL, {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          await res.body?.cancel();
          return false;
        }
        const parsed: unknown = await res.json();
        return typeof parsed === 'object' && parsed !== null &&
          (parsed as { success?: unknown }).success === true;
      } catch {
        return false;
      }
    },
  };
}
