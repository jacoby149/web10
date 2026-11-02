import { test, expect } from '../../e2e/playwright';
import { api, signup, socialLogin, approveApp, shot, MARKETING_BASE, SOCIAL_BASE } from './helpers';

test('social identity is reused by Snake and Marketplace through real consent', async ({ page, request }) => {
  const user = await signup(request, 'paper');
  await socialLogin(page, user);
  await page.goto(`${SOCIAL_BASE}/u/${user.username}`);
  await page.getByTestId('edit-profile-button').click();
  await page.getByPlaceholder('Display name').fill('Alex Morgan');
  await page.getByPlaceholder('Bio').fill('Synthetic research demo. One identity, different applications.');
  await page.getByTestId('save-profile-button').click();
  await expect(page.getByTestId('profile-name')).toHaveText('Alex Morgan');
  await shot(page, '01-social-profile');

  const followers = `api.localhost/groups/users/${user.username}/followers`;
  let profile: any;
  await expect.poll(async () => {
    const docs = await api(request, '/v3/read', { token: user.token, service: 'profile', groups: [followers] }, SOCIAL_BASE);
    profile = docs.find((doc: any) => doc.author_key === user.username && doc.body.display_name === 'Alex Morgan');
    return Boolean(profile);
  }).toBe(true);

  // Control only food placement, not game state, scoring, writes or responses.
  // The first dot is directly ahead; later dots are off that path.
  await page.addInitScript(() => {
    if (location.pathname.startsWith('/docs/snake/')) Math.random = () => 204 / 397;
  });
  await page.goto(`${MARKETING_BASE}/docs/snake/`);
  await approveApp(page, user, '02-snake-consent');
  await expect(page.getByTestId('status')).toContainText(/leaderboard loaded|no readable scores/i);
  for (const direction of ['up', 'down', 'left', 'right']) {
    expect(await page.getByTestId(`snake-${direction}`).evaluate(button => button.scrollWidth <= button.clientWidth)).toBe(true);
  }
  await page.getByTestId('snake-start').click();
  await expect(page.getByTestId('snake-score')).toHaveText('10');
  // This is an actual direction-control click, including at the mobile viewport.
  await page.getByTestId('snake-down').click();
  await expect(page.getByTestId('snake-state')).toContainText('Game over.', { timeout: 10_000 });
  await expect(page.getByTestId('snake-score')).toHaveText('10');
  await page.getByTestId('snake-submit').click();
  await expect(page.getByTestId('status')).toContainText('score saved');
  const leader = page.getByTestId('snake-leaderboard-row').filter({ hasText: 'Alex Morgan' });
  await expect(async () => {
    await page.getByTestId('refresh').click();
    await expect(leader).toHaveCount(1);
    await expect(leader.getByTestId('snake-leaderboard-score')).toHaveText('10 points');
  }).toPass({ timeout: 20_000 });
  await expect(leader.getByTestId('identity-wall')).toHaveAttribute('href', `${SOCIAL_BASE}/u/${user.username}`);
  await shot(page, '03-snake-joined-profile');
  await shot(page, 'paper-snake-identity', '[data-testid="snake-leaderboard-row"]');

  const joined = await api(request, '/v3/query', {
    token: user.token,
    sql: `SELECT s.doc_id AS doc_id, s.author_key AS author_key, s.body AS body,
      p.doc_id AS profile_id, p.body AS profile_body
      FROM snake_scores s INNER JOIN profile p ON s.author_key = p.author_key
      WHERE p.doc_id = '${profile.doc_id}' ORDER BY s.doc_id`,
  }, MARKETING_BASE);
  expect(joined.count).toBe(1);
  expect(joined.rows[0].author_key).toBe(user.username);
  expect(joined.rows[0].body.score).toBe(10);
  expect(JSON.parse(joined.rows[0].profile_body)).toEqual(profile.body);

  // Revoke the actual browser-origin contract, then drive a fresh UI request.
  await api(request, '/v3/app-contracts/revoke', { token: user.token, allowed_origin: MARKETING_BASE });
  await api(request, '/v3/query', { token: user.token, sql: 'SELECT doc_id FROM snake_scores' }, MARKETING_BASE, 403);
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('status')).toContainText('Access is unavailable or was revoked');
  await expect(page.getByTestId('snake-leaderboard-row')).toHaveCount(0);
  await shot(page, '04-snake-revoked');
  await page.getByTestId('sign-out').click();

  // The hosted demos share an origin. Revoke/sign out above ensures this app
  // independently requests its own service permission rather than inheriting it.
  await page.goto(`${MARKETING_BASE}/docs/marketplace/`);
  await approveApp(page, user, '05-marketplace-consent');
  await expect(page.getByTestId('marketplace-title')).toBeEnabled();
  const title = 'Field recorder';
  await page.getByTestId('marketplace-title').fill(title);
  await page.getByTestId('marketplace-price').fill('79');
  await page.getByTestId('marketplace-description').fill('Synthetic demo listing. Seller identity comes from the profile written in web10-social.');
  await page.getByTestId('marketplace-publish').click();
  await expect(page.getByTestId('status')).toContainText('Listing published');
  const published = page.getByTestId('marketplace-published');
  await expect(published).toBeVisible();
  const detailURL = await published.getAttribute('href');
  expect(detailURL).toBeTruthy();
  await page.goto(detailURL!);
  const detail = page.getByTestId('marketplace-detail');
  await expect(detail.getByTestId('identity-name')).toHaveText('Alex Morgan');
  await expect(detail.getByTestId('listing-title')).toHaveText(title);
  await expect(detail.getByTestId('listing-price')).toHaveText('$79.00');
  await shot(page, '06-marketplace-joined-profile');
  await shot(page, 'paper-marketplace-identity', '[data-testid="marketplace-detail"]');
  await page.reload();
  await expect(detail.getByTestId('identity-name')).toHaveText('Alex Morgan');

  const listings = await api(request, '/v3/query', {
    token: user.token,
    sql: `SELECT l.doc_id AS doc_id, l.author_key AS author_key, l.body AS body,
      p.doc_id AS profile_id, p.body AS profile_body
      FROM marketplace_listings l INNER JOIN profile p ON l.author_key = p.author_key
      WHERE p.doc_id = '${profile.doc_id}' ORDER BY l.doc_id`,
  }, MARKETING_BASE);
  expect(listings.count).toBe(1);
  expect(listings.rows[0].author_key).toBe(user.username);
  expect(listings.rows[0].body.title).toBe(title);
  expect(JSON.parse(listings.rows[0].profile_body)).toEqual(profile.body);
  expect(new URL(detailURL!).searchParams.get('listing')).toBe(listings.rows[0].doc_id);
  console.info('[interop-demo] browser joins, consent, app revocation and detail reload verified');
});
