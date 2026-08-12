import { test, expect } from './fixtures';

test.describe('Tasks demo', () => {
  test('shows login state before auth', async ({ page }) => {
    await page.goto('/docs/tasks/');
    await expect(page.locator('#authButton')).toHaveText('Log in');
    await expect(page.locator('#message')).toContainText('Not started');
    await expect(page.locator('#app')).not.toBeVisible();
  });

  test('shows app after auth', async ({ page, demoPage }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));
    page.on('pageerror', err => consoleLogs.push('ERROR: ' + err.message));

    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    // Debug: check if initApp was called
    const initAppCalled = await page.evaluate(() => document.getElementById('authButton')?.textContent === 'Log out');
    console.log('initApp called:', initAppCalled);
    console.log('Console logs:', consoleLogs);

    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#message')).toContainText('test/testuser');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#groupSection')).toBeVisible();
    await expect(page.locator('#activeGroup')).not.toBeVisible();
  });

  test('create group shows active group view', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    await page.fill('#groupName', 'my-project');
    await page.click('text=Create group');
    await page.waitForTimeout(300);

    await expect(page.locator('#groupSection')).not.toBeVisible();
    await expect(page.locator('#activeGroup')).toBeVisible();
    await expect(page.locator('#groupId')).toContainText('my-project');
  });

  test('create task', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    await page.fill('#groupName', 'test-group');
    await page.click('text=Create group');
    await page.waitForTimeout(200);

    await page.fill('#taskText', 'Buy groceries');
    await page.click('text=Add');
    await page.waitForTimeout(200);

    await expect(page.locator('.task')).toHaveCount(1);
    await expect(page.locator('.task-text')).toContainText('Buy groceries');
  });

  test('create multiple tasks', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    await page.fill('#groupName', 'test-group');
    await page.click('text=Create group');
    await page.waitForTimeout(200);

    await page.fill('#taskText', 'First task');
    await page.click('text=Add');
    await page.waitForTimeout(100);

    await page.fill('#taskText', 'Second task');
    await page.click('text=Add');
    await page.waitForTimeout(100);

    await expect(page.locator('.task')).toHaveCount(2);
  });

  test('toggle task done', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    await page.fill('#groupName', 'test-group');
    await page.click('text=Create group');
    await page.waitForTimeout(200);

    await page.fill('#taskText', 'Do something');
    await page.click('text=Add');
    await page.waitForTimeout(200);

    const checkbox = page.locator('.task input[type="checkbox"]').first();
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('.task-text')).not.toHaveClass(/done/);

    await checkbox.click();
    await page.waitForTimeout(200);

    await expect(page.locator('.task-text')).toHaveClass(/done/);
  });

  test('delete task', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    await page.fill('#groupName', 'test-group');
    await page.click('text=Create group');
    await page.waitForTimeout(200);

    await page.fill('#taskText', 'To be deleted');
    await page.click('text=Add');
    await page.waitForTimeout(200);

    await expect(page.locator('.task')).toHaveCount(1);
    await page.locator('.task-actions button:has-text("Del")').first().click();
    await page.waitForTimeout(200);

    await expect(page.locator('.task')).toHaveCount(0);
    await expect(page.locator('#taskview')).toContainText('No tasks yet');
  });

  test('shows owner in member list after group creation', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    await page.fill('#groupName', 'test-group');
    await page.click('text=Create group');
    await page.waitForTimeout(300);

    await expect(page.locator('#memberlist')).toContainText('testuser');
    await expect(page.locator('.member-role')).toContainText('owner');
  });

  test('invite member', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();

    await page.fill('#groupName', 'test-group');
    await page.click('text=Create group');
    await page.waitForTimeout(300);

    await page.fill('#inviteUsername', 'alice');
    await page.selectOption('#inviteRole', 'contributor');
    await page.click('text=Invite');
    await page.waitForTimeout(200);

    await expect(page.locator('#memberlist')).toContainText('alice');
    await expect(page.locator('#memberlist')).toContainText('contributor');
  });

  test('logout clears auth state', async ({ page, demoPage }) => {
    await page.goto('/docs/tasks/');
    await demoPage.simulateAuth();
    await expect(page.locator('#authButton')).toHaveText('Log out');

    await page.locator('#authButton').click();
    await page.waitForTimeout(200);

    const token = await page.evaluate(() => document.cookie);
    expect(token).not.toContain('token=');
  });
});