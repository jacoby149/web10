// D103: explicit, content-free browser capture. No auth credentials or person
// merging here. Backend-confirmed outcomes and cross-domain identity are separate.
import type { PostHog, PostHogConfig, CaptureResult } from 'posthog-js/dist/module.full.no-external';
import { createReplayTextPolicy, PRIVATE_SELECTOR, replayAttribute, replayText } from './replayText';

export const POSTHOG_HOSTS = ['https://us.i.posthog.com', 'https://eu.i.posthog.com'] as const;
export type TelemetryConfig = {
  posthog_enabled?: boolean;
  posthog_project_key?: string;
  posthog_host?: string;
  posthog_replay_enabled?: boolean;
};

export async function telemetryFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

const EVENTS = new Set([
  '$pageview', 'login', 'logout', 'post_created', 'new_post_open', 'follow',
  'unfollow', 'pwa_install_prompt_shown', 'pwa_installed', 'collection_created',
  'post_saved', 'landing', 'docs_view', 'app_store_view', 'trending_view',
  'freedom_view', 'everything_view', 'export_started', 'export_complete',
  'trending_load_more', 'trending_comment_attempt', 'trending_like_attempt',
  'trending_repost_attempt', 'trending_preset', 'trending_search',
  'trending_view_toggle', 'trending_people_view', 'trending_groups_view',
  'trending_tab', 'experience_video', 'experience_shorts', 'experience_hot_gossip',
  'experience_posts', 'experience_people', 'join_view', 'join_click',
  'sign_in_click', 'sign_up_click', 'github_click', 'enter_click', 'product_session',
]);
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_id'] as const;
const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const STRUCTURAL: Record<string, ReadonlySet<string>> = {
  visibility: new Set(['public', 'private']),
  trigger: new Set(['shorts', 'engagement', 'manual']),
  screen: new Set(['posts', 'video', 'shorts', 'music', 'profile', 'discover', 'following', 'saved', 'settings']),
};
const SDK_IDS = new Set([
  'distinct_id', '$device_id', '$session_id', '$window_id', '$insert_id',
  '$lib', '$lib_version', 'token', '$process_person_profile',
]);

/** Route templates only. Never send usernames, document IDs, query or hash. */
export function analyticsPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  if (/^\/u\/[^/]+\/p\/[^/]+\/?$/.test(pathname)) return '/u/:username/p/:postId';
  if (/^\/u\/[^/]+(?:\/(?:store|saved)(?:\/[^/]+)?)?\/?$/.test(pathname)) return '/u/:username';
  if (/^\/groups\/[^/]+(?:\/p\/[^/]+)?\/?$/.test(pathname)) return '/groups/:groupId';
  if (/^\/(watch|shorts)\/[^/]+\/?$/.test(pathname)) return `/${pathname.split('/')[1]}/:id`;
  if (/^\/messages(?:\/[^/]+)?\/?$/.test(pathname)) return '/messages';
  if (/^\/docs(?:\/[a-z0-9-]+)*\/?$/.test(pathname)) return '/docs';
  if (/^\/(?:trending\/)?(?:posts|people|video|shorts|music)\/?$/.test(pathname)) return pathname.replace(/\/$/, '');
  if (new Set(['/', '/join', '/freedom', '/everything', '/apps', '/login', '/signup', '/settings', '/saved', '/monetize', '/discover', '/following', '/feed']).has(pathname)) return pathname;
  return '/other';
}

export function campaignProperties(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const result: Record<string, string> = {};
  for (const key of CAMPAIGN_KEYS) {
    const values = params.getAll(key);
    if (values.length === 1 && SLUG.test(values[0])) result[key] = values[0];
  }
  return result;
}

