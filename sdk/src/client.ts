/**
 * The core web10 client.
 *
 * Provides typed CRUD operations, aggregate queries, token management,
 * auth flow helpers, SMR (Service Modification Request), and dev pay.
 *
 * @example
 * ```ts
 * import { createClient } from 'web10-npm'
 *
 * const w = createClient({ authUrl: 'https://auth.web10.app' })
 *
 * // Open auth popup and wait for login
 * await w.login()
 *
 * // Typed CRUD
 * const posts = await w.read<Post>('posts', { $sort: { created_at: -1 } })
 * const id = await w.create('posts', { text: 'hello web10' })
 * await w.update('posts', { _id }, { $set: { text: 'updated' } })
 * await w.delete('posts', { _id })
 *
 * // Aggregate
 * const stats = await w.aggregate('posts', [
 *   { $group: { _id: '$tag', count: { $sum: 1 } } },
 *   { $sort: { count: -1 } },
 * ])
 * ```
 */

import type {
  QueryOptions,
  UpdateSpec,
  Web10Record,
  Pipeline,
  ClientOptions,
  ClientState,
  SIR,
  SCR,
  CheckoutParams,
  SubscriptionParams,
  CreateResponse,
  UpdateResponse,
  DeleteResponse,
  TokenResponse,
  TokenPayload,
  PlanInfo,
} from './types'
import { decodeJwt, readTokenCookie, setTokenCookie, scrubTokenCookie } from './token'
import { patch, post, put, del, aggregate as aggregateReq, authPost } from './http'

/**
 * Create a web10 client instance.
 *
 * @param options - Configuration options
 * @returns A configured web10 client
 */
