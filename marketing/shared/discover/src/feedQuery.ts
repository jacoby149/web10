/** Pure feed SQL/ranking and prepared-row mapping. No app client or SDK state. */
export type KnobState = { recency: number; likes: number; comments: number; halfLife: number; character: number };
export type FeedCursor = { created_at?: string; score?: number; author_key?: string; doc_id?: string };
export type FeedQueryOptions = { stable?: boolean; rankingClockMs?: number; tags?: string[]; createdAfterMs?: number };
export type FeedRanking = { recency: number; likes: number; comments: number; half_life_ms: number; character: number };

/** Only paging/render controls are interpreted here; other content stays opaque.
 * Extra app-owned fields are structurally allowed without importing app types. */
export interface SourcePost {
  created_at: string;
  _id?: string;
  author_key?: string;
  author_username?: string;
  author_provider?: string;
  posted_by?: string;
  score?: number;
  tags?: string[];
  title?: string;
  text?: string;
  groups?: string[];
  likes?: number;
  dislikes?: number;
  comments?: number;
  reposts?: number;
  avatar_url?: string;
  profile?: {
    _id?: string;
    display_name?: string;
    avatar_ref?: string;
    banner_ref?: string;
    bio?: string;
    website?: string;
    location?: string;
    updated_at?: string;
  };
  media_refs?: (string | {
    doc_id?: string;
    object_key?: string | null;
    mime_type?: string | null;
    filename?: string | null;
    size_bytes?: number | null;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
    read_url?: string | null;
    thumbnail_url?: string | null;
    transcoding_settings?: {
      enabled?: boolean;
      status?: 'processing' | 'done' | 'failed';
      manifest_url?: string;
      variants?: { width: number; height: number; bitrate_kbps?: number; codec?: string; duration_seconds?: number }[];
    };
  })[];
}

/** Same app detents: retired Time/Character knobs never change ranking. */
export function knobStateToSort(state: KnobState): FeedRanking | null {
  const weights = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const recency = weights[state.recency];
  const likes = weights[state.likes];
  const comments = weights[state.comments];
  if (likes <= 0 && comments <= 0) return null;
  return { recency, likes, comments, half_life_ms: 86_400_000, character: 0 };
}

export function feedCursorFromPost(post: SourcePost): FeedCursor {
  if (!post._id || !post.author_key || !Number.isFinite(Date.parse(post.created_at)) ||
    (post.score != null && !Number.isFinite(post.score))) throw new Error('Invalid feed row anchor');
  return { created_at: new Date(post.created_at).toISOString(), score: post.score, author_key: post.author_key, doc_id: post._id };
}

