/**
 * Legacy compatibility shim — re-exports `wapiInit` and `wapiAuthInit`
 * so apps using the old SDK API continue to work against the new typed SDK.
 *
 * Usage (unchanged for consumers):
 *   import { wapiInit, wapiAuthInit } from 'web10-npm'
 */

import { createClient } from './client'
import { createAuthConnector } from './auth'
import type { PipelineStage } from './types'

// Lazy PeerJS import — optional, only needed for P2P
let PeerCtor: { new (id: string, opts: Record<string, unknown>): unknown } | null = null
if (typeof window !== 'undefined' && typeof (window as any).Peer !== 'undefined') {
  PeerCtor = (window as any).Peer
}

// ── wapiInit ────────────────────────────────────────────────────────────────

/**
 * Legacy wapiInit — returns the same shape as the old JS SDK.
 */
export function wapiInit(
  authUrl = 'https://auth.web10.app',
  appStores: string[] = ['https://api.web10.app'],
  rtcServer = 'rtc.web10.app',
): Record<string, unknown> {
  const protocol = new URL(authUrl).protocol
  const apiOrigin = appStores[0] ?? `${protocol}//api.web10.app`

  const client = createClient({ authUrl, apiOrigin, rtcServer, appStores })

  let childWindow: Window | null = null

  // P2P state (mirrors old SDK)
  const outBound: Record<string, unknown> = {}
  const inBound: Record<string, unknown> = {}

  const wapi: Record<string, unknown> = {
    APIProtocol: protocol,
    apiOrigin,
    authUrl,
    childWindow: null,
    get token() { return client.state.token },
    setToken: (t: string) => { client.setToken(t) },
    scrubToken: () => { client.scrubToken() },
    isSignedIn: () => client.isSignedIn(),
    signOut: () => client.signOut(),
    readToken: () => client.readToken(),

    openAuthPortal: () => {
      childWindow = client.openAuthPortal()
      wapi.childWindow = childWindow
      return childWindow
    },

    authListen: (setAuth: (signedIn: boolean) => void) => {
      client.authListen(setAuth)
    },

    // CRUD — returns promises (like old SDK, but with native fetch instead of axios)
    read: (service: string, query?: unknown, username?: string, provider?: string) =>
      client.read(service, query as Parameters<typeof client.read>[1], username, provider),
    create: (service: string, body?: unknown, username?: string, provider?: string) =>
      client.create(service, body as Parameters<typeof client.create>[1], username, provider),
    update: (service: string, query?: unknown, update?: unknown, username?: string, provider?: string) =>
      client.update(service, query as Parameters<typeof client.update>[1], update as Parameters<typeof client.update>[2], username, provider),
    delete: (service: string, query?: unknown, username?: string, provider?: string) =>
      client.deleteRecord(service, query as Parameters<typeof client.deleteRecord>[1], username, provider),
    aggregate: (service: string, pipeline: unknown[] = [], username?: string, provider?: string) =>
      client.aggregate(service, pipeline as PipelineStage[], username, provider),

    // Tiered tokens
    getTieredToken: (site: string, target: string) =>
      client.getTieredToken(site, target),

    // Contract Listen
    ContractOnReady: (contracts: unknown[]) => {
      if (typeof window === 'undefined') return
      const authOrigin = new URL(authUrl).origin
      window.addEventListener('message', (e) => {
        if (e.origin !== authOrigin) return
        if (e.data?.type === 'ContractListen' && childWindow) {
          childWindow.postMessage({ type: 'contract', contracts }, authOrigin)
        }
      })
    },
    ContractResponseListen: (setStatus: (status: string) => void) => {
      client.contractResponseListen(setStatus)
    },

    // P2P
    peer: null as unknown,
    outBound,
    inBound,
    peerID: (provider: string, user: string, origin: string, label: string = '') =>
      `${provider} ${user} ${origin} ${label}`.replaceAll('.', '_'),

    initP2P: function (this: any, onInbound?: unknown, label = '', secure = true) {
      if (!PeerCtor) {
        throw new Error('PeerJS is not installed. Install peerjs or use the new SDK rtc module.')
      }
      const token = client.readToken()
      if (!token) throw new Error('Cannot init P2P without a token')
      const id = this.peerID(token.provider, token.username, token.site, label)
      const peer = new PeerCtor(id, {
        host: rtcServer,
        secure,
        port: secure ? 443 : 80,
        path: '/',
        token: `${client.state.token}~${label}`,
      })
      wapi.peer = peer
      if (onInbound && typeof onInbound === 'function') {
        ;(peer as any).on('connection', (conn: any) => {
          inBound[conn.peer] = conn
          conn.on('data', (data: unknown) => onInbound(conn, data))
          conn.on('close', () => delete inBound[conn.peer])
        })
      }
    },

    P2P: function (this: any, provider: string, username: string, origin: string, label: string = '') {
      if (!wapi.peer) throw new Error('P2P not initialized')
      const id = this.peerID(provider, username, origin, label)
      if (!outBound[id]) {
        const conn = (wapi.peer as any).connect(id)
        outBound[conn.peer] = conn
        conn.on('close', () => delete outBound[conn.peer])
      }
      return outBound[id]
    },

    send: function (this: any, provider: string, username: string, origin: string, label: string, data: unknown) {
      const conn: any = this.P2P(provider, username, origin, label)
      if (conn.open) {
        conn.send(data)
        return { connected: true }
      } else {
        conn.on('open', () => conn.send(data))
        return { connected: false }
      }
    },

    // Dev Pay
    checkout: (seller: string, title: string, price: number, success_url: string, cancel_url: string) =>
      client.checkout({ seller, title, price, success_url, cancel_url }),
    verifySubscription: (seller: string, title: string) =>
      client.verifySubscription({ seller, title }),
    cancelSubscription: (seller: string, title: string) =>
      client.cancelSubscription({ seller, title }),
  }

  return wapi
}

