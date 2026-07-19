import { env } from './env'

// Backend origins. These are the current hardcoded production values,
// kept here as fallbacks — a staging/dev build overrides them via
// build-time env (see ui/Dockerfile ARGs + .context/laneE-ui-build-args.md).
// vite.config.js's envPrefix allows both VITE_ and REACT_APP_, so either
// naming works; the loop below checks both without requiring the key to
// be duplicated.
const config = {
  REACT_APP_DEFAULT_API: "api.web10.app",
  REACT_APP_AUTH_ORIGIN: "https://auth.web10.app",
  REACT_APP_API_ORIGIN: "https://api.web10.app",
  REACT_APP_RTC_ORIGIN: "https://rtc.web10.app",
  REACT_APP_BETA_REQUIRED: false,
  REACT_APP_VERIFY_REQUIRED: true,
  REACT_APP_PAY_REQUIRED: false,
  REACT_APP_LOGO_DARK: "/YourOrgsLogo/key_white.png",
  REACT_APP_LOGO_LIGHT: "/YourOrgsLogo/key_black.png",
  REACT_APP_BRAND_TEXT: "app store"
}

// prioritizes the env vars if they exist — REACT_APP_FOO or its VITE_FOO
// alias (VITE_ prefix with the REACT_APP_ stripped), falling back to the
// hardcoded default above.
for (let key in config) {
  const viteAlias = key.startsWith('REACT_APP_') ? 'VITE_' + key.slice('REACT_APP_'.length) : undefined
  config[key] = env[key] ? env[key] : (viteAlias && env[viteAlias] ? env[viteAlias] : config[key])
}

export { config }
