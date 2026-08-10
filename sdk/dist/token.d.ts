/**
 * Token utilities: cookie management, JWT decode, persistence.
 */
import type { TokenPayload } from './types';
/**
 * Parse cookies into a dictionary.
 */
export declare function cookieDict(): Record<string, string>;
/**
 * Read the web10 token from cookies.
 */
export declare function readTokenCookie(): string | null;
/**
 * Set the web10 token cookie.
 * @param token - JWT token string
 * @param maxAgeDays - Cookie lifetime in days (default 60)
 */
export declare function setTokenCookie(token: string, maxAgeDays?: number): void;
/**
 * Remove the web10 token cookie.
 */
export declare function scrubTokenCookie(): void;
/**
 * Decode a JWT payload without verification.
 * Returns `null` if the token is missing or malformed.
 *
 * @param token - JWT string
 */
export declare function decodeJwt(token: string | null): TokenPayload | null;
/**
 * Check if a token is expired.
 *
 * web10 tokens carry an ISO-8601 `expires` claim (set server-side in
 * `api/app/models/auth.py`), NOT the numeric JWT `exp` claim — so the
 * check parses `expires`. Returns `false` when the token is missing or
 * carries no readable expiry (fail-open matches the server, which
 * treats a missing expiry as the "anon" case).
 */
export declare function isTokenExpired(token: string | null): boolean;
//# sourceMappingURL=token.d.ts.map