/** Final wire gate, including SDK-added automatic URL/referrer/person fields. */
export function sanitizeEvent(event: CaptureResult | null, replaySanitizer = maskReplay): CaptureResult | null {
  if (!event || (!EVENTS.has(event.event) && !['$identify', '$snapshot', '$$heatmap'].includes(event.event))) return null;
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (SDK_IDS.has(key) && (typeof value === 'string' || typeof value === 'boolean')) properties[key] = value;
    if (CAMPAIGN_KEYS.includes(key as typeof CAMPAIGN_KEYS[number]) && typeof value === 'string' && SLUG.test(value)) properties[key] = value;
    if (STRUCTURAL[key]?.has(String(value))) properties[key] = value;
  }
  properties.$process_person_profile = /^w10_[a-f0-9]{64}$/.test(String(properties.distinct_id));
  if (event.event === '$identify' && typeof event.properties?.$anon_distinct_id === 'string') properties.$anon_distinct_id = event.properties.$anon_distinct_id;
  if (event.event === '$snapshot') {
    const data = event.properties?.$snapshot_data;
    if (!data || typeof data !== 'object') return null;
    properties.$snapshot_data = replaySanitizer(data);
    properties.$snapshot_bytes = JSON.stringify(properties.$snapshot_data).length;
  }
  if (event.event === '$$heatmap') {
    const data: Record<string, unknown[]> = {};
    for (const [url, points] of Object.entries(event.properties?.$heatmap_data ?? {})) {
      if (!Array.isArray(points)) continue;
      let safeUrl: string;
      try { safeUrl = new URL(url).origin + analyticsPath(new URL(url).pathname); } catch { continue; }
      data[safeUrl] = points.slice(0, 1000).flatMap((p) =>
        p && Number.isFinite(p.x) && Number.isFinite(p.y) && ['click', 'mousemove', 'rageclick', 'deadclick'].includes(p.type)
          ? [{ x: p.x, y: p.y, type: p.type, target_fixed: p.target_fixed === true }] : []);
    }
    properties.$heatmap_data = data;
  }
  properties.schema_version = 1;
  properties.capture_origin = 'browser';
  const app = event.properties?.app;
  if (['marketing-ui', 'web10-social', 'auth-ui'].includes(app)) properties.app = app;
  if (typeof event.properties?.$pathname === 'string') properties.$pathname = analyticsPath(event.properties.$pathname);
  // Return an allowlisted envelope as well as properties: do not forward a
  // surprise SDK top-level field containing content.
  return { uuid: event.uuid, event: event.event, properties, timestamp: event.timestamp };
}

// D107: normal DOM content is visible; mask sensitive regions. Attribute/URL
// channels still exclude credentials, form values and arbitrary data payloads.
const REPLAY_BLOCKED_ATTRS = new Set(['value', 'alt', 'title', 'placeholder', 'src', 'srcset', 'srcdoc', 'poster', 'id', 'contenteditable']);
const REPLAY_TYPES = new Set(['text/css', 'button', 'submit', 'reset', 'text', 'password', 'email', 'tel', 'url', 'search', 'number', 'checkbox', 'radio', 'range', 'date', 'datetime-local', 'month', 'time', 'week', 'color', 'file', 'hidden']);

function replayHref(value: string): string {
  return 'https://web10.invalid' + analyticsPath(value.startsWith('/') ? value : (() => { try { return new URL(value).pathname; } catch { return '/other'; } })());
}

