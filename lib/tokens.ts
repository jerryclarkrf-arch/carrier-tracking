import { randomBytes } from 'node:crypto';

/** 32 random bytes, URL-safe: 43 chars. Used for driver and customer links. */
export function newLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only these are accepted in a URL path segment. */
export function isWellFormedToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(value);
}
