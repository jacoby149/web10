// In-memory capabilities are never credentials for another read. Recovery
// replays only an allowlisted original read, under its current reader scope.
type Binding = { replay: () => Promise<unknown>; current: () => boolean; pending?: Promise<Map<string, string>>; fresh?: Map<string, string>; waiters?: number };
const bindings = new Map<string, Binding>();
let generation = 0;
let running = 0;
const queue: (() => void)[] = [];
const LIMIT = 4;
const MAX_BINDINGS = 4096;
const pageScope = () => typeof window === 'undefined' ? '' : window.location.pathname;
let playingMedia: HTMLMediaElement | undefined;

export function mayStartPreview(element?: HTMLMediaElement) { return !playingMedia || playingMedia === element || playingMedia.paused || playingMedia.muted; }
export function releaseMediaPlayback(element: HTMLMediaElement | null) { if (playingMedia === element) playingMedia = undefined; }
export function claimMediaPlayback(element: HTMLMediaElement) {
  if (playingMedia && playingMedia !== element && !playingMedia.paused) {
    if (element.muted && !playingMedia.muted) return false;
    playingMedia.pause();
  }
  playingMedia = element;
  return true;
}

export function invalidateMediaRecovery() { generation++; bindings.clear(); }
export function hasMediaRecovery(url: string) { return !!bindings.get(url)?.current(); }
export function mediaReadLifetime() {
  const captured = generation, page = pageScope();
  return () => captured === generation && page === pageScope();
}

/** Bound optional per-row enrichment without changing results or claiming batching. */
export async function mapMediaReads<T, R>(items: T[], read: (item: T) => Promise<R>, current = mediaReadLifetime()): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) {
      if (!current()) throw new Error('Media reader changed');
      const index = next++;
      result[index] = await read(items[index]);
    }
  }));
  if (!current()) throw new Error('Media reader changed');
  return result;
}

/** Metadata schedules renewal only. It never authorizes a request. */
export function mediaExpiry(url: string): number {
  try {
    const parsed = new URL(url, 'https://relative.invalid');
    const token = parsed.searchParams.get('cap') || parsed.searchParams.get('sig');
    if (token) {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const { exp } = JSON.parse(atob(part));
      return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : Infinity;
    }
    const date = parsed.searchParams.get('X-Amz-Date');
    const ttl = parsed.searchParams.get('X-Amz-Expires');
    if (date && ttl) return Date.parse(date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')) + Number(ttl) * 1000;
  } catch { /* No usable scheduling hint. Error recovery remains available. */ }
  return Infinity;
}

function resource(url: string): string {
  const parsed = new URL(url, 'https://relative.invalid');
  for (const key of [...parsed.searchParams.keys()]) {
    if (key === 'sig' || key === 'cap' || key.toLowerCase().startsWith('x-amz-')) parsed.searchParams.delete(key);
  }
  parsed.hash = '';
  parsed.searchParams.sort();
  return parsed.href;
}

function collect(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length && visited++ < 20_000) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    for (const [key, entry] of Object.entries(item)) {
      if (typeof entry === 'string' && /(?:^url$|_url$|Url$)/.test(key) && /^(?:https?:\/\/|\/v3\/media\/hls\/)/.test(entry)) {
        try { out.set(resource(entry), entry); } catch { /* Invalid media stays unavailable. */ }
      } else if (entry && typeof entry === 'object') stack.push(entry);
    }
  }
  return out;
}

function remember(urls: Map<string, string>, binding: Binding) {
  for (const url of urls.values()) {
    bindings.delete(url);
    bindings.set(url, binding);
    if (bindings.size > MAX_BINDINGS) bindings.delete(bindings.keys().next().value!);
  }
}

export function bindMediaRead(value: unknown, replay: () => Promise<unknown>, current: () => boolean) {
  if (!current()) return;
  const captured = generation;
  remember(collect(value), { replay, current: () => captured === generation && current() });
}