// Parse as inert CSS, not DOM text. Never attach this sheet: @import must not
// fetch. Keep layout, but remove generated content and resource/attribute reads.
// Browsers without constructed stylesheets fail closed rather than sending CSS.
function replayCss(value: string): string {
  try {
    const sheet = new CSSStyleSheet();
    if (sheet.replaceSync) sheet.replaceSync(value);
    else sheet.insertRule(`@media all { ${value} }`);
    const clean = (rules: CSSRuleList): string => Array.from(rules).map((rule) => {
      const styled = rule as CSSStyleRule;
      if (styled.style) {
        for (const property of Array.from(styled.style)) {
          const declaration = styled.style.getPropertyValue(property);
          if (property === 'content' || property === 'src' || /(?:url|image-set|attr)\s*\(/i.test(declaration)) styled.style.removeProperty(property);
        }
      }
      const group = rule as CSSGroupingRule;
      if (group.cssRules?.length) {
        const children = clean(group.cssRules);
        return rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + (styled.style?.cssText ?? '') + children + '}';
      }
      return rule.type === CSSRule.IMPORT_RULE ? '' : rule.cssText;
    }).join('\n');
    return clean(sheet.replaceSync ? sheet.cssRules : (sheet.cssRules[0] as CSSGroupingRule).cssRules);
  } catch { return ''; }
}

/** Defense after rrweb masking: content belongs only in ordinary visible DOM
 * text/pixels, never arbitrary plugin/network/input or credential attributes. */
export function maskReplay(value: unknown, key = '', readable: (id: number) => boolean = () => false, ownerId?: number): unknown {
  if (key === 'attributes') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([attr]) => {
          const a = attr.toLowerCase();
          return !a.startsWith('data-') && !a.startsWith('aria-') && (!REPLAY_BLOCKED_ATTRS.has(a) || a === 'src');
        })
        .map(([attr, v]) => {
          const a = attr.toLowerCase();
          if (a === 'href') return [attr, replayHref(String(v ?? ''))];
          // Invalid style MIME types disable CSS; blocked-media dimensions are
          // rrweb protocol fields, not content. Preserve only fixed safe forms.
          if (a === 'type' && typeof v === 'string' && REPLAY_TYPES.has(v)) return [attr, v];
          if (a === 'rel' && v === 'stylesheet') return [attr, v];
          if ((a === 'rr_width' || a === 'rr_height') && typeof v === 'string' && /^\d+(?:\.\d+)?px$/.test(v)) return [attr, v];
          if (a === '_csstext') return [attr, typeof v === 'string' ? replayCss(v) : ''];
          if (a === 'style') {
            const css = typeof v === 'string' ? replayCss(`x { ${v} }`) : '';
            return [attr, css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')).trim()];
          }
          if (a === 'class') return [attr, typeof v === 'string' ? v : '[masked]'];
          // Pixel snapshot, never the signed source URL. CORS/oversize/unsupported
          // images fail closed; video/audio transports remain outside replay.
          if (a === 'src' || a === 'rr_dataurl') return [attr, ownerId !== undefined && readable(ownerId) && typeof v === 'string' && v.length <= 2_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : ''];
          if (['viewbox', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform'].includes(a) && typeof v === 'string' && /^[\d\s.,+eE()a-zA-Z%-]{0,4096}$/.test(v)) return [attr, v];
          if (['fill', 'stroke'].includes(a) && typeof v === 'string' && /^(?:none|currentColor|transparent|#[a-fA-F0-9]{3,8})$/.test(v)) return [attr, v];
          if (['stroke-linecap', 'stroke-linejoin'].includes(a) && ['butt', 'round', 'square', 'miter', 'bevel'].includes(String(v))) return [attr, v];
          return [attr, maskReplay(v, attr, readable)];
        }),
    );
  }
  if (Array.isArray(value)) return value.filter((v) => !(v && typeof v === 'object' && [5, 6].includes(v.type))).map((v) => maskReplay(v, '', readable));
  if (value && typeof value === 'object') {
    const node = value as { type?: number; isStyle?: boolean; id?: number; source?: number };
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k,
      node.type === 3 && node.isStyle === true && k === 'textContent' && typeof v === 'string'
        ? replayCss(v) : node.source === 0 && k === 'texts' && Array.isArray(v)
          ? v.map((entry) => ({ id: entry.id, value: typeof entry.value === 'string' && readable(entry.id) ? entry.value : '[masked]' }))
          : node.source === 0 && k === 'attributes' && Array.isArray(v)
            ? v.map((entry) => ({ id: entry.id, attributes: maskReplay(entry.attributes, 'attributes', readable, entry.id) }))
          : node.type === 3 && k === 'textContent' && typeof v === 'string' && readable(node.id!)
           ? v : maskReplay(v, k, readable, node.id),
    ]));
  }
  if (typeof value !== 'string') return value;
  if (key === 'tagName' && /^[a-z][a-z0-9-]{0,30}$/.test(value)) return value;
  if (key === 'href') return replayHref(value);
  return '[masked]';
}

