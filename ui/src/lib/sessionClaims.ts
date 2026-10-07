export interface SessionClaims {
  username: string;
  provider: string;
  expires: string;
  site: string;
  credential_kind: string;
  app_origin?: string;
}

// Client-side shape checks only. The node still verifies signatures and authority.
export function hasSessionIdentity(value: unknown): value is SessionClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Partial<SessionClaims>;
  return typeof claims.username === 'string' && !!claims.username.trim() &&
    typeof claims.provider === 'string' && !!claims.provider.trim() &&
    typeof claims.site === 'string' && typeof claims.credential_kind === 'string' &&
    typeof claims.expires === 'string' && Number.isFinite(Date.parse(claims.expires)) &&
    Date.parse(claims.expires) > Date.now();
}

export function isSelfSession(value: unknown, expectedProvider: string): value is SessionClaims {
  return hasSessionIdentity(value) && value.credential_kind === 'self' &&
    value.provider === expectedProvider && value.site === expectedProvider &&
    value.app_origin == null;
}

export function decodeSessionClaims(token: unknown): unknown {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const bytes = Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
}
