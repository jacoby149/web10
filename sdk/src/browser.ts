/**
 * web10 browser SDK — v3 only, IIFE bundle for vanilla JS demos.
 *
 * When bundled as IIFE, attaches everything to `window.web10`:
 *   window.web10.createV3Client
 *   window.web10.openAuthPortal
 *   window.web10.authListen
 *   window.web10.readTokenCookie, etc.
 */

import { createV3Client as _createV3Client, type V3Client, type V3CR } from './v3'
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

// Track the last opened auth popup so contractRequest can reuse it
let _authPopup: Window | null = null
// Track if we received auth_ready from the popup
let _popupReady = false
// Track the ready listener so we can clean it up
let _readyListener: ((e: MessageEvent) => void) | null = null

/**
 * Open the web10 auth portal in a popup window.
 * Sets up the auth_ready listener immediately — the popup sends auth_ready
 * once on mount, then the app sends its contract.
 */
function openAuthPortal(authOrigin: string): Window | null {
  const url = `${authOrigin}?redirect=${encodeURIComponent(window.location.href)}`
  _authPopup = window.open(
    url,
    'web10-auth',
    'width=480,height=720,scrollbars=yes',
  )
  _popupReady = false
  // Clean up old listener
  if (_readyListener) {
    window.removeEventListener('message', _readyListener)
  }
  // Listen for auth_ready — popup sends it once on mount
  _readyListener = (e: MessageEvent) => {
    if (e.data?.type === 'auth_ready') {
      _popupReady = true
    }
  }
  window.addEventListener('message', _readyListener)
  return _authPopup
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

/**
 * Create a v3 client with contractRequest patched to reuse the auth popup
 * when it's still open (avoiding a second popup that gets blocked).
 */
function createV3Client(options?: Parameters<typeof _createV3Client>[0]): V3Client {
  const client = _createV3Client(options)
  const originalContractRequest = client.contractRequest

  client.contractRequest = function (
    contracts: V3CR[],
    authOrigin: string,
    callback?: (response: { status: string; errors?: string[] }) => void,
  ): void {
    const popup = _authPopup
    if (popup && !popup.closed) {
      // Reuse existing auth popup — wait for auth_ready (sent once on popup mount)
      // before sending the contract.
      let contractSent = false
      const responseHandler = (e: MessageEvent) => {
        if (e.data?.type === 'contract_response') {
          window.removeEventListener('message', responseHandler)
          window.removeEventListener('message', readyHandler)
          clearTimeout(timeoutId)
          callback?.(e.data)
        }
      }
      window.addEventListener('message', responseHandler)

      const readyHandler = (e: MessageEvent) => {
        if (e.data?.type === 'auth_ready' && !contractSent) {
          contractSent = true
          window.removeEventListener('message', readyHandler)
          console.log('[sdk] auth_ready received, sending contract')
          try {
            popup.postMessage({ type: 'contract', contracts }, '*')
          } catch {
            window.removeEventListener('message', responseHandler)
            clearTimeout(timeoutId)
            callback?.({ status: 'error', errors: ['Failed to send contract to auth UI'] })
          }
        }
      }
      window.addEventListener('message', readyHandler)

      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', responseHandler)
        window.removeEventListener('message', readyHandler)
        if (!contractSent) {
          callback?.({ status: 'error', errors: ['Auth popup closed — request cancelled'] })
        }
      }, 30000)
      return
    }

    // No existing popup — fall back to opening a new one
    originalContractRequest.call(this, contracts, authOrigin, callback)
  }

  return client
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