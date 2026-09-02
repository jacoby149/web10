import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;

const uniqueUser = () => `studiotest${Date.now()}`;

test.describe('studio with real metering', () => {
  const password = 'TestPass123!';

  test.skip('metering: credits_spent increases after CRUD operations', async () => {
    // GUTTED (v2→v3): tested the v2 star-record model (/{username}/services,
    // credits_spent) which is gone in v3. Metering/billing still exists in v3 but on
    // a different model — needs a fresh test against the v3 billing endpoints.
  });

  test.skip('metering: out-of-credits denies CRUD', async () => {
    // GUTTED (v2→v3): tested the v2 star-record credit limit (/{username}/services
    // $set credits_spent). The v2 model is gone; v3 credit-denial needs a fresh test
    // against the v3 billing model.
  });

  test.skip('metering events: emit_event writes to metering_events collection', async () => {
    // GUTTED (v2→v3): triggered emit_event via a v2 /{username}/posts create. The v2
    // endpoint is gone; v3 emit_event wiring needs a fresh test against /v3/create.
  });

  test('studio UI renders for admin user', async ({ page }) => {
    // The studio page is in ui/ (lane B territory)
    // We can verify the UI loads at the studio route
    await page.goto(`${AUTH_BASE}/studio`);
    await expect(page).toHaveTitle(/web10/i);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });

  // DELETED (v2→v3): "aggregate endpoint charges per pipeline stage" tested the v2
  // MongoDB /{username}/posts/aggregate endpoint. v3 (ClickHouse) has no aggregate
  // endpoint — the feature does not exist in v3, so the test is removed, not stubbed.
});