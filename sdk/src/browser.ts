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
function openAuthPortal(authOrigin: string, options: { handoff?: 'token' | 'none' } = {}): Window | null {
  // Tell the popup who the opener is acting as, so it can detect a session
  // mismatch (its own cookie's user ≠ the opener's user) instead of silently
  // acting for the wrong user. Only present when the opener has a token.
  const token = readTokenCookie()
  const decoded = token ? decodeJwt(token) : null
  const as = decoded?.username ? `&as=${encodeURIComponent(decoded.username)}` : ''
  // D42: handoff=none marks a consent-only popup (e.g. the lazy group contract)
  // — the opener already holds the token, so the popup approves the contract
  // and closes without re-sending the token.
  const handoff = options.handoff === 'none' ? '&handoff=none' : ''
  const url = `${authOrigin}?redirect=${encodeURIComponent(window.location.href)}${as}${handoff}`
  console.log('[wapi] openAuthPortal — opening popup:', url, 'as:', decoded?.username || '(none)', 'handoff:', options.handoff || 'token')
  _authPopup = window.open(
    url,
    'web10-auth',
    'width=480,height=720,scrollbars=yes',
  )
  console.log('[wapi] openAuthPortal — popup returned:', _authPopup ? 'open' : 'blocked/null')
  _popupReady = false
  // Clean up old listener
  if (_readyListener) {
    window.removeEventListener('message', _readyListener)
    console.log('[wapi] openAuthPortal — removed old auth_ready listener')
  }
  // Listen for auth_ready — popup sends it once on mount
  _readyListener = (e: MessageEvent) => {
    if (e.data?.type === 'auth_ready') {
      console.log('[wapi] message event received — type: auth_ready, source:', e.source, 'origin:', e.origin)
      _popupReady = true
      console.log('[wapi] auth_ready — popup is ready, flag set')
    }
  }
  window.addEventListener('message', _readyListener)
  console.log('[wapi] openAuthPortal — auth_ready listener attached')
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
      // Identity check (D42 + the cookie-torture anti-tests): the popup acts for
      // its OWN cookie's user. If that user differs from the one this app is
      // already acting as, storing the token would silently hijack the app's
      // identity. Reject it — the app keeps its current user. A first login
      // (no current token) always accepts.
      const incoming = decodeJwt(e.data.token)
      const current = readTokenCookie()
      const currentDecoded = current ? decodeJwt(current) : null
      if (
        currentDecoded?.username &&
        incoming?.username &&
        currentDecoded.username !== incoming.username
      ) {
        console.warn(
          '[wapi] auth event — token user mismatch (current:',
          currentDecoded.username,
          ', incoming:',
          incoming.username,
          ') — rejecting to prevent identity hijack',
        )
        return
      }
      console.log('[wapi] auth event received from popup, setting token cookie')
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
    console.log('[wapi] contractRequest — called with', contracts.length, 'contract(s):', JSON.stringify(contracts))

    // Return-run fast path: if all contracts already exist AND no popup is
    // open, skip the popup entirely. The user already consented — re-asking
    // is a UX bug. If a popup IS open (from openAuthPortal), use the normal
    // flow — the popup handles the existing session.
    const token = readTokenCookie()
    if (token && !(_authPopup && !_authPopup.closed)) {
      checkExistingContracts(client, contracts, token).then((allExist) => {
        if (allExist) {
          console.log('[wapi] contractRequest — all contracts already exist, skipping popup')
          callback?.({ status: 'approved' })
          return
        }
        doContractRequest()
      }).catch(() => {
        // Check failed (network, etc.) — fall through to normal popup flow
        doContractRequest()
      })
      return
    }

    doContractRequest()

    function doContractRequest() {
    const popup = _authPopup
    if (popup && !popup.closed) {
      console.log('[wapi] contractRequest — reusing existing popup (not closed)')
      let contractSent = false
      let readyHandler: ((e: MessageEvent) => void) | null = null
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const responseHandler = (e: MessageEvent) => {
        if (e.data?.type === 'contract_response') {
          console.log('[wapi] contract_response received:', e.data)
          window.removeEventListener('message', responseHandler)
          if (readyHandler) window.removeEventListener('message', readyHandler)
          if (timeoutId) clearTimeout(timeoutId)
          callback?.(e.data)
        }
      }
      window.addEventListener('message', responseHandler)
      console.log('[wapi] contractRequest — contract_response listener attached')

      const sendContract = () => {
        contractSent = true
        if (readyHandler) {
          const eh = readyHandler
          window.removeEventListener('message', eh)
        }
        if (timeoutId) clearTimeout(timeoutId)
        console.log('[wapi] contractRequest — sending contract to popup')
        try {
          popup.postMessage({ type: 'contract', contracts }, '*')
          console.log('[wapi] contractRequest — contract sent via postMessage')
        } catch (err) {
          console.error('[wapi] postMessage to popup failed:', err)
          window.removeEventListener('message', responseHandler)
          callback?.({ status: 'error', errors: ['Failed to send contract to auth UI'] })
        }
      }

      // If we already got auth_ready from a previous contractRequest, send immediately
      if (_popupReady) {
        console.log('[wapi] contractRequest — popup already ready, sending immediately')
        sendContract()
        return
      }

      // Otherwise wait for auth_ready
      readyHandler = (e: MessageEvent) => {
        if (e.data?.type === 'auth_ready' && !contractSent) {
          console.log('[wapi] auth_ready received, sending contract to popup')
          sendContract()
        }
      }
      window.addEventListener('message', readyHandler)
      console.log('[wapi] contractRequest — auth_ready listener attached, waiting for popup signal')

      timeoutId = setTimeout(() => {
        console.warn('[wapi] contractRequest — 30s timeout reached, contractSent:', contractSent)
        window.removeEventListener('message', responseHandler)
        if (readyHandler) {
          const eh = readyHandler
          window.removeEventListener('message', eh)
        }
        if (!contractSent) {
          callback?.({ status: 'error', errors: ['Auth popup closed — request cancelled'] })
        }
      }, 30000)
      return
    }

    // No existing popup — fall back to opening a new one
    console.log('[wapi] contractRequest — no existing popup, opening new one')
    originalContractRequest(contracts, authOrigin, callback)
    }
  }

  return client
}

