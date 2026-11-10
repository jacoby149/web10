import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

it('uses public provider identity for profile reads while retaining internal Docker transport', async () => {
  vi.resetModules()
  vi.stubEnv('API_ORIGIN', 'http://web10-prod-api:80')
  vi.stubEnv('PROVIDER', 'api.web10.app')
  vi.stubEnv('SOCIAL_ORIGIN', 'https://social.web10.app')
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (url.endsWith('/v3/query')) {
      expect(url).toBe('http://web10-prod-api:80/v3/query')
      expect(body.groups).toEqual(['api.web10.app/groups/users/adam/followers'])
      return Response.json({ rows: [{ author_key: 'adam', body: { display_name: 'Adam Malev' }, avatar_url: 'https://media.example/adam.jpg' }] })
    }
    expect(url).toBe('http://web10-prod-api:80/v3/preview/render')
    expect(body).toMatchObject({ title: 'Adam Malev', image: 'https://media.example/adam.jpg' })
    return new Response('rendered')
  })
  vi.stubGlobal('fetch', fetcher)
  const { profileCard } = await import('../../preview/card.mjs')
  expect(await profileCard('adam')).toBe('rendered')
})
