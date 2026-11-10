import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalizeFeedSource, type FeedSource } from '@web10/discover/source-models';
import type { SourceEditorControl } from '@web10/discover/source-controls';
import { createMixedFeedReader, type HomeRead } from '@web10/discover/mixed-feed';
import { buildFeedQuery, knobStateToSort, fromFeedQueryRow, feedCursorFromPost, type KnobState } from '@web10/discover/feed-query';
import { API_ORIGIN } from './origins';
import { pendingPublicProfiles, resolvePublicProfiles, type PublicPost } from './publicProfiles';

export const PUBLIC_HOME = new URL(API_ORIGIN).origin;
export const PUBLIC_SOURCES_KEY = `web10:public-sources:v1:${PUBLIC_HOME}`;
const PREF_ERROR = 'Public server preferences are invalid. Reset or correct the server list.';

/** Preferences are destinations, not identity or authority. Copy only known scalars. */
export function parsePublicSources(raw: string, home = PUBLIC_HOME): FeedSource[] {
  if (raw.length > 32768) throw new Error(PREF_ERROR);
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.length > 32) throw new Error(PREF_ERROR);
  const seen = new Set<string>();
  return values.map(value => {
    if (!value || typeof value !== 'object' || typeof value.origin !== 'string'
      || !Number.isInteger(value.weight) || value.weight < 0 || value.weight > 100) throw new Error(PREF_ERROR);
    const origin = normalizeFeedSource(value.origin, home);
    if (seen.has(origin)) throw new Error(PREF_ERROR);
    seen.add(origin);
    return { origin, weight: value.weight };
  });
}

/** Only the configured HTTP development home uses this adapter. Foreign reads
 * always use the SDK's explicit public transport. No cookies or login client. */
export function publicHomeRead(home: string, signal: AbortSignal, fetcher = fetch): HomeRead {
  return async options => {
    const owner = new AbortController();
    const abort = () => owner.abort();
    if (signal.aborted) owner.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    try {
      if (options.isCurrent && !options.isCurrent()) throw new Error('Public read ended');
      const limit = options.limit ?? 20;
      const response = await fetcher(`${home}/v3/query`, {
        method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: owner.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: buildFeedQuery(knobStateToSort(options.knobState!), options.cursor ?? null, limit,
            { stable: true, rankingClockMs: options.rankingClockMs, tags: options.tags }),
          groups: [`${new URL(home).host}/groups/web10/discover`], surface: 'feed', content_service: 'posts',
          prepare: { media: true, ads: true, face: { bodyField: 'profile_body', mediaField: 'avatar_ref', authorColumn: 'author_key', urlField: 'avatar_url' } },
        }),
      });
      if (!response.ok) throw new Error('Public node request denied');
      if (!response.body) throw new Error('Invalid public response');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('Public response too large'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(data.rows) || data.rows.length > limit + 1) throw new Error('Invalid public response');
      const posts = data.rows.slice(0, limit).map((row: Record<string, unknown>) => {
        if (typeof row.score !== 'number' || !Number.isFinite(row.score)) throw new Error('Invalid public response');
        const post = fromFeedQueryRow(row);
        feedCursorFromPost(post);
        return post;
      });
      if (owner.signal.aborted || (options.isCurrent && !options.isCurrent())) throw new Error('Public read ended');
      return { posts, has_more: data.rows.length > limit };
    } catch { throw new Error('Public node read failed; retry to resume'); }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  };
}

export function usePublicSources(): SourceEditorControl {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [saveError, setSaveError] = useState('');
  const raw = params.get('servers');
  const preference = useMemo(() => {
    try {
      const stored = raw ?? localStorage.getItem(PUBLIC_SOURCES_KEY);
      return { sources: stored === null ? [{ origin: PUBLIC_HOME, weight: 100 }] : parsePublicSources(stored), error: '' };
    } catch { return { sources: [] as FeedSource[], error: PREF_ERROR }; }
  }, [raw, revision]);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === PUBLIC_SOURCES_KEY) setRevision(value => value + 1); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const save = useCallback((next: FeedSource[]) => {
    try {
      const clean = parsePublicSources(JSON.stringify(next));
      const encoded = JSON.stringify(clean);
      try { localStorage.setItem(PUBLIC_SOURCES_KEY, encoded); setSaveError(''); }
      catch { setSaveError('Browser storage is unavailable. These servers remain in this URL only.'); }
      setParams(previous => {
        const result = new URLSearchParams(previous); result.set('servers', encoded);
        result.delete('mixCursor'); result.delete('after'); result.delete('removeServer'); result.delete('approveServer'); return result;
      });
    } catch { setSaveError(PREF_ERROR); }
  }, [setParams]);
  return {
    scope: `public:${PUBLIC_HOME}`, home: PUBLIC_HOME, sources: preference.sources,
    approved: useMemo(() => new Set(preference.sources.map(source => source.origin)), [preference.sources]),
    ready: true, busy: false, canEdit: true, requiresApproval: false,
    error: saveError || preference.error, save, approve: () => undefined,
    reload: () => { setSaveError(''); setRevision(value => value + 1); },
  };
}

