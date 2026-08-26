// Mock for the SDK browser global (window.web10) — the same surface the
// real /wapi.js IIFE attaches (see src/types/web10.d.ts). Tests install it
// before rendering App, which reads window.web10 through src/interfaces/auth.
import { vi } from 'vitest';
import type { TokenPayload } from 'web10-npm';

export interface Web10Mock {
  createV3Client: ReturnType<typeof vi.fn>;
  openAuthPortal: ReturnType<typeof vi.fn>;
  authListen: ReturnType<typeof vi.fn>;
  closeAuthPopup: ReturnType<typeof vi.fn>;
  cookieDict: ReturnType<typeof vi.fn>;
  readTokenCookie: ReturnType<typeof vi.fn>;
  setTokenCookie: ReturnType<typeof vi.fn>;
  scrubTokenCookie: ReturnType<typeof vi.fn>;
  decodeJwt: ReturnType<typeof vi.fn>;
  isTokenExpired: ReturnType<typeof vi.fn>;
  /** The client createV3Client returns — assert contractRequest on it. */
  client: { contractRequest: ReturnType<typeof vi.fn> };
}

export function installWeb10Mock(
  overrides: { token?: string | null; payload?: TokenPayload | null } = {},
): Web10Mock {
  const token = overrides.token ?? null;
  const payload = overrides.payload ?? null;
  const client = { contractRequest: vi.fn() };
  const mock = {
    createV3Client: vi.fn(() => client),
    openAuthPortal: vi.fn(() => window),
    authListen: vi.fn(),
    closeAuthPopup: vi.fn(),
    cookieDict: vi.fn(() => ({})),
    readTokenCookie: vi.fn(() => token),
    setTokenCookie: vi.fn(),
    scrubTokenCookie: vi.fn(),
    decodeJwt: vi.fn(() => payload),
    isTokenExpired: vi.fn(() => false),
    Web10Error: Error,
    client,
  };
  // The mock only implements what src/interfaces/auth touches; the rest of
  // the surface is present so the assignment type-checks.
  window.web10 = mock as unknown as Window['web10'];
  return mock;
}
