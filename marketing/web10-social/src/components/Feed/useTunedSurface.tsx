import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActingAuthor, getActingAuthor } from '@/data/actingIdentity';
import { readFeedPage } from '@/data/feed';
import { getDiscoverGroupId } from '@/data/groups';
import { createMixedFeedReader, type MixedFeedPage } from '@/data/mixedFeed';
import { fromResolvedMediaRef, type PostRecord } from '@/data/types';
import { getPreset, PRESETS, type KnobState } from '@/lib/powerMean';
import { KnobRack } from '@/components/Discover/KnobRack';
import { FeedSourcesEditor } from './FeedSourcesEditor';
import { useFeedSources } from './useFeedSources';

const keys: (keyof KnobState)[] = ['recency', 'likes', 'comments', 'halfLife', 'character'];
const emptyPosts: PostRecord[] = [];
export const surfaceKey = (post: PostRecord) => post.source_key || post._id || '';
export function preparedSurfaceMedia(post: PostRecord) {
  return (post.media_refs || []).flatMap(ref => typeof ref === 'object' && ref && ref.read_url ? [fromResolvedMediaRef(ref)] : []);
}
export function tunedShort(post: PostRecord) {
  const media = preparedSurfaceMedia(post);
  return post.tags?.includes('short') && post.media_refs?.length === 1 && media.length === 1 &&
    media[0].mime_type?.startsWith('video/') && media[0].width && media[0].height && media[0].width < media[0].height
    ? { post, media: media[0] } : null;
}

