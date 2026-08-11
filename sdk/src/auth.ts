/**
 * Authenticator connector — for the web10 auth app (e.g. auth.web10.app).
 *
 * Wraps the popup/OAuth dance into promise-based flows. Used by the
 * authenticator UI to manage login, signup, token minting, contracts, and
 * account management endpoints.
 *
 * @example
 * ```ts
 * import { createClient } from 'web10-npm'
 * import { createAuthConnector } from 'web10-npm/auth'
 *
 * const w = createClient({ authUrl: 'https://auth.web10.app' })
 * const auth = createAuthConnector(w)
 *
 * // Login
 * await auth.logIn({ provider: 'api.web10.app', username: 'alice', password: 'secret' })
 *
 * // Mint a tiered token for the referrer
 * const tieredToken = await auth.mintOAuthToken()
 *
 * // Send it back to the opener
 * auth.sendToken()
 * ```
 */

import type {
  LoginParams,
  SignupParams,
  PlanInfo,
  TokenPayload,
} from './types'
import type { Web10Client } from './client'
import { authPost } from './http'
import { decodeJwt } from './token'

/**
 * Create an authenticator connector.
 *
 * @param wapi - A web10 client instance
 * @returns An auth connector with login, signup, and token management
 */
export function createAuthConnector(wapi: Web10Client): AuthConnector {
  let oAuthToken: string | null = null

  const api = (): string => {
    return wapi.state.apiOrigin
  }

  /**
   * The origin of the app that opened this authenticator window, derived
   * from the referrer (the same source `mintOAuthToken` scopes the token
   * to). Cross-window messages are posted ONLY here — never to `'*'` — so
   * a minted bearer token can't leak to an origin the opener navigated to.
   * Returns `null` when there's no trustworthy referrer, in which case we
   * refuse to post rather than broadcast.
   */
  const openerOrigin = (): string | null => {
    if (typeof document === 'undefined' || !document.referrer) return null
    try {
      return new URL(document.referrer).origin
    } catch {
      return null
    }
  }

  const connector: AuthConnector = {
    get oAuthToken() {
      return oAuthToken
    },

    // ── OAuth token minting ───────────────────────────────────────────

    async mintOAuthToken(): Promise<string | null> {
      const tokenData = wapi.readToken()
      if (!tokenData) {
        oAuthToken = null
        return null
      }
      if (typeof document === 'undefined' || !document.referrer) {
        oAuthToken = null
        return null
      }
      try {
        const referrerURL = new URL(document.referrer)
        const res = await wapi.getTieredToken(referrerURL.hostname, tokenData.provider)
        oAuthToken = res.token
        return oAuthToken
      } catch (err) {
        console.error('web10: minting a token for the referrer app failed', err)
        oAuthToken = null
        return null
      }
    },

    sendToken(): void {
      if (typeof window === 'undefined' || !window.opener) return
      const target = openerOrigin()
      if (!target) return
      window.opener.postMessage(
        { type: 'auth', token: oAuthToken },
        target,
      )
      window.close()
    },

    // ── Login / Signup ────────────────────────────────────────────────

    async logIn(params: LoginParams): Promise<void> {
      const res = await authPost<{ token: string }>(
        `${api()}/v3/login`,
        {
          token: '',
          body: {
            username: params.username,
            password: params.password,
          },
        },
      )
      wapi.setToken(res.token)
      await this.mintOAuthToken()
    },

    async signUp(params: SignupParams): Promise<void> {
      await authPost<{ ok: boolean }>(
        `${api()}/v3/signup`,
        {
          token: '',
          body: {
            username: params.username,
            password: params.password,
            phone: params.phone ?? '',
          },
        },
      )
    },

    // ── Contract Listen ───────────────────────────────────────────────────────
    /** Listen for contract messages (app + group) from the opener */

    contractListen(setState: (data: unknown) => void): void {
      if (typeof window === 'undefined' || !window.opener) return
      const target = openerOrigin()
      if (!target) return
      window.addEventListener('message', (e) => {
        if (e.origin !== target) return
        if (e.data?.type === 'contract') {
          setState(e.data)
        }
      })
      window.opener.postMessage({ type: 'ContractListen' }, target)
    },

    // ── ACR ───────────────────────────────────────────────────────────

    acrListen(setState: (data: unknown) => void): void {
      if (typeof window === 'undefined' || !window.opener) return
      const target = openerOrigin()
      if (!target) return
      window.addEventListener('message', (e) => {
        if (e.origin !== target) return
        if (e.data?.type === 'acr') {
          setState(e.data)
        }
      })
      window.opener.postMessage({ type: 'ACRListen' }, target)
    },

    // ── Account management ────────────────────────────────────────────

    async changePassword(_currentPassword: string, newPassword: string): Promise<void> {
      const token = wapi.readToken()
      if (!token) throw new Error('Not authenticated')
      await authPost<{ ok: boolean }>(
        `${api()}/v3/change-pass`,
        {
          token: wapi.state.token,
          body: { password: newPassword },
        },
      )
    },

    async changePhone(_password: string, phone: string): Promise<void> {
      const token = wapi.readToken()
      if (!token) throw new Error('Not authenticated')
      await authPost<{ ok: boolean }>(
        `${api()}/v3/change-phone`,
        {
          token: wapi.state.token,
          body: { phone },
        },
      )
    },

    // ── Verification codes ────────────────────────────────────────────

    async sendCode(): Promise<void> {
      await authPost<{ sent: boolean }>(
        `${api()}/v3/send_code`,
        { token: wapi.state.token },
      )
    },

    async verifyCode(code: string): Promise<void> {
      const token = wapi.readToken()
      if (!token) throw new Error('Not authenticated')
      await authPost<{ verified: boolean }>(
        `${api()}/v3/verify-phone`,
        {
          token: wapi.state.token,
          body: { code },
        },
      )
    },

    // ── Stripe management (v4 aspirational — not implemented in v3) ───

    async manageSpace(): Promise<{ url: string }> {
      throw new Error('Stripe management not available — payments are a v4 feature')
    },

    async manageCredits(): Promise<{ url: string }> {
      throw new Error('Stripe management not available — payments are a v4 feature')
    },

    async manageBusiness(): Promise<{ url: string }> {
      throw new Error('Stripe management not available — payments are a v4 feature')
    },

    async manageSubscriptions(): Promise<{ url: string }> {
      throw new Error('Stripe management not available — payments are a v4 feature')
    },

    async businessLogin(): Promise<{ url: string }> {
      throw new Error('Stripe management not available — payments are a v4 feature')
    },

    async getPlan(): Promise<PlanInfo> {
      throw new Error('Plan management not available — payments are a v4 feature')
    },
  }

  // Auto-mint OAuth token on init if signed in and there's a referrer
  if (wapi.isSignedIn() && typeof document !== 'undefined' && document.referrer) {
    connector.mintOAuthToken().catch(() => {})
  }

  return connector
}

