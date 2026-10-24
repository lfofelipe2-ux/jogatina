import type { IncomingHttpHeaders } from 'node:http';

/**
 * Account email set by oauth2-proxy (in front of Caddy) after Google login, lower-cased.
 * Undefined when the header is absent (local dev), in which case the player's name is the identity.
 * The app trusts this header: in production only the proxy can reach the app, and the proxy overwrites it.
 */
export function forwardedEmail(headers: IncomingHttpHeaders): string | undefined {
  const raw = headers['x-forwarded-email'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (!value || value.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(value)) return undefined;
  return value;
}
