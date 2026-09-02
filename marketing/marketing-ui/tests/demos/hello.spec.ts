import { test, expect } from './fixtures';

test.describe('Hello demo', () => {
  test('shows login state before auth', async ({ page, demoPage }) => {
    await page.goto('/docs/hello/');
    await expect(page.locator('#authButton')).toHaveText('Log in');
    await expect(page.locator('#message')).toContainText('Not started');
  });

  test('shows username and groups after auth', async ({ page, demoPage }) => {
    await page.goto('/docs/hello/');
    await demoPage.simulateAuth();

    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#message')).toContainText('test/testuser');
    await expect(page.locator('#message')).toContainText('Groups');
    await expect(page.locator('#message code')).toHaveCount(2);
  });

  test('logout clears auth state', async ({ page, demoPage }) => {
    await page.goto('/docs/hello/');
    await demoPage.simulateAuth();
    await expect(page.locator('#authButton')).toHaveText('Log out');

    await page.locator('#authButton').click();
    await page.waitForTimeout(200);

    const token = await page.evaluate(() => document.cookie);
    expect(token).not.toContain('token=');
  });
});