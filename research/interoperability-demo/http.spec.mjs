import { test, expect } from '../../e2e/playwright.ts';
import { api, signup, socialLogin } from './helpers.ts';
import { runInteroperability } from '../experiments/social/interop.mjs';

test('cross-author joins preserve independent app and private-group gates', async ({ browser, request }) => {
  const creator = await signup(request, 'creator');
  const reader = await signup(request, 'reader');
  const outsider = await signup(request, 'outsider');
  // Only the real social application writes the reused profiles.
  for (const user of [creator, outsider]) {
    const context = await browser.newContext();
    try {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.hostname.endsWith('.localhost') || url.hostname === 'localhost'
          ? route.continue() : route.abort('blockedbyclient');
      });
      await context.addInitScript(() => {
        Object.defineProperty(window, 'RTCPeerConnection', { value: function () { throw new Error('RTC excluded'); } });
      });
      const page = await context.newPage();
      await socialLogin(page, user);
      await expect(async () => {
        const docs = await api(request, '/v3/read', {
          token: user.token, service: 'profile',
          groups: [`api.localhost/groups/users/${user.username}/followers`],
        }, 'http://social.localhost');
        expect(docs.some(doc => doc.author_key === user.username && doc.body.display_name === user.username)).toBe(true);
      }).toPass({ timeout: 20_000, intervals: [500, 1000] });
    } finally {
      await context.close();
    }
  }
  await runInteroperability({
    accounts: { creator, reader, outsider },
    followers: `api.localhost/groups/users/${creator.username}/followers`,
    api: (path, data, status, origin) => api(request, path, data, origin, status),
    poll: callback => expect.poll(callback, { timeout: 20_000, intervals: [500, 1000] }).toBe(true),
    op: (name, _phase, callback) => test.step(name, async () => {
      await callback();
      console.info(`[interop-demo] ${name} passed`);
    }),
  });
});
