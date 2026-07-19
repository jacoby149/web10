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

export const RTC_ORIGIN: string = env?.VITE_RTC_ORIGIN || 'https://rtc.web10.app';
// wapiInit takes the rtc endpoint as a bare host
export const RTC_HOST: string = RTC_ORIGIN.replace(/^https?:\/\//, '');