// ── wapiAuthInit ─────────────────────────────────────────────────────────────

/**
 * Legacy wapiAuthInit — wraps the new auth connector to match the old API.
 */
export function wapiAuthInit(wapi: Record<string, unknown>): Record<string, unknown> {
  // Use the authUrl and apiOrigin from the wapi object passed in (which was
  // already configured correctly by wapiInit for local/dev/prod), instead of
  // hardcoding auth.web10.app / api.web10.app.
  const authUrl = (wapi.authUrl as string) ?? `${wapi.APIProtocol}//auth.web10.app`
  const apiOrigin = (wapi.apiOrigin as string) ?? undefined
  const client = createClient({ authUrl, apiOrigin })
  // Sync token from wapi
  if (typeof wapi.token === 'string' && wapi.token) {
    client.setToken(wapi.token)
  }
  // Keep tokens in sync
  const origSetToken = wapi.setToken as (t: string) => void
  const origScrubToken = wapi.scrubToken as () => void
  ;(wapi as any).setToken = (t: string) => {
    origSetToken(t)
    client.setToken(t)
  }
  ;(wapi as any).scrubToken = () => {
    origScrubToken()
    client.scrubToken()
  }

  const connector = createAuthConnector(client)
  let oAuthToken = connector.oAuthToken

  const wapiAuth: Record<string, unknown> = {
    get oAuthToken() { return oAuthToken },

    mintOAuthToken: async () => {
      oAuthToken = await connector.mintOAuthToken()
      return oAuthToken
    },

    sendToken: () => {
      connector.sendToken()
    },

    logIn: (provider: string, username: string, password: string) => {
      return connector.logIn({ provider, username, password })
    },

    signUp: (provider: string, username: string, password: string, betacode?: string, phone?: string) => {
      return connector.signUp({ provider, username, password, betacode: betacode ?? undefined, phone: phone ?? undefined })
    },

    contractListen: (setState: (data: unknown) => void) => {
      connector.contractListen(setState)
    },

    changePass: (pass: string, newPass: string) =>
      connector.changePassword(pass, newPass),
    changePhone: (pass: string, newPhone: string) =>
      connector.changePhone(pass, newPhone),

    sendCode: () => connector.sendCode(),
    verifyCode: (code: string) => connector.verifyCode(code),

    manageSpace: () => connector.manageSpace(),
    manageCredits: () => connector.manageCredits(),
    manageBusiness: () => connector.manageBusiness(),
    manageSubscriptions: () => connector.manageSubscriptions(),
    businessLogin: () => connector.businessLogin(),
    getPlan: () => connector.getPlan(),
  }

  // Auto-mint OAuth token on init if signed in and there's a referrer
  if (typeof wapi.isSignedIn === 'function' && (wapi.isSignedIn as () => boolean)() && typeof document !== 'undefined' && document.referrer) {
    ;(wapiAuth.mintOAuthToken as () => Promise<string | null>)().catch(() => {})
  }

  return wapiAuth
}

// ── CDN compat ──────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  ;(window as any).wapiInit = wapiInit
  ;(window as any).wapiAuthInit = wapiAuthInit
}
