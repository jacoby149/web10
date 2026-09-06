import { test, expect } from './fixtures';

test.describe('Query demo', () => {
  test('shows login state before auth', async ({ page }) => {
    await page.goto('/docs/query/');
    await expect(page.locator('#authButton')).toHaveText('Log in');
    await expect(page.locator('#message')).toContainText('Not started');
    await expect(page.locator('#playground')).not.toBeVisible();
  });

  test('shows the playground with the first example loaded after auth', async ({ page, demoPage }) => {
    await page.goto('/docs/query/');
    await demoPage.simulateAuth();

    await expect(page.locator('#authButton')).toHaveText('log out');
    await expect(page.locator('#message')).toContainText('test/testuser');
    await expect(page.locator('#playground')).toBeVisible();

    // The example chips render, and the first example is loaded into the box.
    await expect(page.locator('[data-testid="example-chip"]')).toHaveCount(5);
    await expect(page.locator('#sql')).toHaveValue(/FROM posts/);
    await expect(page.locator('#runBtn')).toBeEnabled();
  });

  test('running a query renders the result table', async ({ page, demoPage }) => {
    await page.goto('/docs/query/');
    await demoPage.simulateAuth();

    await page.click('#runBtn');

    await expect(page.locator('[data-testid="result-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="result-meta"]')).toContainText('2 rows');
    await expect(page.locator('#result td', { hasText: 'doc_1' })).toBeVisible();
    await expect(page.locator('#result td', { hasText: 'doc_2' })).toBeVisible();
  });

  test('clicking an example chip loads that query', async ({ page, demoPage }) => {
    await page.goto('/docs/query/');
    await demoPage.simulateAuth();

    // The "Reaction breakdown" example (index 2) references the reactions service.
    await page.locator('[data-testid="example-chip"]').nth(2).click();
    await expect(page.locator('#sql')).toHaveValue(/FROM reactions/);
    await expect(page.locator('[data-testid="example-chip"]').nth(2)).toHaveClass(/active/);
  });

  test('a caller-SQL error shows the error state', async ({ page, demoPage }) => {
    await page.goto('/docs/query/');
    await demoPage.simulateAuth();

    await page.fill('#sql', 'SELECT boom FROM posts');
    await page.click('#runBtn');

    await expect(page.locator('[data-testid="result-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="result-error"]')).toContainText('Query failed (400)');
  });

  test('logout clears auth state', async ({ page, demoPage }) => {
    await page.goto('/docs/query/');
    await demoPage.simulateAuth();
    await expect(page.locator('#authButton')).toHaveText('log out');

    await page.locator('#authButton').click();
    await page.waitForTimeout(200);

    const token = await page.evaluate(() => document.cookie);
    expect(token).not.toContain('token=');
  });
});
