import { test, expect } from '@playwright/test';

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

test.describe('marketing import information and node reporting', () => {
  test('marketing-ui import informational route renders', async ({ page }) => {
    await page.goto(`${MARKETING_BASE}/import`);
    await expect(page).toHaveTitle(/web10/i);
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 10000 });
  });

  test('analytics: pageview tracking (first-party beacon to the node)', async ({ request }) => {
    const res = await request.post(`${API_BASE}/analytics/event`, {
      data: {
        type: 'pageview',
        app: 'e2e',
        path: '/import',
        referrer: 'https://google.com',
        user_agent: 'e2e-test',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('analytics: funnel tracking (first-party beacon to the node)', async ({ request }) => {
    const res = await request.post(`${API_BASE}/analytics/event`, {
      data: {
        type: 'funnel',
        app: 'e2e',
        event: 'export_started',
        metadata: { platform: 'instagram' },
      },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('marketing bug report submission goes directly to the node', async ({ request }) => {
    // Match the anonymous marketing ReportBug payload, not the retired feedback API.
    const res = await request.post(`${API_BASE}/bug_report`, {
      data: {
        description: 'e2e test feedback',
        email: 'test@web10.app',
        page_url: '/import',
        app_version: '1.0.0',
        device_info: 'e2e-test',
        error_message: '',
        screenshots: [],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('submitted');
    expect(body.report_id).toMatch(/^[0-9a-f]{32}$/);
    expect(typeof body.created_at).toBe('string');
    expect(Number.isNaN(Date.parse(body.created_at))).toBe(false);
  });
});
