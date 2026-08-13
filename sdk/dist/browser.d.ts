/**
 * web10 browser SDK — v3 only, IIFE bundle for vanilla JS demos.
 *
 * When bundled as IIFE, attaches everything to `window.web10`:
 *   window.web10.createV3Client
 *   window.web10.openAuthPortal
 *   window.web10.authListen
 *   window.web10.readTokenCookie, etc.
 */
import { createV3Client as _createV3Client, type V3Client } from './v3';
import { cookieDict, readTokenCookie, setTokenCookie, scrubTokenCookie, decodeJwt, isTokenExpired } from './token';
import { Web10Error } from './http';
/**
 * Open the web10 auth portal in a popup window.
 * Sets up the auth_ready listener immediately — the popup sends auth_ready
 * once on mount, then the app sends its contract.
 */
declare function openAuthPortal(authOrigin: string): Window | null;
/**
 * Listen for auth events from the popup.
 */
declare function authListen(onSignedIn: (signedIn: boolean) => void): () => void;
/**
 * Create a v3 client with contractRequest patched to reuse the auth popup
 * when it's still open (avoiding a second popup that gets blocked).
 */
declare function createV3Client(options?: Parameters<typeof _createV3Client>[0]): V3Client;
declare const web10: {
    createV3Client: typeof createV3Client;
    openAuthPortal: typeof openAuthPortal;
    authListen: typeof authListen;
    cookieDict: typeof cookieDict;
    readTokenCookie: typeof readTokenCookie;
    setTokenCookie: typeof setTokenCookie;
    scrubTokenCookie: typeof scrubTokenCookie;
    decodeJwt: typeof decodeJwt;
    isTokenExpired: typeof isTokenExpired;
    Web10Error: typeof Web10Error;
};
export default web10;
//# sourceMappingURL=browser.d.ts.map