export function posthogOptions(host: string, replay = false): Partial<PostHogConfig> {
  const policy = createReplayTextPolicy();
  const sanitizeReplay = (value: unknown): unknown => {
    const events = Array.isArray(value) ? value : [value];
    const safe = events.map((event) => { policy.observe(event); return maskReplay(event, '', policy.allowed); });
    return Array.isArray(value) ? safe : safe[0];
  };
  return {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_performance: false,
    capture_exceptions: false,
    rageclick: false,
    disable_session_recording: !replay,
    enable_heatmaps: replay,
    enable_recording_console_log: false,
    session_recording: {
      // Visible by default. Explicit sensitive roots and editable/input fields
      // are the exceptions, not a public-content or product-copy allowlist.
      maskAllInputs: true, maskTextSelector: PRIVATE_SELECTOR, maskAllElementAttributes: false,
      maskTextFn: replayText, maskInputFn: () => '[masked]',
      blockSelector: 'video, audio, canvas, iframe, object, embed, input[type="file"], [data-replay-private], .ph-no-capture',
      maskAttributeFn: replayAttribute,
      recordCrossOriginIframes: false, recordHeaders: false, recordBody: false,
      captureCanvas: { recordCanvas: false }, collectFonts: true, inlineStylesheet: true, captureJsonLd: false,
      compress_events: false,
      // The pinned SDK also invokes this with {name} for rrweb's Meta URL.
      // Returning null there drops the viewport/page metadata and breaks replay.
      // Real network entries (timings/headers/body/etc.) still return null.
      maskCapturedNetworkRequestFn: (request) => Object.keys(request).length === 1 && typeof request.name === 'string'
        ? { ...request, name: replayHref(request.name) } : null,
    },
    disable_surveys: true,
    disable_conversations: true,
    disable_product_tours: true,
    disable_web_experiments: true,
    advanced_disable_feature_flags: true,
    disable_external_dependency_loading: true,
    person_profiles: 'identified_only',
    persistence: 'sessionStorage',
    cross_subdomain_cookie: false,
    store_google: false,
    save_campaign_params: false,
    save_referrer: false,
    custom_campaign_params: [],
    ip: false,
    debug: false,
    get_current_url: () => `${location.origin}${analyticsPath(location.pathname)}`,
    before_send: (event) => sanitizeEvent(event, sanitizeReplay),
  };
}

type Pending = { event: string; properties: Record<string, unknown> };
type LoadSDK = () => Promise<{ default: PostHog }>;