export function createClient(options: ClientOptions = {}): Web10Client {
  const authUrl = options.authUrl ?? 'https://auth.web10.app'
  const protocol = new URL(authUrl).protocol
  const apiOrigin = options.apiOrigin ?? `${protocol}//api.web10.app`
  // The only origin trusted to deliver tokens / SMR messages over
  // postMessage. Cross-window messages from any other origin are ignored
  // so a malicious opener/embedder can't inject or fixate a token.
  const authOrigin = new URL(authUrl).origin
  const rtcServer = options.rtcServer ?? 'rtc.web10.app'
  const appStores = options.appStores ?? ['https://api.web10.app']

  const state: ClientState = {
    apiOrigin,
    authUrl,
    token: readTokenCookie(),
    rtcServer,
    appStores,
  }

  const client: Web10Client = {
    get state() {
      return { ...state }
    },

    // ── Token management ──────────────────────────────────────────────

    setToken(token: string): void {
      state.token = token
      setTokenCookie(token)
    },

    scrubToken(): void {
      state.token = null
      scrubTokenCookie()
    },

    readToken(): TokenPayload | null {
      return decodeJwt(state.token)
    },

    isSignedIn(): boolean {
      return state.token != null && state.token !== ''
    },

    signOut(): void {
      this.scrubToken()
    },

    // ── Auth flow ─────────────────────────────────────────────────────

    openAuthPortal(): Window | null {
      if (typeof window === 'undefined') return null
      return window.open(state.authUrl, '_blank')
    },

    login(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        if (typeof window === 'undefined') {
          reject(new Error('login() requires a browser environment'))
          return
        }
        this.openAuthPortal()
        const handler = (e: MessageEvent) => {
          if (e.origin !== authOrigin) return
          if (e.data?.type === 'auth') {
            if (e.data.token) {
              this.setToken(e.data.token)
            } else {
              this.scrubToken()
            }
            window.removeEventListener('message', handler)
            resolve()
          }
        }
        window.addEventListener('message', handler)
        // Timeout after 5 minutes
        setTimeout(() => {
          window.removeEventListener('message', handler)
          reject(new Error('Login timed out'))
        }, 5 * 60 * 1000)
      })
    },

    authListen(setAuth: (signedIn: boolean) => void): void {
      if (typeof window === 'undefined') return
      window.addEventListener('message', (e) => {
        if (e.origin !== authOrigin) return
        if (e.data?.type === 'auth') {
          if (e.data.token) {
            this.setToken(e.data.token)
          } else {
            this.scrubToken()
          }
          setAuth(this.isSignedIn())
        }
      })
    },

    // ── CRUD ──────────────────────────────────────────────────────────

    read<T = Record<string, unknown>>(
      service: string,
      query?: QueryOptions | null,
      username?: string | null,
      provider?: string | null,
    ): Promise<Web10Record<T>[]> {
      guardAuth(state, username)
      const u = resolveUsername(state, username)
      const base = originFor(state, provider)
      return patch<Web10Record<T>[]>(
        `${base}/${u}/${service}`,
        { token: state.token, query: query ?? null, update: null },
      )
    },

    create<T = Record<string, unknown>>(
      service: string,
      body?: QueryOptions | null,
      username?: string | null,
      provider?: string | null,
    ): Promise<CreateResponse> {
      guardAuth(state, username)
      const u = resolveUsername(state, username)
      const base = originFor(state, provider)
      return post<CreateResponse>(
        `${base}/${u}/${service}`,
        { token: state.token, query: body ?? null, update: null },
      )
    },

    update(
      service: string,
      query: QueryOptions | null,
      update: UpdateSpec | null,
      username?: string | null,
      provider?: string | null,
    ): Promise<UpdateResponse> {
      guardAuth(state, username)
      const u = resolveUsername(state, username)
      const base = originFor(state, provider)
      return put<UpdateResponse>(
        `${base}/${u}/${service}`,
        { token: state.token, query: query ?? null, update: (update ?? null) as Record<string, unknown> | null },
      )
    },

    deleteRecord(
      service: string,
      query?: QueryOptions | null,
      username?: string | null,
      provider?: string | null,
    ): Promise<DeleteResponse> {
      guardAuth(state, username)
      const u = resolveUsername(state, username)
      const base = originFor(state, provider)
      return del<DeleteResponse>(
        `${base}/${u}/${service}`,
        { token: state.token, query: query ?? null, update: null },
      )
    },

    aggregate<T = Record<string, unknown>>(
      service: string,
      pipeline: Pipeline = [],
      username?: string | null,
      provider?: string | null,
    ): Promise<T[]> {
      guardAuth(state, username)
      const u = resolveUsername(state, username)
      const base = originFor(state, provider)
      return aggregateReq<T>(
        `${base}/${u}/${service}/aggregate`,
        { token: state.token, pipeline },
      )
    },

    // ── Tiered tokens ─────────────────────────────────────────────────

    getTieredToken(
      site: string,
      target: string,
    ): Promise<TokenResponse> {
      const token = this.readToken()
      if (!token) throw new Error('No token available for tiered mint')
      return authPost<TokenResponse>(
        `${apiOrigin}/web10token`,
        {
          username: token.username,
          password: null,
          token: state.token,
          site,
          target,
        },
      )
    },

    // ── SMR (Service Modification Request) ────────────────────────────

    smrOnReady(sirs: SIR[], scrs?: SCR[]): void {
      if (typeof window === 'undefined') return
      window.addEventListener('message', (e) => {
        if (e.origin !== authOrigin) return
        if (e.data?.type === 'SMRListen' && e.source instanceof Window) {
          e.source.postMessage({ type: 'smr', sirs, scrs }, authOrigin)
        }
      })
    },

    smrResponseListen(setStatus: (status: string) => void): void {
      if (typeof window === 'undefined') return
      window.addEventListener('message', (e) => {
        if (e.origin !== authOrigin) return
        if (e.data?.type === 'status') {
          setStatus(e.data.status)
        }
      })
    },

    // ── Dev Pay ───────────────────────────────────────────────────────

    checkout(params: CheckoutParams): Promise<void> {
      const token = this.readToken()
      if (!token) throw new Error('Must be signed in for checkout')
      return authPost<{ url: string }>(
        `${apiOrigin}/dev_pay`,
        {
          token: state.token!,
          seller: params.seller,
          title: params.title,
          price: params.price,
          success_url: params.success_url,
          cancel_url: params.cancel_url,
        },
      ).then((res) => {
        if (typeof window !== 'undefined') {
          window.location.href = res.url
        }
      })
    },

    verifySubscription(params: SubscriptionParams): Promise<{ active: boolean }> {
      const token = this.readToken()
      if (!token) throw new Error('Must be signed in')
      return authPost<{ active: boolean }>(
        `${apiOrigin}/dev_pay`,
        {
          token: state.token!,
          seller: params.seller,
          title: params.title,
          price: null,
        },
      )
    },

    cancelSubscription(params: SubscriptionParams): Promise<{ cancelled: boolean }> {
      const token = this.readToken()
      if (!token) throw new Error('Must be signed in')
      return authPost<{ cancelled: boolean }>(
        `${apiOrigin}/dev_pay`,
        {
          token: state.token!,
          seller: params.seller,
          title: params.title,
        },
      )
    },
  }

  // Register app with app stores (best-effort)
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined' && typeof window.location.href === 'string') {
    for (const appStore of appStores) {
      try {
        fetch(`${appStore}/register_app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: window.location.href.split('?')[0] }),
        }).catch(() => {})
      } catch {
        // fetch not available (SSR, test env)
      }
    }
  }

  return client
}

/**
 * The web10 client interface.
 */
export interface Web10Client {
  state: ClientState

  // Token management
  setToken(token: string): void
  scrubToken(): void
  readToken(): TokenPayload | null
  isSignedIn(): boolean
  signOut(): void

  // Auth flow
  openAuthPortal(): Window | null
  login(): Promise<void>
  authListen(setAuth: (signedIn: boolean) => void): void

  // CRUD
  read<T = Record<string, unknown>>(
    service: string,
    query?: QueryOptions | null,
    username?: string | null,
    provider?: string | null,
  ): Promise<Web10Record<T>[]>
  create<T = Record<string, unknown>>(
    service: string,
    body?: QueryOptions | null,
    username?: string | null,
    provider?: string | null,
  ): Promise<CreateResponse>
  update(
    service: string,
    query: QueryOptions | null,
    update: UpdateSpec | null,
    username?: string | null,
    provider?: string | null,
  ): Promise<UpdateResponse>
  deleteRecord(
    service: string,
    query?: QueryOptions | null,
    username?: string | null,
    provider?: string | null,
  ): Promise<DeleteResponse>
  aggregate<T = Record<string, unknown>>(
    service: string,
    pipeline?: Pipeline,
    username?: string | null,
    provider?: string | null,
  ): Promise<T[]>

  // Tiered tokens
  getTieredToken(site: string, target: string): Promise<TokenResponse>

  // SMR
  smrOnReady(sirs: SIR[], scrs?: SCR[]): void
  smrResponseListen(setStatus: (status: string) => void): void

  // Dev Pay
  checkout(params: CheckoutParams): Promise<void>
  verifySubscription(params: SubscriptionParams): Promise<{ active: boolean }>
  cancelSubscription(params: SubscriptionParams): Promise<{ cancelled: boolean }>
}

// ── Helpers ────────────────────────────────────────────────────────────────

function guardAuth(state: ClientState, username: string | null | undefined): void {
  if ((!username && !state.token) || username === 'anon') {
    throw new Error('Cannot perform CRUD without authentication')
  }
  if (!state.token) {
    throw new Error('No token available. Call login() or setToken() first.')
  }
}

/**
 * Resolve which node origin to address.
 *
 * In web10 a user's `provider` IS the host of the node that stores their
 * collection (see `settings.PROVIDER` == the api host), so addressing a
 * user on another provider means sending the request to that provider's
 * origin. When no provider is given we hit the configured `apiOrigin` —
 * byte-identical to the previous behaviour, so single-node callers and
 * explicit `apiOrigin` overrides (e.g. a proxy) are unaffected.
 */
function originFor(state: ClientState, provider: string | null | undefined): string {
  if (!provider) return state.apiOrigin
  const protocol = new URL(state.apiOrigin).protocol
  return `${protocol}//${provider}`
}

function resolveUsername(state: ClientState, username: string | null | undefined): string {
  if (username) return username
  const token = decodeJwt(state.token)
  if (!token?.username) throw new Error('No username in token')
  return token.username
}
