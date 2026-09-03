// Backend origins for marketing-ui.
//
// Read from the VITE_* build args the ecosystem compose injects per
// environment (ubuntu-deployment/docker-compose.ecosystem.yml: VITE_API_URL /
// VITE_AUTH_URL / VITE_SOCIAL_URL), falling back to production so a plain
// `vite build` with no args still targets prod. Mirrors the origin
// parameterization web10-social (D14) and ui/ (B5) already do — without it,
// links on a dev/self-hosted build point at production.
const env = import.meta.env as Record<string, string | undefined>

export const API_ORIGIN = env.VITE_API_URL || 'https://api.web10.app'
export const API_HOST: string = API_ORIGIN.replace(/^https?:\/\//, '')
export const AUTH_ORIGIN = env.VITE_AUTH_URL || 'https://auth.web10.app'
export const SOCIAL_ORIGIN = env.VITE_SOCIAL_URL || 'https://social.web10.app'
