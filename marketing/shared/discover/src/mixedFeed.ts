import { createFederatedTransport, nodeOrigin } from '../../../../sdk/src/federatedTransport';
import type { ServerAllocation } from './sourceAllocation';
import { withSourceBudget } from './sourceBudget';
import { GROUP_FACE_SQL, facePrepare, reduceFaceRows } from './face';
import { knobStateToSort, buildFeedQuery, feedCursorFromPost, fromFeedQueryRow, type KnobState, type FeedCursor, type SourcePost } from './feedQuery';

export type { SourcePost } from './feedQuery';
export type Source = { origin: string; weight: number };
export type SourcedPost = SourcePost & { source_origin: string; source_key: string };
export type MixedFeedPage = {
  posts: SourcedPost[];
  has_more: boolean;
  errors: Record<string, string>;
  allocations: ServerAllocation[];
  next_cursor: null;
  page_cursor?: string;
};
export type HomePage = { posts: SourcePost[]; has_more: boolean; next_cursor?: FeedCursor | null };
export type HomeReadOptions = {
  limit?: number;
  cursor?: FeedCursor | null;
  knobState?: KnobState;
  stable?: boolean;
  rankingClockMs?: number;
  isCurrent?: () => boolean;
  groups?: string[];
  tags?: string[];
};
export type HomeRead = (options: HomeReadOptions) => Promise<HomePage>;
export type MixedFeedOptions = {
  sources: Source[];
  homeOrigin: string;
  credential: string | null;
  knobState: KnobState;
  isCurrent: () => boolean;
  /** Explicitly supplied by the app. The shared reader never loads a client. */
  homeRead?: HomeRead;
  initialCursor?: string;
  actingAuthor?: string;
  groupMode?: 'following' | 'discover';
  tags?: string[];
};
type SourceState = {
  origin: string;
  delivered: FeedCursor | null;
  fetched: FeedCursor | null;
  buffer: SourcedPost[];
  ended: boolean;
  error?: string;
  groups?: string[];
  status?: number;
  credit: number;
  transport?: ReturnType<typeof createFederatedTransport>;
};

const prepare = {
  media: true, ads: true,
  face: { bodyField: 'profile_body', mediaField: 'avatar_ref', authorColumn: 'author_key', urlField: 'avatar_url' },
};
const invalid = () => new Error('Invalid mixed feed response or cursor');

/** Origin is supplied by the approved catalog, never inferred from returned rows. */
function sourced(post: SourcePost, origin: string, credential: string | null): SourcedPost {
  const anchor = feedCursorFromPost(post);
  if (credential && [anchor.doc_id, anchor.author_key].some(value => value?.includes(credential))) throw invalid();
  // Run the same key validation/escaping used by the next query now, before commit.
  buildFeedQuery(null, anchor, 1, { stable: true });
  const url = (value: string | null | undefined) => {
    if (typeof value !== 'string' || !value || (credential && value.includes(credential))) return undefined;
    try {
      const parsed = new URL(value, origin);
      if (credential) {
        // URL parsing removes controls and percent-decoding can reveal echoes.
        // Recheck the usable URL, not just the untrusted input spelling.
        let decoded = parsed.href;
        for (let layer = 0; layer < 8; layer++) {
          if (decoded.includes(credential)) return undefined;
          const next = decoded.replace(/%([0-9a-f]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16)));
          if (next === decoded) break;
          decoded = next;
        }
        if (decoded.includes(credential) || /%[0-9a-f]{2}/i.test(decoded)) return undefined;
      }
      return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined;
    } catch { return undefined; }
  };
  const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  const count = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : 0;
  return { ...post, source_origin: origin, source_key: JSON.stringify([origin, anchor.author_key, anchor.doc_id]),
    author_provider: post.author_key?.includes('/users/') || post.author_key?.includes('/groups/') ? post.author_provider : new URL(origin).host,
    title: typeof post.title === 'string' ? post.title : undefined,
    text: typeof post.text === 'string' ? post.text : undefined,
    tags: Array.isArray(post.tags) ? post.tags.filter(tag => typeof tag === 'string') : undefined,
    likes: count(post.likes), dislikes: count(post.dislikes), comments: count(post.comments), reposts: count(post.reposts),
    profile: post.profile ? { ...post.profile, display_name: typeof post.profile.display_name === 'string' ? post.profile.display_name : undefined } : undefined,
    avatar_url: url(post.avatar_url),
    media_refs: Array.isArray(post.media_refs) ? post.media_refs.filter(ref => typeof ref === 'string' || (ref && typeof ref === 'object')).map(ref => typeof ref === 'string' ? ref : { ...ref,
      read_url: url(ref.read_url), thumbnail_url: url(ref.thumbnail_url),
      mime_type: typeof ref.mime_type === 'string' ? ref.mime_type : undefined,
      width: positive(ref.width), height: positive(ref.height), duration_seconds: positive(ref.duration_seconds),
      transcoding_settings: ref.transcoding_settings ? { ...ref.transcoding_settings, manifest_url: url(ref.transcoding_settings.manifest_url),
        variants: Array.isArray(ref.transcoding_settings.variants) ? ref.transcoding_settings.variants.filter(variant => variant && positive(variant.width) && positive(variant.height)) : undefined,
      } : undefined,
    }) : undefined,
  };
}

