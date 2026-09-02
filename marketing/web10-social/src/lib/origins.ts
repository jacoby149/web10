// Backend origins, baked in at build time by vite. Deployed builds get
// these from the Dockerfile ARGs that ubuntu-deployment/
// docker-compose.ecosystem.yml passes per environment (see
// AGENT-OPS.md §4.1); the production origins are the fallback so a
// bare `vite build` still targets prod. The `?local=true` dev-mode
// switch in the adapters overrides all of this with *.localhost.
const env = import.meta.env;

export const AUTH_ORIGIN: string = env?.VITE_AUTH_ORIGIN || 'https://auth.web10.app';

export const API_ORIGIN: string = env?.VITE_API_ORIGIN || 'https://api.web10.app';
// web10 addresses are written provider-host/username
export const API_HOST: string = API_ORIGIN.replace(/^https?:\/\//, '');

// The RTC signaling host tracks the API host so it follows the environment
// (api.localhost → rtc.localhost, api.web10.app → rtc.web10.app) — the e2e /
// local stacks set VITE_API_ORIGIN but not VITE_RTC_ORIGIN, so a hardcoded
// prod RTC host would point the P2P peer at the wrong server. An explicit
// VITE_RTC_ORIGIN still wins (host AND protocol from it).
let rtcHost: string;
let rtcProtocol: 'https' | 'http';
if (env?.VITE_RTC_ORIGIN) {
  rtcHost = env.VITE_RTC_ORIGIN.replace(/^https?:\/\//, '');
  rtcProtocol = env.VITE_RTC_ORIGIN.startsWith('https') ? 'https' : 'http';
} else {
  rtcHost = API_HOST.replace(/^api\./, 'rtc.');
  rtcProtocol = API_ORIGIN.startsWith('https') ? 'https' : 'http';
}
// The RTC endpoint as a bare host (the SDK's rtc subpath takes a host, not a URL)
export const RTC_HOST: string = rtcHost;
export const RTC_ORIGIN: string = `${rtcProtocol}://${rtcHost}`;

// The marketing site (where the importer /import lives). The social app's
// empty-state CTAs ("import your existing posts" / "import your contacts")
// open this in a new tab — cross-app origin, so a per-env build arg is
// required (D14 parameterized the social app's own backend; D19 Phase A
// extends it to the importer it links out to).
export const MARKETING_ORIGIN: string = env?.VITE_MARKETING_ORIGIN || 'https://marketing.web10.app';