/** One owned paging session per media surface. Catalog rows are not approval. */
export function useTunedSurface(tag: 'short' | 'music') {
  const control = useFeedSources();
  const acting = useActingAuthor();
  const [params, setParams] = useSearchParams();
  const route = useRef({ params, setParams }); route.current = { params, setParams };
  const paging = useRef({ observed: params.get('mixCursor'), written: params.get('mixCursor'),
    requested: params.get('mixCursor') || undefined, navigated: false, revision: 0 });
  const cursorParam = params.get('mixCursor');
  if (cursorParam !== paging.current.observed) {
    paging.current.observed = cursorParam;
    if (cursorParam !== paging.current.written) {
      paging.current.requested = cursorParam || undefined; paging.current.navigated = true; paging.current.revision++;
      paging.current.written = cursorParam;
    }
  }
  const raw = params.get('knobs') || '';
  const parts = raw.split(',').map(Number);
  const knobs = parts.length === 5 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 5)
    ? Object.fromEntries(keys.map((key, index) => [key, parts[index]])) as unknown as KnobState
    : getPreset('most-recent')!.state;
  const ranking = keys.map(key => knobs[key]).join(',');
  const destinations = JSON.stringify(control.sources.filter(row => control.approved.has(row.origin)));
  const enabled = !!control.credential;
  const scope = JSON.stringify([control.scope, control.credential, control.ready, destinations, acting, ranking, tag]);
  const owner = `${scope}:${paging.current.revision}`;
  const live = useRef(owner); live.current = owner;
  const reader = useRef<ReturnType<typeof createMixedFeedReader> | null>(null);
  const pending = useRef(false);
  const cursor = useRef<string | undefined>(undefined);
  const restored = useRef(false), pages = useRef(0);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ owner: string; posts: PostRecord[]; loading: boolean; page?: MixedFeedPage }>({ owner, posts: [], loading: enabled });
  const next = useCallback(async () => {
    const active = reader.current;
    if (!active || pending.current) return;
    const captured = live.current;
    pending.current = true;
    setState(previous => ({ ...previous, loading: true }));
    console.info('[tuned-surface] page started', { tag });
    try {
      const page = await active.next();
      if (live.current !== captured || reader.current !== active) return;
      cursor.current = active.snapshot();
      if (pages.current++ > 0 && page.page_cursor) {
        paging.current.written = page.page_cursor;
        route.current.setParams(previous => {
          const next = new URLSearchParams(previous); next.set('mixCursor', page.page_cursor!); return next;
        });
      }
      setState(previous => ({ owner: captured, loading: false, page,
        posts: [...new Map([...previous.posts, ...page.posts].map(post => [surfaceKey(post), post])).values()] }));
      console.info('[tuned-surface] page completed', { tag, count: page.posts.length, failedSources: Object.keys(page.errors).length });
    } catch {
      if (live.current === captured && reader.current === active) setState(previous => ({ ...previous, loading: false }));
    } finally { if (reader.current === active) pending.current = false; }
  }, [tag]);
  useEffect(() => {
    cursor.current = undefined;
    pages.current = 0;
    if (restored.current) {
      paging.current.written = null; paging.current.requested = undefined;
      if (route.current.params.has('mixCursor')) route.current.setParams(previous => { const next = new URLSearchParams(previous); next.delete('mixCursor'); return next; }, { replace: true });
    }
  }, [scope]);
  useEffect(() => {
    if (!enabled || !control.ready) return;
    const captured = owner;
    pages.current = 0;
    const initialCursor = !restored.current || paging.current.navigated ? paging.current.requested : cursor.current;
    paging.current.navigated = false;
    restored.current = true;
    const options = { sources: JSON.parse(destinations), homeOrigin: control.home,
      credential: control.credential, knobState: knobs, actingAuthor: acting || undefined,
      groupMode: 'discover' as const, tags: [tag],
      isCurrent: () => live.current === captured && control.live() && getActingAuthor() === acting,
      homeRead: (options: Parameters<typeof readFeedPage>[0]) => readFeedPage({ ...options, groups: [getDiscoverGroupId()], tags: [tag] }),
    };
    let active: ReturnType<typeof createMixedFeedReader>;
    try { active = createMixedFeedReader({ ...options, initialCursor }); }
    catch { active = createMixedFeedReader(options); }
    reader.current = active; pending.current = false;
    setState(previous => ({ owner, posts: previous.owner === owner ? previous.posts : [], loading: true }));
    void next();
    return () => { active.dispose(); if (reader.current === active) reader.current = null; };
  // Scalars encode the captured knobs/catalog, not transient control objects.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, retry, enabled, next]);
  const visible = state.owner === owner ? state : { posts: emptyPosts, loading: enabled, page: undefined };
  const update = (state: KnobState) => setParams(previous => {
    const next = new URLSearchParams(previous); next.set('knobs', keys.map(key => state[key]).join(',')); return next;
  });
  const panel = <section className="mb-4 rounded-lg bg-background p-3" aria-label={`${tag === 'short' ? 'Shorts' : 'Music'} tuning`}>
    <KnobRack state={knobs} activePreset={PRESETS.find(preset => keys.every(key => preset.state[key] === knobs[key]))?.id || null}
      onChange={(key, value) => update({ ...knobs, [key]: value })} onPreset={id => update(getPreset(id)!.state)}
      expanded={params.get('tune') === '1' || params.get('editServers') === '1'}
      onExpandedChange={expanded => setParams(previous => { const next = new URLSearchParams(previous); if (expanded) next.set('tune', '1'); else { next.delete('tune'); next.delete('editServers'); } return next; })}>
      <FeedSourcesEditor control={control} allocations={visible.page?.allocations} errors={visible.page?.errors} onRetry={() => setRetry(value => value + 1)} />
    </KnobRack>
    {visible.page && !!Object.keys(visible.page.errors).length && <p role="status" className="mt-2 text-xs text-muted-foreground">Some servers could not be read. Open Advanced → Edit servers to retry; available results remain.</p>}
  </section>;
  return { enabled, posts: visible.posts, loading: visible.loading || (enabled && !control.ready), hasMore: visible.page?.has_more || false,
    next, panel, home: control.home, owner, reload: () => setRetry(value => value + 1) };
}