function feedSqlString(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid feed cursor key');
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function powerMeanScoreSql(createdMs: string, reactions: string, comments: string, sort: FeedRanking, clockMs?: number): string {
  const wr = sort.recency;
  const wl = sort.likes;
  const wc = sort.comments;
  const p = sort.character;
  const hl = sort.half_life_ms;
  const clock = clockMs == null ? 'toUnixTimestamp64Milli(now64(3))' : String(clockMs);
  const age = `greatest(0, ${clock} - toUnixTimestamp64Milli(${createdMs}))`;
  if (wr > 0 && wl <= 0 && wc <= 0) return `-(${age})`;
  if (wr <= 0 && wl <= 0 && wc <= 0) return '0';
  const eps = 1e-12;
  const r = `least(1, greatest(${eps}, if(${hl} <= 0, 1, exp(-(${age}) / ${hl}))))`;
  const likesN = `least(1, greatest(${eps}, ln(1 + (${reactions})) / (1 + ln(1 + (${reactions})))))`;
  const c = `least(1, greatest(${eps}, 0.5 * ln(1 + (${comments})) / (1 + 0.5 * ln(1 + (${comments})))))`;
  const tw = `(if(${wr} > 0, ${wr}, 0) + if(${wl} > 0, ${wl}, 0) + if(${wc} > 0, ${wc}, 0))`;
  if (Math.abs(p) < 1e-9) {
    const num = `(if(${wr} > 0, ${wr} * ln(${r}), 0) + if(${wl} > 0, ${wl} * ln(${likesN}), 0) + if(${wc} > 0, ${wc} * ln(${c}), 0))`;
    return `exp(${num} / ${tw})`;
  }
  const num = `(if(${wr} > 0, ${wr} * pow(${r}, ${p}), 0) + if(${wl} > 0, ${wl} * pow(${likesN}, ${p}), 0) + if(${wc} > 0, ${wc} * pow(${c}, ${p}), 0))`;
  return `pow(${num} / ${tw}, 1 / ${p})`;
}

/** SQL is byte-identical to the social feed builder; policy stays in the node. */
export function buildFeedQuery(sort: FeedRanking | null, cursor: FeedCursor | null, limit: number, options: FeedQueryOptions = {}): string {
  if (!Number.isSafeInteger(limit) || limit < 0 || (options.stable && (limit < 1 || limit > 1000))) throw new Error('Invalid feed limit');
  if (sort && Object.values(sort).some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid feed ranking');
  if (options.rankingClockMs != null && (!Number.isSafeInteger(options.rankingClockMs) || options.rankingClockMs < 0 || options.rankingClockMs > 8640000000000000)) throw new Error('Invalid feed clock');
  if (cursor?.score != null && (typeof cursor.score !== 'number' || !Number.isFinite(cursor.score))) throw new Error('Invalid feed cursor score');
  const s: FeedRanking = sort ?? { recency: 0, likes: 0, comments: 0, half_life_ms: 0, character: -1 };
  const score = powerMeanScoreSql('p.created_at', '(coalesce(eng.like_count, 0) + coalesce(eng.dislike_count, 0))', 'coalesce(cmt.comment_count, 0)', s, options.rankingClockMs);
  const newest = (s.recency <= 0 && s.likes <= 0 && s.comments <= 0) || (s.recency > 0 && s.likes <= 0 && s.comments <= 0);
  const conditions = ["not has(p.tags, 'ad')", "not has(p.tags, 'product')"];
  if (options.createdAfterMs != null) {
    if (!Number.isSafeInteger(options.createdAfterMs) || options.createdAfterMs < 0 || options.createdAfterMs > 253402300799999) throw new Error('Invalid feed cutoff');
    conditions.push(`p.created_at >= fromUnixTimestamp64Milli(${options.createdAfterMs})`);
  }
  if (options.tags?.length) conditions.push(...options.tags.map(tag => `has(p.tags, ${feedSqlString(tag)})`));
  if (options.stable && cursor) {
    if (typeof cursor.created_at !== 'string') throw new Error('Invalid feed cursor timestamp');
    const cursorMs = Date.parse(cursor.created_at ?? '');
    if (!Number.isFinite(cursorMs)) throw new Error('Invalid feed cursor timestamp');
    if (!newest && cursor.score == null) throw new Error('Invalid feed cursor score');
    const keys = `toUnixTimestamp64Milli(p.created_at), p.author_key, p.doc_id`;
    const values = `${cursorMs}, ${feedSqlString(cursor.author_key!)}, ${feedSqlString(cursor.doc_id!)}`;
    conditions.push(`tuple(${newest ? '' : `(${score}), `}${keys}) < tuple(${newest ? '' : `${cursor.score}, `}${values})`);
  } else if (newest) {
    if (cursor?.created_at) {
      const cursorMs = Date.parse(cursor.created_at);
      if (!Number.isFinite(cursorMs)) throw new Error('Invalid feed cursor timestamp');
      conditions.push(`toUnixTimestamp64Milli(p.created_at) < ${cursorMs}`);
    }
  } else if (cursor?.score != null) {
    conditions.push(`(${score}) < ${cursor.score}`);
  }
  const whereClause = `WHERE ${conditions.join(' AND ')} `;
  const orderBy = (newest ? 'toUnixTimestamp64Milli(p.created_at) DESC' : `${score} DESC`) +
    (options.stable ? `${newest ? '' : ', toUnixTimestamp64Milli(p.created_at) DESC'}, p.author_key DESC, p.doc_id DESC` : '');
  return (
    'SELECT p.doc_id AS doc_id, p.author_key AS author_key, p.posted_by AS posted_by, p.group_id AS group_id, p.body AS body, p.tags AS tags, ' +
    'p.created_at AS created_at, p.ref_value AS ref_value, p.ad_mode AS ad_mode, p.ad_target AS ad_target, ' +
    'coalesce(eng.like_count, 0) AS likes, coalesce(eng.dislike_count, 0) AS dislikes, coalesce(rp.repost_count, 0) AS reposts, coalesce(cmt.comment_count, 0) AS comments, ' +
    `(${score}) AS score, pr.body AS profile_body ` +
    'FROM posts p ' +
    "LEFT JOIN (SELECT ref_value, countIf(JSONExtractString(body, 'type') = 'like') AS like_count, " +
    "countIf(JSONExtractString(body, 'type') = 'dislike') AS dislike_count FROM reactions WHERE ref_value != '' GROUP BY ref_value) eng ON eng.ref_value = p.doc_id " +
    "LEFT JOIN (SELECT JSONExtractString(body, 'repost_of') AS repost_of, count() AS repost_count FROM posts WHERE JSONExtractString(body, 'repost_of') != '' GROUP BY repost_of) rp ON rp.repost_of = p.doc_id " +
    "LEFT JOIN (SELECT JSONExtractString(body, 'post_id') AS post_id, count() AS comment_count FROM comments WHERE JSONExtractString(body, 'post_id') != '' GROUP BY post_id) cmt ON cmt.post_id = p.doc_id " +
    'LEFT JOIN (SELECT author_key, body FROM profile QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY updated_at DESC) = 1) pr ON pr.author_key = p.author_key ' +
    whereClause +
    'ORDER BY ' + orderBy + ' ' +
    `LIMIT ${limit + 1}`
  );
}

type Fields = Record<string, unknown>;
const text = (value: unknown) => (value as string) || undefined;
const username = (key: string) => key.split('/').pop() || key;
const provider = (key: string) => key.includes('/') ? key.split('/')[0] : 'web10';

function leafValue(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined;
  if (v && typeof v === 'object' && 'value' in v) return String((v as { value?: unknown }).value ?? '') || undefined;
  return undefined;
}

function numValue(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'value' in v) {
    const n = Number((v as { value?: unknown }).value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function product(raw: unknown): Fields | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Fields;
  const target = leafValue(r.target), name = leafValue(r.name), price = numValue(r.price);
  const commission = numValue(r.commission), actuals = numValue(r.actuals), calibration = numValue(r.calibration);
  const link = leafValue(r.link), partner = leafValue(r.partner), kind = leafValue(r.kind);
  const pics = Array.isArray(r.pics) ? r.pics.map(x => typeof x === 'string' ? x : leafValue(x)).filter((x): x is string => !!x) : undefined;
  if (!target && !name && price === undefined && commission === undefined && !pics?.length && actuals === undefined && calibration === undefined && !link && !partner && !kind) return undefined;
  return { target: target || (name || price !== undefined || commission !== undefined || link ? 'product' : 'none'),
    name, price, commission, commission_is_percent: r.commission_is_percent === true || leafValue(r.commission_is_percent) === 'true',
    pics: pics?.length ? pics : undefined, actuals, calibration, link, partner, kind };
}

function ad(raw: unknown): Fields | undefined {
  if (!raw) return undefined;
  const doc = raw as Fields, body = doc.body as Fields, offer = (body.offer || {}) as Fields;
  const tags = (doc.tags || []) as string[];
  return { _id: doc.doc_id, title: text(body.title), text: text(body.text), media_refs: body.media_refs || undefined,
    created_at: doc.created_at || undefined,
    offer: { kind: leafValue(offer.kind), partner: leafValue(offer.partner), link: leafValue(offer.link), cta: leafValue(offer.cta), disclosure: leafValue(offer.disclosure) },
    status: body.status === 'paused' ? 'paused' : 'active', author_username: username(doc.author_key as string),
    variant: tags.includes('node_ad') ? 'node' : 'creator', format: body.format === 'post' ? 'post' : 'inline',
    albums: tags.filter(t => t.startsWith('album:')).map(t => t.slice('album:'.length)),
    product_id: leafValue(body.product_id) || undefined, product: product(body.product) };
}

/** Reproduces the prepared-row mapper, including ads/products and profile fields,
 * without importing a private app's document types or credential-aware client. */
export function fromFeedQueryRow(row: Fields): SourcePost & Fields {
  const body = row.body as Fields;
  const key = row.author_key as string;
  const author = username(key), host = provider(key);
  const profile = typeof row.profile_body === 'string' && row.profile_body
    ? JSON.parse(row.profile_body) as Fields : row.profile_body as Fields | undefined;
  return {
    _id: row.doc_id as string, title: text(body.title), text: text(body.text),
    media_refs: (body.media_refs || undefined) as SourcePost['media_refs'],
    created_at: row.created_at as string, updated_at: undefined,
    origin: body.origin || undefined, origin_id: body.origin_id || undefined,
    visibility: body.visibility || undefined, location: body.location || undefined,
    tags: (row.tags || body.tags || undefined) as string[] | undefined,
    mentions: body.mentions || undefined, encrypted: body.encrypted, repost_of: body.repost_of || undefined,
    product: product(body), author_username: author, author_key: key,
    groups: row.group_id ? [String(row.group_id)] : undefined, author_provider: host,
    ad: ad(row.ad), node_ad: ad(row.node_ad), ad_target: row.ad_target || undefined,
    posted_by: text(row.posted_by), author, provider: host, post_id: row.doc_id,
    likes: row.likes as number | undefined, dislikes: row.dislikes as number | undefined,
    reposts: row.reposts as number | undefined, comments: row.comments as number | undefined,
    impressions: undefined, reach: undefined, score: row.score as number | undefined,
    profile: profile ? { _id: row.doc_id as string, display_name: text(profile.display_name), avatar_ref: text(profile.avatar_ref),
      banner_ref: text(profile.banner_ref), bio: text(profile.bio), website: text(profile.website), location: text(profile.location), updated_at: undefined } : undefined,
    avatar_url: (row.avatar_url ?? undefined) as string | undefined,
  };
}
