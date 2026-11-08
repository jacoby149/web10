import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalytics } from '@web10/telemetry/runtime'

vi.mock('posthog-js/dist/module.full.no-external', () => ({ default: { init: () => ({ capture() {}, register() {}, reset() {}, identify() {} }) } }))
const cfg = { posthog_enabled: true, posthog_project_key: 'phc_synthetic_project', posthog_host: 'https://us.i.posthog.com' }
beforeEach(() => { sessionStorage.clear(); history.replaceState({}, '', '/?utm_campaign=pilot&utm_content=creator_a&token=SECRET') })
afterEach(() => vi.unstubAllGlobals())

describe('acquisition handoff', () => {
  it('forwards only bounded campaign metadata to configured origins before config/SDK resolves', () => {
    const runtime = createAnalytics('marketing-ui', 'https://node.example', ['https://social.example'])
    const allowed = new URL(runtime.decorate('https://social.example/posts'))
    expect(allowed.searchParams.get('utm_content')).toBe('creator_a')
    expect(allowed.searchParams.get('token')).toBeNull()
    expect(runtime.decorate('https://outside.example/')).toBe('https://outside.example/')
    runtime.dispose()
  })

  it('captures the initial touch before navigation and preserves signed first touch on the handoff', async () => {
    const runtime = createAnalytics('marketing-ui', 'https://node.example', ['https://social.example'])
    const fetcher = vi.fn(async (url, init) => String(url).endsWith('/telemetry')
      ? {ok: true, json: async () => cfg}
      : {ok: true, json: async () => ({ticket: 'signed-synthetic-ticket', properties: {utm_campaign: 'pilot', utm_content: 'creator_a'}})})
    vi.stubGlobal('fetch', fetcher)
    history.replaceState({}, '', '/docs')
    await runtime.install()
    const body = JSON.parse(fetcher.mock.calls[1][1].body)
    expect(body.campaign).toEqual({utm_campaign: 'pilot', utm_content: 'creator_a'})
    expect(new URL(runtime.decorate('https://social.example/posts')).searchParams.get('_w10a')).toBe('signed-synthetic-ticket')
    runtime.reset()
    expect(runtime.ticket()).toBeNull()
    expect(runtime.decorate('https://social.example/posts')).toBe('https://social.example/posts')
    runtime.dispose()
  })

  it('reads popup metadata only from a configured opener origin, never trusts its account identity', async () => {
    const redirect = new URL('https://social.example/posts?utm_campaign=pilot&token=SECRET')
    history.replaceState({}, '', '/?redirect=' + encodeURIComponent(redirect.href))
    const runtime = createAnalytics('auth-ui', 'https://node.example', ['https://social.example'])
    const fetcher = vi.fn(async (url) => String(url).endsWith('/telemetry') ? {ok: true, json: async () => cfg} : {ok: true, json: async () => ({ticket: null})})
    vi.stubGlobal('fetch', fetcher)
    await runtime.install()
    const body = JSON.parse(fetcher.mock.calls[1][1].body)
    expect(body.campaign).toEqual({utm_campaign: 'pilot'})
    expect(JSON.stringify(body)).not.toContain('SECRET')
    runtime.dispose()
  })
})