/**
 * Authenticator connector interface.
 */
export interface AuthConnector {
  /** The minted OAuth token for the referrer app */
  readonly oAuthToken: string | null

  /** Mint a tiered token for the referrer site */
  mintOAuthToken(): Promise<string | null>
  /** Send the OAuth token back to the opener and close the window */
  sendToken(): void

  /** Log in with username/password */
  logIn(params: LoginParams): Promise<void>
  /** Sign up a new account */
  signUp(params: SignupParams): Promise<void>

  /** Listen for contract messages (app + group) from the opener */
  contractListen(setState: (data: unknown) => void): void

  /** Listen for ACR messages from the opener */
  acrListen(setState: (data: unknown) => void): void

  /** Change account password */
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  /** Change account phone number */
  changePhone(password: string, phone: string): Promise<void>

  /** Send a verification code to the user's phone */
  sendCode(): Promise<void>
  /** Verify a code */
  verifyCode(code: string): Promise<void>

  /** Get Stripe management URL for space */
  manageSpace(): Promise<{ url: string }>
  /** Get Stripe management URL for credits */
  manageCredits(): Promise<{ url: string }>
  /** Get Stripe management URL for business */
  manageBusiness(): Promise<{ url: string }>
  /** Get Stripe management URL for all subscriptions */
  manageSubscriptions(): Promise<{ url: string }>
  /** Get business login URL */
  businessLogin(): Promise<{ url: string }>
  /** Get current plan info */
  getPlan(): Promise<PlanInfo>
}