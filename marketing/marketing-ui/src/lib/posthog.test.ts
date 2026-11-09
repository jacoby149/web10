import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyticsPath, campaignProperties, createPostHogTelemetry, maskReplay, posthogOptions, sanitizeEvent } from '@web10/telemetry'

const config = { posthog_enabled: true, posthog_project_key: 'phc_synthetic_project', posthog_host: 'https://us.i.posthog.com' }

function fixture() {
  const capture = vi.fn()
  const client = { capture }
  const init = vi.fn(() => client)
  const load = vi.fn(async () => ({ default: { init } }))
  const tracker = createPostHogTelemetry('marketing-ui', load as any)
  return { tracker, load, init, capture }
}

describe('PostHog explicit-capture boundary', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('does not load the SDK without explicit enablement, including string true', async () => {
    for (const posthog_enabled of [false, undefined, 'true']) {
      const f = fixture()
      f.tracker.pageview('/join')
      await f.tracker.start({ ...config, posthog_enabled } as any)
      expect(f.load).not.toHaveBeenCalled()
      expect(f.capture).not.toHaveBeenCalled()
    }
  })

  it.each([
    { posthog_project_key: '' },
    { posthog_project_key: 'phx_personal_secret' },
    { posthog_host: 'https://attacker.example' },
    { posthog_host: 'https://us.i.posthog.com/redirect' },
    { posthog_host: 'http://us.i.posthog.com' },
  ])('fails closed for invalid configuration %j', async (invalid) => {
    const f = fixture()
    await f.tracker.start({ ...config, ...invalid })
    expect(f.tracker.selected).toBe(true)
    expect(f.load).not.toHaveBeenCalled()
  })

  it('queues the initial route before config/SDK resolution, once under remount', async () => {
    const f = fixture()
    window.history.replaceState({}, '', '/join?utm_source=instagram&utm_campaign=pilot&utm_content=creator_a&token=SECRET')
    f.tracker.pageview('/join')
    f.tracker.pageview('/join')
    f.tracker.capture('join_click', { token: 'SECRET', text: 'PRIVATE', visibility: 'public' })
    await Promise.all([f.tracker.start(config), f.tracker.start(config)])
    expect(f.load).toHaveBeenCalledTimes(1)
    expect(f.init).toHaveBeenCalledTimes(1)
    expect(f.capture).toHaveBeenCalledTimes(2)
    expect(f.capture.mock.calls[0]).toEqual(['$pageview', expect.objectContaining({
      $pathname: '/join', app: 'marketing-ui', utm_campaign: 'pilot', utm_content: 'creator_a', capture_origin: 'browser',
    })])
    expect(JSON.stringify(f.capture.mock.calls)).not.toMatch(/SECRET|PRIVATE/)
  })

  it('counts back-navigation after another route but not consecutive identical paths', async () => {
    const f = fixture()
    await f.tracker.start(config)
    for (const route of ['/join', '/join', '/', '/join']) f.tracker.pageview(route)
    expect(f.capture).toHaveBeenCalledTimes(3)
  })

  it('bounds the startup queue and discards it on SDK failure without throwing', async () => {
    const f = fixture()
    for (let i = 0; i < 100; i++) f.tracker.capture('join_click')
    await f.tracker.start(config)
    expect(f.capture).toHaveBeenCalledTimes(64)
    const load = vi.fn().mockRejectedValue(new Error('PRIVATE error'))
    const tracker = createPostHogTelemetry('auth-ui', load)
    tracker.pageview('/')
    await expect(tracker.start(config)).resolves.toBeUndefined()
    expect(tracker.selected).toBe(true)
    expect(() => tracker.capture('login')).not.toThrow()
  })

  it('contains synchronous loader and capture failures', async () => {
    const tracker = createPostHogTelemetry('auth-ui', () => { throw new Error('failure') })
    await expect(tracker.start(config)).resolves.toBeUndefined()
    const f = fixture()
    f.capture.mockImplementation(() => { throw new Error('failure') })
    await f.tracker.start(config)
    expect(() => f.tracker.capture('login')).not.toThrow()
  })

  it('keeps every automatic collection channel off', () => {
    expect(posthogOptions(config.posthog_host)).toMatchObject({
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      capture_exceptions: false, disable_session_recording: true, enable_heatmaps: false,
      disable_surveys: true, disable_web_experiments: true,
      advanced_disable_feature_flags: true, disable_external_dependency_loading: true,
      person_profiles: 'identified_only', persistence: 'sessionStorage', cross_subdomain_cookie: false,
      store_google: false, save_referrer: false, ip: false,
      save_campaign_params: false, disable_conversations: true, disable_product_tours: true, debug: false,
    })
  })

  it('strips automatic URL/referrer/person properties and rejects unapproved events', () => {
    const result = sanitizeEvent({
      uuid: 'event-id', timestamp: new Date('2026-11-08T00:00:00Z'), event: '$pageview',
      properties: {
        distinct_id: 'anonymous-sdk-id', $session_id: 'session', app: 'auth-ui',
        $pathname: '/?token=SECRET', $current_url: 'https://auth.example/?token=SECRET',
        $referrer: 'https://other.example/private', $initial_current_url: 'SECRET',
        $set: { email: 'PRIVATE' }, $set_once: { $initial_referrer: 'SECRET' },
        $process_person_profile: true, visibility: 'private', arbitrary: 'PRIVATE',
      },
      $set: { email: 'PRIVATE' }, $set_once: { contact: 'PRIVATE' },
    })
    expect(result?.properties).toEqual({
      distinct_id: 'anonymous-sdk-id', $session_id: 'session', app: 'auth-ui',
      $pathname: '/', $process_person_profile: false, schema_version: 1,
      capture_origin: 'browser', visibility: 'private',
    })
    expect(result?.uuid).toBe('event-id')
    expect(result?.timestamp).toEqual(new Date('2026-11-08T00:00:00Z'))
    expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE/)
    for (const event of ['$autocapture', '$snapshot', '$exception', 'signup_completed']) {
      expect(sanitizeEvent({ uuid: 'x', event, properties: {} })).toBeNull()
    }
  })

  it.each([
    ['/u/alice/p/private-doc?token=SECRET', '/u/:username/p/:postId'],
    ['/groups/private-group/p/private-post', '/groups/:groupId'],
    ['/messages/private-conversation', '/messages'],
    ['/watch/private-post', '/watch/:id'],
    ['/docs/private-query?search=SECRET', '/docs'],
    ['/arbitrary-private-content', '/other'],
  ])('templates %s', (path, expected) => {
    expect(analyticsPath(path)).toBe(expected)
  })

  it('accepts only unambiguous bounded campaign slugs, never search terms or arbitrary URL fields', () => {
    expect(campaignProperties('?utm_source=instagram&utm_campaign=pilot&utm_content=creator_a&utm_term=PRIVATE&token=SECRET'))
      .toEqual({ utm_source: 'instagram', utm_campaign: 'pilot', utm_content: 'creator_a' })
    expect(campaignProperties('?utm_source=a&utm_source=b&utm_campaign=alice%40example.com&utm_content=https://private.example')).toEqual({})
    expect(campaignProperties(`?utm_id=${'x'.repeat(65)}`)).toEqual({})
  })

  it('keeps layout fidelity but removes text, content attributes, URLs and plugin payloads from replay (D106)', () => {
    const snapshots = [{ type: 2, data: { node: { type: 2, tagName: 'input', attributes: { value: 'SECRET', placeholder: 'SECRET', class: 'w10-feed-card', style: 'color: red', id: 'post-doc-123', 'data-private': 'SECRET', ariaLabel: 'SECRET', src: 'https://cdn.example/SECRET.jpg', href: 'https://auth.example/messages/private?token=SECRET' }, childNodes: [{ type: 3, textContent: 'SECRET' }] } } },
      { type: 4, data: { href: 'https://auth.example/messages/private?token=SECRET' } },
      { type: 5, data: { tag: 'console', payload: 'SECRET' } }]
    const output = maskReplay(snapshots)
    const serialized = JSON.stringify(output)
    // content and identifiers stay out
    expect(serialized).not.toMatch(/SECRET|private\?|token=|placeholder|post-doc-123|cdn\.example/)
    // layout fidelity survives
    expect(serialized).toContain('"class":"w10-feed-card"')
    expect(serialized).toContain('"style":"color: red;"')
    expect(serialized).toContain('input')
    // hrefs are route-templated, not raw
    expect(serialized).toContain('web10.invalid')
    expect(serialized).not.toContain('auth.example')
    const event = sanitizeEvent({ uuid: 'snapshot', event: '$snapshot', properties: { $snapshot_data: snapshots } })
    expect(event?.properties.$snapshot_data).toEqual(output)
  })

  it('keeps stylesheet structure without generated content or resource URLs', () => {
    const css = '.layout { display: grid; gap: 24px; background-image: url("https://private.invalid/SECRET"); } .layout::before { content: "SECRET"; }'
    const nodes = [
      { type: 3, isStyle: true, textContent: css },
      { type: 2, tagName: 'style', attributes: { type: 'text/css', _cssText: css } },
      { type: 2, tagName: 'div', attributes: { style: 'display: grid; background: url("https://private.invalid/SECRET")' } },
      { type: 3, textContent: 'SECRET' },
      { type: 2, tagName: 'div', attributes: { rr_width: '300px', rr_height: '160.5px', type: 'SECRET' } },
    ]
    const output = maskReplay(nodes)
    expect(JSON.stringify(output)).toContain('display: grid')
    expect(JSON.stringify(output)).toContain('gap: 24px')
    expect(JSON.stringify(output)).not.toMatch(/SECRET|private\.invalid|url\(/)
    expect((output as any[])[3].textContent).toBe('[masked]')
    expect((output as any[])[1].attributes.type).toBe('text/css')
    expect((output as any[])[4].attributes).toEqual({ rr_width: '300px', rr_height: '160.5px', type: '[masked]' })
  })

  it('preserves the SDK Meta URL callback but still drops real network entries', () => {
    const mask = posthogOptions(config.posthog_host, true).session_recording!.maskCapturedNetworkRequestFn!
    expect(mask({ name: 'https://social.example/messages/private?token=SECRET' } as any)).toEqual({ name: 'https://web10.invalid/messages' })
    expect(mask({ name: 'https://social.example/api', startTime: 1, requestBody: 'SECRET' } as any)).toBeNull()
  })

  it('strips heatmap URL query and target content but retains coordinates', () => {
    const result = sanitizeEvent({ uuid: 'heatmap', event: '$$heatmap', properties: {
      $heatmap_data: { 'https://social.example/messages/private?token=SECRET': [{x: 10, y: 20, type: 'click', text: 'SECRET', target_fixed: true}] },
    } })
    expect(result?.properties.$heatmap_data).toEqual({ 'https://social.example/messages': [{x: 10, y: 20, type: 'click', target_fixed: true}] })
  })

  it('resets before identifying and fences late replies/account changes', async () => {
    const capture = vi.fn(), reset = vi.fn(), identify = vi.fn(), register = vi.fn()
    const client = { capture, reset, identify, register }
    const tracker = createPostHogTelemetry('web10-social', async () => ({ default: { init: () => client } }) as any)
    await tracker.start(config)
    let token = 'credential-a'
    let resolve: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise((done) => { resolve = done })))
    const pending = tracker.identify('https://node.example', () => token)
    await Promise.resolve()
    tracker.reset()
    token = 'credential-b'
    resolve({ ok: true, json: async () => ({enabled: true, distinct_id: 'w10_' + 'a'.repeat(64)}) })
    await pending
    expect(identify).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true, json: async () => ({enabled: true, distinct_id: 'w10_' + 'b'.repeat(64), acquisition: {utm_campaign: 'pilot'}})}))
    await tracker.identify('https://node.example', () => token)
    expect(reset).toHaveBeenCalledBefore(identify)
    expect(identify).toHaveBeenCalledWith('w10_' + 'b'.repeat(64))
    token = 'credential-c'
    tracker.capture('follow')
    expect(capture).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
