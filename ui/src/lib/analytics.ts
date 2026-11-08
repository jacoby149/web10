// D103: PostHog only. Auth URL/query, contacts and credentials never go to it.
import { createAnalytics } from '@web10/telemetry/runtime'
import { config } from '../config'

const host = typeof location === 'undefined' ? '' : location.hostname
const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
const dev = host.endsWith('.dev.web10.app')
const port = typeof location === 'undefined' || !location.port ? '' : `:${location.port}`
const api = local ? `http://api.localhost${port}` : dev ? 'https://api.dev.web10.app' : config.REACT_APP_API_ORIGIN
const social = local ? `http://social.localhost${port}` : dev ? 'https://social.dev.web10.app' : 'https://social.web10.app'
const marketing = local ? `http://localhost${port}` : dev ? 'https://dev.web10.app' : 'https://web10.app'
const analytics = createAnalytics('auth-ui', api, [social, marketing])
export const installTelemetry = () => analytics.install()
export const trackPageview = (path?: string) => analytics.tracker.pageview(path ?? location.pathname)
export const identifyAnalytics = (readToken: () => string | null) => analytics.identify(readToken)
export const resetAnalytics = () => analytics.reset()
export const acquisitionTicket = () => analytics.ticket()
