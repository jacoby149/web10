import { campaignProperties, createPostHogTelemetry, telemetryFetch, type TelemetryConfig } from './index';

const STORAGE = 'web10-acquisition-v1';
const PARAM = '_w10a';

export function createAnalytics(app: 'marketing-ui' | 'web10-social' | 'auth-ui', apiOrigin: string, trustedOrigins: string[]) {
  const tracker = createPostHogTelemetry(app);
  const trusted = new Set(trustedOrigins.flatMap((value) => { try { return [new URL(value).origin]; } catch { return []; } }));
  const landing = new URL(location.href);
  let landingCampaign = campaignProperties(landing.search);
  let starting: Promise<void> | undefined;
  let ticket: string | null = null;
  let enabled = false;
  let generation = 0;
  const store = (value: string | null) => {
    ticket = value;
    try { if (value) sessionStorage.setItem(STORAGE, value); else sessionStorage.removeItem(STORAGE); } catch { /* blocked storage */ }
  };
  const decorate = (href: string) => {
    const url = new URL(href, location.href);
    if (trusted.has(url.origin)) {
      const context = ticket ?? landing.searchParams.get(PARAM);
      if (context && context.length <= 4096) url.searchParams.set(PARAM, context);
      else for (const [key, value] of Object.entries(landingCampaign)) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return url.toString();
  };
  // Install synchronously: an immediate navigation must not depend on SDK or
  // config network latency. Only allowlisted source metadata is forwarded.
  const forward = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    try {
      if (anchor instanceof HTMLAnchorElement && trusted.has(new URL(anchor.href).origin)) anchor.href = decorate(anchor.href);
    } catch { console.warn('[telemetry] handoff destination ignored'); }
  };
  document.addEventListener('click', forward, true);
  return {
    tracker,
    ticket: () => ticket,
    async install() {
      if (starting) return starting;
      starting = (async () => {
        const epoch = generation;
        try {
          const response = await telemetryFetch(apiOrigin + '/telemetry');
          if (!response.ok) throw new Error('config unavailable');
          const config: TelemetryConfig = await response.json();
          enabled = config.posthog_enabled === true;
          await tracker.start(config);
          if (!enabled) return;
          let incoming = landing.searchParams.get(PARAM);
          let campaign = landingCampaign;
          // The existing SDK redirect already names the opener. Read metadata
          // only from an explicitly configured app origin, never arbitrary URLs.
          if (!incoming && app === 'auth-ui') {
            try {
              const redirect = new URL(landing.searchParams.get('redirect') ?? '');
              if (trusted.has(redirect.origin)) {
                incoming = redirect.searchParams.get(PARAM);
                if (Object.keys(campaign).length === 0) campaign = campaignProperties(redirect.search);
              }
            } catch { /* no redirect */ }
          }
          let saved: string | null = null;
          try { saved = sessionStorage.getItem(STORAGE); } catch { /* blocked storage */ }
          const requestContext = (value: string | null) => telemetryFetch(apiOrigin + '/analytics/context', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket: value, campaign }) });
          let context = await requestContext(saved ?? incoming);
          let result = context.ok ? await context.json() : null;
          if (!result?.ticket && saved && incoming && saved !== incoming) {
            context = await requestContext(incoming);
            result = context.ok ? await context.json() : null;
          }
          if (epoch !== generation) return;
          store(typeof result?.ticket === 'string' && result.ticket.length <= 4096 ? result.ticket : null);
          tracker.setCampaign(result?.properties ?? {});
        } catch {
          await tracker.start({ posthog_enabled: false });
          console.warn('[telemetry] runtime configuration/context unavailable', { app });
        }
      })();
      return starting;
    },
    prepareAuthHandoff() {
      const current = new URL(location.href);
      if (ticket) current.searchParams.set(PARAM, ticket);
      else for (const [key, value] of Object.entries(landingCampaign)) current.searchParams.set(key, value);
      history.replaceState(history.state, '', current);
    },
    async identify(readToken: () => string | null) {
      const epoch = generation;
      await starting;
      if (enabled && epoch === generation) await tracker.identify(apiOrigin, readToken);
    },
    reset() {
      generation++;
      landingCampaign = {};
      landing.searchParams.delete(PARAM);
      store(null);
      tracker.reset();
      const current = new URL(location.href);
      current.searchParams.delete(PARAM);
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_id']) current.searchParams.delete(key);
      history.replaceState(history.state, '', current);
    },
    decorate,
    dispose() { document.removeEventListener('click', forward, true); },
  };
}