async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (running >= LIMIT) {
    if (queue.length >= 64) throw new Error('Media recovery queue full');
    await new Promise<void>(resolve => queue.push(resolve));
  } else running++;
  try { return await work(); }
  finally { const next = queue.shift(); if (next) next(); else running--; }
}

async function bounded<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Media recovery timed out')), 15_000); })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** One live read per original response, shared by all its failed media. */
export async function recoverMediaUrl(original: string): Promise<{ url: string; isCurrent: () => boolean }> {
  const binding = bindings.get(original);
  if (!binding || !binding.current()) throw new Error('Media read no longer current');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Offline');
  const key = resource(original);
  let fresh = binding.fresh?.get(key);
  if (!fresh || mediaExpiry(fresh) <= Date.now() + 5000) {
    binding.waiters = (binding.waiters || 0) + 1;
    try {
      binding.pending ??= limited(async () => {
        if (!binding.current() || !binding.waiters) throw new Error('Media reader changed or demand expired');
        const started = Date.now();
        let value: unknown;
        try { value = await binding.replay(); }
        catch (error) {
          const candidate = (error as { status?: unknown })?.status;
          console.warn('[media-reliability]', { phase: 'read-unavailable', status: typeof candidate === 'number' && candidate >= 100 && candidate <= 599 ? candidate : undefined, elapsedMs: Date.now() - started });
          throw new Error('Media read unavailable');
        }
        if (!binding.current()) throw new Error('Media reader changed');
        const urls = collect(value);
        console.log('[media-reliability]', { phase: 'read-ready', resources: urls.size, elapsedMs: Date.now() - started });
        binding.fresh = urls;
        remember(urls, binding);
        return urls;
      }).finally(() => { binding.pending = undefined; });
      fresh = (await bounded(binding.pending)).get(key);
    } finally { binding.waiters--; }
  }
  if (!fresh || !binding.current()) throw new Error('Original media no longer readable');
  return { url: fresh, isCurrent: binding.current };
}

const READ_METHODS = new Set(['read', 'readById', 'query', 'listMedia', 'getMediaReadUrl', 'getThumbnail']);
/** Preserve SDK semantics; only known read methods acquire recovery bindings. */
export function withMediaRecovery<T extends object>(client: T, scope: () => string): T {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(client, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (typeof value !== 'function') return value;
    if (methods.has(key)) return methods.get(key);
    const method = (...args: unknown[]) => {
      if (key === 'setToken' || key === 'scrubToken' || key === 'signOut') invalidateMediaRecovery();
      if (!READ_METHODS.has(String(key))) return value.apply(target, args);
      const captured = scope();
      const stamp = generation;
      const page = pageScope();
      const current = () => stamp === generation && captured === scope() && page === pageScope();
      // Snapshot JSON read arguments before awaits; callers may mutate arrays.
      const replayArgs = args.map(arg => arg === undefined ? undefined : JSON.parse(JSON.stringify(arg)));
      for (const arg of replayArgs) if (arg && typeof arg === 'object') delete arg.surface;
      return Promise.resolve(value.apply(target, args)).then(result => {
        bindMediaRead(result, () => value.apply(target, replayArgs), current);
        return result;
      });
    };
    methods.set(key, method);
    return method;
  } });
}

/** Marketing's explicit anonymous read adapter; never intercept global fetch. */
export async function mediaReadFetch(input: string, init?: RequestInit): Promise<Response> {
  const captured = generation;
  const page = pageScope();
  const replayInit = init ? { ...init, headers: new Headers(init.headers) } : undefined;
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  if (body) delete body.surface;
  const response = await fetch(input, init);
  if (!/\/v3\/(?:read|query)$/.test(input) || !response.ok) return response;
  const json = response.json.bind(response);
  response.json = async () => {
    const result = await json();
    bindMediaRead(result, async () => {
      const fresh = await fetch(input, { ...replayInit, body: body ? JSON.stringify(body) : replayInit?.body });
      if (!fresh.ok) throw new Error('Media read denied or unavailable');
      return fresh.json();
    }, () => captured === generation && page === pageScope());
    return result;
  };
  return response;
}