/**
 * Check if all contracts already exist (return-run fast path).
 * Returns true if every contract is already on record — the user
 * previously consented, so the popup can be skipped.
 */
async function checkExistingContracts(
  client: V3Client,
  contracts: V3CR[],
  _token: string,
): Promise<boolean> {
  for (const c of contracts) {
    if (c.kind === 'app') {
      const list = await client.listAppContracts()
      const origin = c.app_origin as string
      if (!list.some((ac) => ac.allowed_origin === origin)) return false
    } else if (c.kind === 'group') {
      const token = readTokenCookie()
      const decoded = token ? decodeJwt(token) : null
      const username = decoded?.username as string | undefined
      const provider = decoded?.provider as string | undefined
      if (!username || !provider) return false
      const groupName = c.name as string
      const groupId = `${provider}/groups/users/${username}/${groupName.toLowerCase().replace(/ /g, '-')}`
      try {
        await client.getGroup(groupId)
      } catch {
        return false
      }
    }
  }
  return true
}

/**
 * Close the auth popup (called by the app after all contracts are done).
 */
function closeAuthPopup(): void {
  if (_authPopup && !_authPopup.closed) {
    console.log('[wapi] closeAuthPopup — sending close_popup to popup')
    _authPopup.postMessage({ type: 'close_popup' }, '*')
  }
}

// ── Attach to window ────────────────────────────────────────────────────────

const web10 = {
  createV3Client,
  openAuthPortal,
  authListen,
  closeAuthPopup,
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