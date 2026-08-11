/**
 * web10 browser SDK — v3 only, IIFE bundle for vanilla JS demos.
 *
 * When bundled as IIFE, attaches everything to `window.web10`:
 *   window.web10.createV3Client
 *   window.web10.openAuthPortal
 *   window.web10.authListen
 *   window.web10.readTokenCookie, etc.
 */

import { createV3Client } from './v3'
import {
  cookieDict,
  readTokenCookie,
  setTokenCookie,
  scrubTokenCookie,
  decodeJwt,
  isTokenExpired,
} from './token'
import { Web10Error } from './http'

// ── Popup auth helpers (browser-only) ───────────────────────────────────────

/**
 * Open the web10 auth portal in a popup window.
 */
function openAuthPortal(authOrigin: string): Window | null {
  const url = `${authOrigin}?redirect=${encodeURIComponent(window.location.href)}`
  return window.open(
    url,
    'web10-auth',
    'width=480,height=720,scrollbars=yes',
  )
}

/**
 * Listen for auth events from the popup.
 */
function authListen(
  onSignedIn: (signedIn: boolean) => void,
): () => void {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'auth' && e.data?.token) {
      setTokenCookie(e.data.token)
      onSignedIn(true)
    }
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

// ── Attach to window ────────────────────────────────────────────────────────

const web10 = {
  createV3Client,
  openAuthPortal,
  authListen,
  cookieDict,
  readTokenCookie,
  setTokenCookie,
  scrubTokenCookie,
  decodeJwt,
  isTokenExpired,
  Web10Error,
}

// @ts-ignore — browser global
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.web10 = web10
}

export default web10