/** A paging session owns its captured destinations, credential and ranking clock.
 * Recreate on catalog/identity/knob changes and on retry, passing snapshot().
 * An error never advances that source. No registration or anonymous fallback.
 */
export function createMixedFeedReader(options: MixedFeedOptions) {
  const { credential, actingAuthor } = options;
  if (credential === null && actingAuthor) throw new Error('Anonymous sources cannot delegate an acting identity');
  if (credential && actingAuthor?.includes(credential)) throw new Error('Invalid mixed feed actor');
  const homeRead = options.homeRead;
  const tags = options.tags ? [...options.tags] : undefined;
  const groupMode = options.groupMode ?? 'following';
  if (tags && (tags.length > 16 || tags.some(tag => typeof tag !== 'string' || !tag || tag.length > 64))) throw new Error('Invalid source tags');
  const view = JSON.stringify({ groupMode, tags: tags ?? [] });
  const home = new URL(options.homeOrigin).origin;
  if (credential && home.includes(credential)) throw new Error('Invalid mixed feed home');
  if ((credential !== null && (typeof credential !== 'string' || !credential.trim())) || options.sources.length > 32) throw new Error('Invalid mixed feed scope');
  const { recency, likes, comments, halfLife, character } = options.knobState;
  const knobs = { recency, likes, comments, halfLife, character };
  if (['recency', 'likes', 'comments', 'halfLife', 'character'].some((key) => {
    const value = knobs[key as keyof KnobState];
    return !Number.isInteger(value) || value < 0 || value > 5;
  })) throw new Error('Invalid mixed feed ranking');
  const sort = knobStateToSort(knobs);
  const sources = [...new Map(options.sources.map((source) => {
    if (!Number.isInteger(source.weight) || source.weight < 0 || source.weight > 100 || (credential && source.origin.includes(credential))) throw new Error('Invalid source weight or origin');
    // Home may be a local development origin; foreign dispatch is HTTPS-only.
    const origin = source.origin === home ? home : nodeOrigin(source.origin);
    return [origin, { origin, weight: source.weight }] as const;
  })).values()];
  const weights = Object.fromEntries(sources.map((source) => [source.origin, source.weight]));
  const owner = new AbortController();
  const current = () => !owner.signal.aborted && options.isCurrent();
  const assertCurrent = () => { if (!current()) throw new Error('Mixed feed scope ended'); };
  const states: SourceState[] = sources.map(({ origin }) => ({
    origin, delivered: null, fetched: null, buffer: [], ended: false, credit: 0,
  }));
  let clock = Date.now();
  let page = 0;
  const ranking = JSON.stringify(knobs);
  const snapshot = () => JSON.stringify({ v: 1, home, ranking, view, acting: actingAuthor ?? '', clock, page,
    anchors: states.map(state => [state.origin, state.delivered]), credits: states.map(state => [state.origin, state.credit]) });

  if (options.initialCursor) {
    try {
      if (options.initialCursor.length > 65536 || (credential && options.initialCursor.includes(credential))) throw invalid();
      const saved = JSON.parse(options.initialCursor);
      if (saved.v !== 1 || saved.home !== home || saved.ranking !== ranking || saved.view !== view ||
        saved.acting !== (actingAuthor ?? '') || !Number.isSafeInteger(saved.clock) ||
        saved.clock < 0 || saved.clock > Date.now() || !Number.isSafeInteger(saved.page) || saved.page < 0 ||
        !Array.isArray(saved.anchors) || saved.anchors.length > 32) throw invalid();
      clock = saved.clock;
      page = saved.page;
      for (const state of states) {
        const entry = saved.anchors.find((anchor: unknown) => Array.isArray(anchor) && anchor[0] === state.origin);
        if (!entry || entry[1] == null) continue;
        const value = entry[1];
        // Copy only cursor scalars. Neither credentials nor content can survive restore.
        const cursor: FeedCursor = { created_at: value.created_at, score: value.score, author_key: value.author_key, doc_id: value.doc_id };
        if (credential && [cursor.doc_id, cursor.author_key].some(value => typeof value === 'string' && value.includes(credential))) throw invalid();
        buildFeedQuery(sort, cursor, 1, { stable: true, rankingClockMs: clock, tags });
        state.delivered = cursor;
        state.fetched = cursor;
      }
      if (Array.isArray(saved.credits)) for (const state of states) {
        const entry = saved.credits.find((row: unknown) => Array.isArray(row) && row[0] === state.origin);
        if (entry) {
          if (!Number.isSafeInteger(entry[1]) || Math.abs(entry[1]) > 1000000) throw invalid();
          state.credit = entry[1];
        }
      }
    } catch { throw new Error('Invalid mixed feed cursor'); }
  }

  function dispose() {
    owner.abort();
    for (const state of states) {
      state.transport?.dispose();
      state.buffer = [];
    }
  }

  async function remoteRead(state: SourceState, limit: number): Promise<SourcedPost[]> {
    state.status = undefined;
    state.transport ??= createFederatedTransport({
      approvedOrigin: state.origin, credential, signal: owner.signal, isCurrent: current,
      // Retain only HTTP status for safe visible errors; the SDK scrubs private exceptions.
      fetcher: async (input, init) => {
        const response = await fetch(input, init);
        state.status = response.status;
        return response;
      },
    });
    if (!state.groups && (credential === null || groupMode === 'discover')) state.groups = [`${new URL(state.origin).host}/groups/web10/discover`];
    if (!state.groups) {
      const groups = await state.transport.post('groups/list', actingAuthor
        ? { author_as: actingAuthor, service: 'posts' } : {});
      assertCurrent();
      if (!Array.isArray(groups) || groups.length > 10000) throw invalid();
      const followers = groups.flatMap((group) => typeof group?.group_id === 'string' && group.group_id.endsWith('/followers') ? [group.group_id] : []);
      state.groups = [...new Set(followers)];
      if (!state.groups.length) state.groups = [`${new URL(state.origin).host}/groups/web10/discover`];
    }
    const missing = Math.max(0, limit - state.buffer.length);
    if (!state.ended && missing) {
      const sql = buildFeedQuery(sort, state.fetched, missing, { stable: true, rankingClockMs: clock, tags });
      const result = await state.transport.post('query', {
        sql, groups: state.groups, surface: 'feed', content_service: 'posts', prepare,
      });
      assertCurrent();
      const rows = (result as { rows?: unknown })?.rows;
      if (!Array.isArray(rows) || rows.length > missing + 1) throw invalid();
      let posts = rows.map((row) => {
        if (!row || typeof row.created_at !== 'string' || typeof row.score !== 'number' || !Number.isFinite(row.score)) throw invalid();
        return sourced(fromFeedQueryRow(row), state.origin, credential);
      }).filter(post => !post.tags?.includes('ad') && !post.tags?.includes('product'));
      if (posts.length !== rows.length) throw invalid();
      const groups = [...new Set(posts.flatMap(post => post.author_key?.includes('/groups/') ? [post.author_key] : []))];
      if (groups.length) {
        // Group faces live in the app identity service, not personal profiles.
        // Query the serving node only; an unreadable face leaves attribution intact.
        try {
          const faces = await state.transport.post('query', { sql: GROUP_FACE_SQL, groups,
            prepare: { face: facePrepare('avatar_ref', 'avatar_url') } });
          assertCurrent();
          const rows = (faces as { rows?: unknown }).rows;
          if (Array.isArray(rows) && rows.length <= groups.length) {
            const byGroup = reduceFaceRows(rows, 'group_id');
            posts = posts.map(post => {
              const face = byGroup.get(post.author_key!);
              return face ? sourced({ ...post, profile: { ...post.profile, display_name: face.name }, avatar_url: face.avatar_url }, state.origin, credential) : post;
            });
          }
        } catch { assertCurrent(); }
      }
      // All rows must carry usable anchors before changing cursor or buffered state.
      const last = posts[posts.length - 1];
      state.fetched = last ? feedCursorFromPost(last) : state.fetched;
      state.ended = rows.length <= missing;
      state.buffer.push(...posts);
    }
    return state.buffer.splice(0, limit);
  }

  async function readSource(state: SourceState, limit: number): Promise<SourcedPost[]> {
    if (!limit || state.error || (state.ended && !state.buffer.length)) return [];
    assertCurrent();
    console.info('[mixed-feed] source read started', { home: state.origin === home, limit });
    try {
      let posts: SourcedPost[];
      if (state.origin === home && homeRead) {
        const result = await homeRead({
          limit, cursor: state.delivered, knobState: knobs, stable: true, rankingClockMs: clock, isCurrent: current,
          ...(tags ? { tags } : {}),
        });
        assertCurrent();
        if (result.posts.length > limit) throw invalid();
        posts = result.posts.map((post) => sourced(post, home, credential));
        state.ended = !result.has_more;
      } else posts = await remoteRead(state, limit);
      assertCurrent();
      // Duplicate identities are local to a node, not global document IDs.
      const seen = new Set<string>();
      const unique = posts.filter((post) => !seen.has(post.source_key) && !!seen.add(post.source_key));
      console.info('[mixed-feed] source read completed', { count: unique.length });
      return unique;
    } catch {
      assertCurrent();
      state.error = state.status && state.status >= 400
        ? `Node request denied or unavailable (HTTP ${state.status})` : 'Node read failed; retry to resume';
      console.info('[mixed-feed] source read failed', { status: state.status });
      return [];
    }
  }

  async function readNext(): Promise<MixedFeedPage> {
    assertCurrent();
    const page_cursor = snapshot();
    const allocations = states.map(state => ({ origin: state.origin, weight: state.error || (state.ended && !state.buffer.length) ? 0 : weights[state.origin], count: 0 }));
    const totalWeight = allocations.reduce((sum, row) => sum + row.weight, 0);
    // Carry fractional debt between pages: a small positive weight must not
    // become a permanent mute merely because this page has only twenty slots.
    for (let seat = 0; seat < 20 && totalWeight > 0; seat++) {
      let winner = -1;
      for (let i = 0; i < states.length; i++) {
        if (!allocations[i].weight) { states[i].credit = 0; continue; }
        states[i].credit += allocations[i].weight;
        if (winner < 0 || states[i].credit > states[winner].credit) winner = i;
      }
      states[winner].credit -= totalWeight;
      allocations[winner].count++;
    }
    const batches: SourcedPost[][] = states.map(() => []);
    let index = 0;
    // Limit actual destination sequences, not just Promise creation, to four.
    await Promise.all(Array.from({ length: Math.min(4, states.length) }, async () => {
      while (index < states.length) {
        const i = index++;
        try { batches[i] = await withSourceBudget(() => readSource(states[i], allocations[i].count), current, owner.signal); }
        catch { assertCurrent(); states[i].error = 'Source request budget unavailable; retry'; batches[i] = []; }
      }
    }));
    assertCurrent();
    const posts: SourcedPost[] = [];
    const credits = states.map(() => 0);
    while (batches.some((batch) => batch.length)) {
      let winner = -1;
      let total = 0;
      for (let i = 0; i < batches.length; i++) {
        if (!batches[i].length) continue;
        total += allocations[i].weight;
        credits[i] += allocations[i].weight;
        if (winner < 0 || credits[i] > credits[winner]) winner = i;
      }
      credits[winner] -= total;
      const post = batches[winner].shift()!;
      posts.push(post);
      states[winner].delivered = feedCursorFromPost(post);
    }
    page++;
    return {
      posts, next_cursor: null, page_cursor, allocations,
      has_more: states.some((state, i) => allocations[i].weight > 0 && !state.error && (!state.ended || state.buffer.length > 0)),
      errors: Object.fromEntries(states.filter((state) => state.error).map((state) => [state.origin, state.error!])),
    };
  }

  // Serialize concurrent scroll callbacks; dispose/owner changes fence queued work.
  let tail: Promise<unknown> = Promise.resolve();
  return {
    next(): Promise<MixedFeedPage> {
      const result = tail.then(readNext);
      tail = result.catch(() => undefined);
      return result;
    },
    dispose,
    snapshot,
  };
}