export function createPostHogTelemetry(
  app: 'marketing-ui' | 'web10-social' | 'auth-ui',
  load: LoadSDK = () => import('posthog-js/dist/module.full.no-external'),
) {
  let state: 'pending' | 'loading' | 'ready' | 'disabled' = 'pending';
  let selected = false;
  let client: PostHog | undefined;
  let queue: Pending[] = [];
  let lastPath: string | undefined;
  let starting: Promise<void> | undefined;
  let generation = 0;
  let identity: string | null = null;
  let lastUse = 0;
  let acquisition: Record<string, string> = {};
  let owner: (() => string | null) | undefined;
  let ownerToken: string | null = null;

  const deliver = (item: Pending) => {
    try {
      client?.capture(item.event, item.properties);
    } catch {
      console.warn('[telemetry] capture failed', { app });
    }
  };
  const capture = (event: string, properties: Record<string, unknown> = {}) => {
    if (ownerToken && owner?.() !== ownerToken) return;
    if (!EVENTS.has(event) || state === 'disabled') return;
    // SDK identity/transport fields may only come from the SDK, never from
    // arbitrary marketing metadata passed by a caller.
    const input = Object.fromEntries(Object.entries(properties).filter(([key]) => !SDK_IDS.has(key)));
    const safe = sanitizeEvent({ uuid: '', event, properties: { ...acquisition, ...input, app } });
    if (!safe) return;
    const item = { event, properties: safe.properties };
    if (state === 'ready') deliver(item);
    else if (queue.length < 64) queue.push(item);
    else console.warn('[telemetry] startup queue full', { app });
  };
  const productUse = () => {
    if (!identity || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (Date.now() - lastUse < 30 * 60 * 1000) return;
    lastUse = Date.now();
    capture('product_session');
  };
  const reset = () => {
    generation++;
    identity = null;
    ownerToken = null;
    owner = undefined;
    lastUse = 0;
    queue = [];
    acquisition = {};
    try { client?.reset(true); } catch { console.warn('[telemetry] identity reset failed', { app }); }
  };
  return {
    get selected() { return selected; },
    start(config: TelemetryConfig): Promise<void> {
      if (starting) return starting;
      selected = config.posthog_enabled === true;
      const key = config.posthog_project_key ?? '';
      const host = config.posthog_host ?? '';
      if (!selected || !/^phc_[A-Za-z0-9_-]{8,200}$/.test(key) || !POSTHOG_HOSTS.includes(host as typeof POSTHOG_HOSTS[number])) {
        state = 'disabled';
        queue = [];
        console.info('[telemetry] capture disabled', { app, selected });
        return starting = Promise.resolve();
      }
      state = 'loading';
      console.info('[telemetry] loading PostHog', { app });
      starting = Promise.resolve().then(load).then(({ default: sdk }) => {
        client = sdk.init(key, posthogOptions(host, config.posthog_replay_enabled === true), `web10_${app.replace(/-/g, '_')}`);
        if (!client) throw new Error('SDK unavailable');
        state = 'ready';
        client.register?.({ app });
        const pending = queue;
        queue = [];
        console.info('[telemetry] PostHog ready', { app, queued: pending.length });
        pending.forEach(deliver);
      }).catch(() => {
        state = 'disabled';
        queue = [];
        console.warn('[telemetry] PostHog unavailable; capture disabled', { app });
      });
      return starting;
    },
    capture,
    reset,
    productUse,
    setCampaign(properties: Record<string, string>) { acquisition = campaignProperties(new URLSearchParams(properties).toString()); },
    async identify(apiOrigin: string, readToken: () => string | null) {
      const token = readToken();
      const epoch = ++generation;
      if (!token) { reset(); return; }
      // Fence captures immediately, including while an older request resolves.
      owner = readToken;
      ownerToken = token;
      try {
        await starting;
        if (!client || epoch !== generation || readToken() !== token) return;
        const response = await telemetryFetch(apiOrigin + '/analytics/identity', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
        });
        const result = response.ok ? await response.json() : null;
        if (epoch !== generation || readToken() !== token) return;
        if (!result?.enabled || !/^w10_[a-f0-9]{64}$/.test(result.distinct_id)) { reset(); return; }
        if (identity !== result.distinct_id) {
          // Never alias a shared/forwarded anonymous ID into two accounts.
          // Campaign continuity is explicit; anonymous traffic stays separate.
          client.reset(true);
          client.register({ app });
          client.identify(result.distinct_id);
          identity = result.distinct_id;
          lastUse = 0;
        }
        acquisition = campaignProperties(new URLSearchParams(result.acquisition ?? {}).toString());
        console.info('[telemetry] verified analytics identity ready', { app });
      } catch {
        if (epoch === generation) reset();
        console.warn('[telemetry] analytics identity unavailable', { app });
      }
    },
    pageview(path: string) {
      // Dedup the StrictMode/remount repeat, not a later back-navigation.
      if (path === lastPath) return;
      lastPath = path;
      capture('$pageview', {
        $pathname: analyticsPath(path),
        ...campaignProperties(typeof location === 'undefined' ? '' : location.search),
      });
    },
  };
}
