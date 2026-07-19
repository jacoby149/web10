import { wapiInit } from 'web10-npm';

// Thin typed wrapper around the legacy wapi.js SDK.
// All CRUD operations return the raw record body (no axios envelope).

export interface WapiToken {
  provider: string;
  username: string;
  site?: string;
  target?: string;
  expires?: number;
}

export interface WapiWrapper {
  // Auth
  isSignedIn: () => boolean;
  signOut: () => void;
  setToken: (token: string) => void;
  readToken: () => WapiToken | null;
  openAuthPortal: () => void;
  authListen: (callback: () => void) => void;

  // Typed CRUD — returns raw record body
  read: <T = Record<string, unknown>>(
    service: string,
    query?: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<T[]>;

  create: <T = Record<string, unknown>>(
    service: string,
    body: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<T>;

  update: <T = Record<string, unknown>>(
    service: string,
    query: Record<string, unknown>,
    update: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<T>;

  delete: (
    service: string,
    query: Record<string, unknown>,
    username?: string,
    provider?: string,
  ) => Promise<void>;

  // Aggregate (5th verb)
  aggregate: <T = Record<string, unknown>>(
    service: string,
    pipeline: unknown[],
    username?: string,
    provider?: string,
  ) => Promise<T[]>;

  // Media presigned URL
  getUploadUrl: (
    mimeType: string,
    sizeBytes: number,
  ) => Promise<{ uploadUrl: string; recordId: string; mediaRecord: Record<string, unknown> }>;

  // P2P (legacy, kept for existing chat)
  initP2P: (onInbound: (conn: unknown, data: unknown) => void, label: string) => void;
  sendP2P: (provider: string, username: string, origin: string, label: string, data: unknown) => void;
}

let instance: WapiWrapper | null = null;

export function createWapiWrapper(authUrl?: string, rtcServer?: string): WapiWrapper {
  if (instance) return instance;

  const queryParameters = new URLSearchParams(window.location.search);
  const local = queryParameters.get('local');
  const resolvedAuthUrl = authUrl ?? (local ? 'http://auth.localhost' : 'https://auth.web10.app');
  const resolvedRtcServer = rtcServer ?? (local ? 'rtc.localhost' : 'rtc.web10.app');

  const wapi = wapiInit(resolvedAuthUrl, undefined, resolvedRtcServer);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = wapi as any;

  const getToken = () => raw.token;
  const getProtocol = () => raw.APIProtocol || 'https:';

  const wrapper: WapiWrapper = {
    isSignedIn: () => raw.isSignedIn(),
    signOut: () => raw.signOut(),
    setToken: (t: string) => raw.setToken(t),
    readToken: () => {
      const t = raw.readToken();
      return t || null;
    },
    openAuthPortal: () => raw.openAuthPortal(),
    authListen: (cb: () => void) => raw.authListen(() => { cb(); }),

    async read<T>(service, query, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      // wapi.read uses PATCH
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query: query || {} }),
      });
      if (!resp.ok) throw new Error(`read failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T[];
    },

    async create<T>(service, body, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query: body }),
      });
      if (!resp.ok) throw new Error(`create failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T;
    },

    async update<T>(service, query, update, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query, update }),
      });
      if (!resp.ok) throw new Error(`update failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T;
    },

    async delete(service, query, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, query }),
      });
      if (!resp.ok) throw new Error(`delete failed: ${resp.status}`);
    },

    async aggregate<T>(service, pipeline, username, provider) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = provider || raw.readToken().provider;
      const u = username || raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/${u}/${service}/aggregate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pipeline }),
      });
      if (!resp.ok) throw new Error(`aggregate failed: ${resp.status}`);
      const json = await resp.json();
      return (json.data || json) as T[];
    },

    async getUploadUrl(mimeType, sizeBytes) {
      const token = getToken();
      if (!token) throw new Error('not authenticated');
      const proto = getProtocol();
      const p = raw.readToken().provider;
      const u = raw.readToken().username;
      const resp = await fetch(`${proto}//${p}/media/upload/${u}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mime_type: mimeType, size_bytes: sizeBytes }),
      });
      if (!resp.ok) throw new Error(`getUploadUrl failed: ${resp.status}`);
      const json = await resp.json();
      return {
        uploadUrl: json.upload_url,
        recordId: json.record_id,
        mediaRecord: json.media_record,
      };
    },

    initP2P: (onInbound, label) => raw.initP2P(onInbound, label),
    sendP2P: (provider, username, origin, label, data) => raw.send(provider, username, origin, label, data),
  };

  instance = wrapper;
  return wrapper;
}

// Singleton accessor (reset in tests)
export function getWapi(): WapiWrapper {
  if (!instance) {
    return createWapiWrapper();
  }
  return instance;
}

export function resetWapi(): void {
  instance = null;
}