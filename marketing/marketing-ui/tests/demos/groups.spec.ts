import { test, expect } from './fixtures';

test.describe('Groups demo', () => {
  test('shows login state before auth', async ({ page, demoPage }) => {
    await page.goto('/docs/groups/');
    await expect(page.locator('#authButton')).toHaveText('Log in');
    await expect(page.locator('#message')).toContainText('Not started');
    await expect(page.locator('#app')).toBeHidden();
  });

  test('shows tabs and create form after auth', async ({ page, demoPage }) => {
    await page.goto('/docs/groups/');
    await demoPage.simulateAuth();

    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#message')).toContainText('testuser');
    await expect(page.locator('#app')).toBeVisible();

    // Tabs should be visible
    const tabs = page.locator('.tabs button');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('My Groups');
    await expect(tabs.nth(1)).toHaveText('I Manage');
    await expect(tabs.nth(2)).toHaveText('Create');
    await expect(tabs.nth(3)).toHaveText('Board');

    // Create tab should show form
    await tabs.nth(2).click();
    await expect(page.locator('#groupName')).toBeVisible();
    await expect(page.locator('#joinPolicy')).toBeVisible();
    await expect(page.locator('#rolePreset')).toBeVisible();
  });

  test('switching tabs shows correct content', async ({ page, demoPage }) => {
    await page.goto('/docs/groups/');
    await demoPage.simulateAuth();

    // Default tab: My Groups
    await expect(page.locator('#tab-my')).toBeVisible();
    await expect(page.locator('#tab-manage')).toBeHidden();

    // Switch to I Manage
    await page.locator('.tabs button').nth(1).click();
    await expect(page.locator('#tab-my')).toBeHidden();
    await expect(page.locator('#tab-manage')).toBeVisible();

    // Switch to Board
    await page.locator('.tabs button').nth(3).click();
    await expect(page.locator('#tab-board')).toBeVisible();
    await expect(page.locator('#postGroup')).toBeVisible();
    await expect(page.locator('#postText')).toBeVisible();
  });

  test('logout clears auth state', async ({ page, demoPage }) => {
    await page.goto('/docs/groups/');
    await demoPage.simulateAuth();
    await expect(page.locator('#authButton')).toHaveText('Log out');

    await page.locator('#authButton').click();
    await page.waitForTimeout(200);

    const token = await page.evaluate(() => document.cookie);
    expect(token).not.toContain('token=');
  });
});
