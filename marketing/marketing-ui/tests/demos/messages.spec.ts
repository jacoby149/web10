import { test, expect } from './fixtures';

test.describe('Messages demo', () => {
  test('shows login state before auth', async ({ page }) => {
    await page.goto('/docs/messages/');
    await expect(page.locator('#authButton')).toHaveText('Log in');
    await expect(page.locator('#message')).toContainText('Not started');
    await expect(page.locator('#editor')).not.toBeVisible();
  });

  test('shows composer and empty state after auth', async ({ page, demoPage }) => {
    await page.goto('/docs/messages/');
    await demoPage.simulateAuth();

    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#message')).toContainText('test/testuser');
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#toUsername')).toBeVisible();
    await expect(page.locator('#body')).toBeVisible();
    await expect(page.locator('#messageview')).toContainText('No messages yet');
  });

  test('recipient defaults to self after auth', async ({ page, demoPage }) => {
    await page.goto('/docs/messages/');
    await demoPage.simulateAuth();

    await expect(page.locator('#toUsername')).toHaveValue('testuser');
    await expect(page.locator('#toProvider')).toHaveValue('test');
  });

  test('send message to self', async ({ page, demoPage }) => {
    await page.goto('/docs/messages/');
    await demoPage.simulateAuth();

    await page.fill('#body', 'Hello to myself');
    await page.locator('button[onclick="sendMessage()"]').click();
    await page.waitForTimeout(500);

    expect((await page.evaluate(() => (window as any).web10.__mockStore)).messages.length).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.message')).toHaveCount(1);
    await expect(page.locator('.message-text')).toContainText('Hello to myself');
    await expect(page.locator('.message-from')).toContainText('testuser/test');
  });

  test('send multiple messages', async ({ page, demoPage }) => {
    await page.goto('/docs/messages/');
    await demoPage.simulateAuth();

    await page.fill('#body', 'Message one');
    await page.locator('button[onclick="sendMessage()"]').click();
    await page.waitForTimeout(300);

    await page.fill('#body', 'Message two');
    await page.locator('button[onclick="sendMessage()"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.message')).toHaveCount(2);
  });

  test('delete message', async ({ page, demoPage }) => {
    await page.goto('/docs/messages/');
    await demoPage.simulateAuth();

    await page.fill('#body', 'To be deleted');
    await page.locator('button[onclick="sendMessage()"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.message')).toHaveCount(1);
    await page.locator('.message-actions button:has-text("Delete")').first().click();
    await page.waitForTimeout(200);

    await expect(page.locator('.message')).toHaveCount(0);
    await expect(page.locator('#messageview')).toContainText('No messages yet');
  });

  test('message body clears after send', async ({ page, demoPage }) => {
    await page.goto('/docs/messages/');
    await demoPage.simulateAuth();

    await page.fill('#body', 'Temporary message');
    await page.locator('button[onclick="sendMessage()"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#body')).toHaveValue('');
  });

  test('logout clears auth state', async ({ page, demoPage }) => {
    await page.goto('/docs/messages/');
    await demoPage.simulateAuth();
    await expect(page.locator('#authButton')).toHaveText('Log out');

    await page.locator('#authButton').click();
    await page.waitForTimeout(200);

    const token = await page.evaluate(() => document.cookie);
    expect(token).not.toContain('token=');
  });
});