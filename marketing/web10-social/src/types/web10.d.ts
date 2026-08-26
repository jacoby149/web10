// The web10 SDK browser build (self-hosted at /wapi.js, built from
// sdk/src/browser.ts as an IIFE) attaches its surface to window.web10.
// This is the D42 auth flow the demos run (openAuthPortal + contractRequest
// + authListen with D45 dedupe). The shape mirrors sdk/dist/browser.d.ts —
// keep the two in sync when the SDK's browser surface changes.
import type { TokenPayload, V3Client, V3ClientOptions } from 'web10-npm';
import { Web10Error } from 'web10-npm';

declare global {
  interface Window {
    web10?: {
      createV3Client: (options?: V3ClientOptions) => V3Client;
      openAuthPortal: (authOrigin: string, options?: { handoff?: 'token' | 'none' }) => Window | null;
      authListen: (onSignedIn: (signedIn: boolean) => void) => () => void;
      closeAuthPopup: () => void;
      cookieDict: () => Record<string, string>;
      readTokenCookie: () => string | null;
      setTokenCookie: (token: string, maxAgeDays?: number) => void;
      scrubTokenCookie: () => void;
      decodeJwt: (token: string | null) => TokenPayload | null;
      isTokenExpired: (token: string | null) => boolean;
      Web10Error: typeof Web10Error;
    };
  }
}

export {};