export function usePublicBoard(sources: FeedSource[], knobs: KnobState, enabled: boolean, tags?: string[], view = 'posts') {
  const [params, setParams] = useSearchParams();
  const route = useRef({ params, setParams }); route.current = { params, setParams };
  const restored = useRef(false), pages = useRef(0);
  const paging = useRef({ observed: params.get('mixCursor'), written: params.get('mixCursor'),
    requested: params.get('mixCursor') || undefined, navigated: false, revision: 0, key: '', snapshot: undefined as string | undefined });
  const cursorParam = params.get('mixCursor');
  if (cursorParam !== paging.current.observed) {
    paging.current.observed = cursorParam;
    if (cursorParam !== paging.current.written) {
      paging.current.requested = cursorParam || undefined;
      paging.current.navigated = true;
      paging.current.revision++;
      paging.current.written = cursorParam;
    }
  }
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [hasMore, setHasMore] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allocations, setAllocations] = useState<Awaited<ReturnType<ReturnType<typeof createMixedFeedReader>['next']>>['allocations']>();
  const [retry, setRetry] = useState(0);
  const loadRef = useRef<() => void>(() => undefined);
  const key = JSON.stringify({ sources, knobs, tags, view, enabled });
  const generationKey = `${key}:${paging.current.revision}`;
  const liveKey = useRef(generationKey); liveKey.current = generationKey;
  const [stateKey, setStateKey] = useState(generationKey);
  useEffect(() => {
    let live = true;
    let pending = false;
    const owner = new AbortController();
    pages.current = 0;
    setStateKey(generationKey);
    const sameSession = paging.current.key === key;
    const navigated = paging.current.navigated;
    paging.current.navigated = false;
    if (!sameSession || navigated || !retry) setPosts([]);
    setErrors({}); setHasMore(false); setAllocations(undefined);
    if (!enabled) { setLoading(false); return; }
    let reader: ReturnType<typeof createMixedFeedReader>;
    try {
      const options = { sources, homeOrigin: PUBLIC_HOME, credential: null,
        knobState: knobs, isCurrent: () => live && liveKey.current === generationKey, groupMode: 'discover', tags,
        ...(PUBLIC_HOME.startsWith('http:') ? { homeRead: publicHomeRead(PUBLIC_HOME, owner.signal) } : {}),
      } as const;
      const initialCursor = !restored.current || navigated ? paging.current.requested : sameSession && retry ? paging.current.snapshot : undefined;
      if (restored.current && !sameSession) {
        paging.current.written = null; paging.current.requested = undefined; paging.current.snapshot = undefined;
        if (route.current.params.has('mixCursor')) route.current.setParams(previous => { const next = new URLSearchParams(previous); next.delete('mixCursor'); return next; }, { replace: true });
      }
      paging.current.key = key;
      restored.current = true;
      try { reader = createMixedFeedReader({ ...options, initialCursor }); }
      catch { reader = createMixedFeedReader(options); }
    } catch {
      setErrors({ [PUBLIC_HOME]: 'Invalid public feed settings or tag. Correct the URL and retry.' });
      setLoading(false);
      return () => { live = false; owner.abort(); };
    }
    const load = async () => {
      if (pending || !live) return;
      pending = true; setLoading(true);
      console.info('[public-feed] page read started', { sources: sources.length });
      try {
        const result = await reader.next();
        if (!live || liveKey.current !== generationKey) return;
        paging.current.snapshot = reader.snapshot(); paging.current.requested = undefined;
        const page = pendingPublicProfiles(result.posts, PUBLIC_HOME);
        setPosts(previous => {
          const seen = new Set(previous.map(post => post.source_key));
          return [...previous, ...page.filter(post => !seen.has(post.source_key) && !!seen.add(post.source_key))];
        });
        // Optional author enrichment must never hold the board's first paint.
        void resolvePublicProfiles(page, owner.signal).then(resolved => {
          if (!live || liveKey.current !== generationKey || owner.signal.aborted) return;
          const faces = new Map(resolved.filter(post => post.author_face_pending === false).map(post => [post.source_key, post]));
          setPosts(previous => previous.map(post => {
            const face = faces.get(post.source_key);
            return post.author_face_pending && face && post.source_origin === face.source_origin && post.author_key === face.author_key
              ? { ...post, profile: face.profile, avatar_url: face.avatar_url, author_face_pending: false } : post;
          }));
        });
        setHasMore(result.has_more); setErrors(result.errors); setAllocations(result.allocations);
        if (pages.current++ > 0 && result.page_cursor) {
          paging.current.written = result.page_cursor;
          route.current.setParams(previous => {
            const next = new URLSearchParams(previous); next.set('mixCursor', result.page_cursor!); return next;
          });
        }
        console.info('[public-feed] page read completed', { count: result.posts.length, failedSources: Object.keys(result.errors).length });
      } catch {
        if (live) { setErrors({ [PUBLIC_HOME]: 'Public feed unavailable. Retry source reads.' }); setHasMore(false); }
      } finally { pending = false; if (live) setLoading(false); }
    };
    loadRef.current = () => { void load(); };
    void load();
    return () => { live = false; owner.abort(); reader.dispose(); loadRef.current = () => undefined; };
    // Scalars are captured by this generation; editing/Advanced URL changes do not restart reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, retry, paging.current.revision]);
  return { posts: stateKey === generationKey ? posts : [], loading: stateKey === generationKey ? loading : enabled,
    hasMore: stateKey === generationKey && hasMore, errors: stateKey === generationKey ? errors : {}, allocations: stateKey === generationKey ? allocations : undefined,
    loadMore: () => loadRef.current(), retry: () => setRetry(value => value + 1) };
}
