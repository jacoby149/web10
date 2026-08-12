import { test, expect } from './fixtures';

test.describe('Notes demo', () => {
  test('shows login state before auth', async ({ page }) => {
    await page.goto('/docs/notes/');
    await expect(page.locator('#authButton')).toHaveText('Log in');
    await expect(page.locator('#message')).toContainText('Not started');
    await expect(page.locator('#editor')).not.toBeVisible();
  });

  test('shows editor and empty state after auth', async ({ page, demoPage }) => {
    await page.goto('/docs/notes/');
    await demoPage.simulateAuth();

    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#message')).toContainText('test/testuser');
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#curr')).toBeVisible();
    await expect(page.locator('#noteview')).toContainText('No notes yet');
  });

  test('create note', async ({ page, demoPage }) => {
    await page.goto('/docs/notes/');
    await demoPage.simulateAuth();

    await page.fill('#curr', 'Hello from tests');
    await page.click('text=Create note');
    await page.waitForTimeout(200);

    await expect(page.locator('.note')).toHaveCount(1);
    await expect(page.locator('.note textarea')).toHaveValue('Hello from tests');
  });

  test('create multiple notes', async ({ page, demoPage }) => {
    await page.goto('/docs/notes/');
    await demoPage.simulateAuth();

    await page.fill('#curr', 'First note');
    await page.click('text=Create note');
    await page.waitForTimeout(100);

    await page.fill('#curr', 'Second note');
    await page.click('text=Create note');
    await page.waitForTimeout(100);

    await expect(page.locator('.note')).toHaveCount(2);
  });

  test('update note', async ({ page, demoPage }) => {
    await page.goto('/docs/notes/');
    await demoPage.simulateAuth();

    await page.fill('#curr', 'Original text');
    await page.click('text=Create note');
    await page.waitForTimeout(200);

    const noteTextarea = page.locator('.note textarea').first();
    await noteTextarea.fill('Updated text');
    await page.locator('.note-actions button:has-text("Update")').first().click();
    await page.waitForTimeout(200);

    await expect(page.locator('.note textarea')).toHaveValue('Updated text');
  });

  test('delete note', async ({ page, demoPage }) => {
    await page.goto('/docs/notes/');
    await demoPage.simulateAuth();

    await page.fill('#curr', 'To be deleted');
    await page.click('text=Create note');
    await page.waitForTimeout(200);

    await expect(page.locator('.note')).toHaveCount(1);
    await page.locator('.note-actions button:has-text("Delete")').first().click();
    await page.waitForTimeout(200);

    await expect(page.locator('.note')).toHaveCount(0);
    await expect(page.locator('#noteview')).toContainText('No notes yet');
  });

  test('logout clears auth state', async ({ page, demoPage }) => {
    await page.goto('/docs/notes/');
    await demoPage.simulateAuth();
    await expect(page.locator('#authButton')).toHaveText('Log out');

    await page.locator('#authButton').click();
    await page.waitForTimeout(200);

    const token = await page.evaluate(() => document.cookie);
    expect(token).not.toContain('token=');
  });
});