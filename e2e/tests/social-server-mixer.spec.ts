import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { API_BASE, v3Login, v3Signup } from '../v3-helpers';
import { SOCIAL_SERVICES, SOCIAL_OPERATIONS } from '../../marketing/web10-social/src/lib/socialContract';

const port = process.env.E2E_HTTP_PORT || '80';
const suffix = port === '80' ? '' : `:${port}`;
const social = `http://social.localhost${suffix}`;
const boards = [
  ['discover', '/feed?tune=1'],
  ['following', '/feed?tab=following&tune=1'],
  ['video', '/video?tune=1'],
  ['shorts', '/shorts?tune=1'],
  ['music', '/music?tune=1'],
] as const;

// Real container + Vite + node, not the screenshot data mocks. This catches
// missing runtime imports in Dockerfile.social as well as cross-board storage.
for (const width of [1440, 375]) test(`server mixer mounts on every board and retains saved weights at ${width}px`, async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width, height: 900 });
  const username = `mixer${Date.now()}-${width}`;
  const password = 'TestPass123!';
  await v3Signup(request, username, password);
  const token = await v3Login(request, username, password);
  const grant = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: { token, allowed_origin: social, permissions: Object.fromEntries(SOCIAL_SERVICES.map(service => [service, [...SOCIAL_OPERATIONS]])) },
  });
  expect(grant.ok()).toBeTruthy();
  await context.addCookies(['social.localhost', 'auth.localhost'].map(domain => ({ name: 'token', value: token, domain, path: '/' })));
  const pageErrors: string[] = [], failedModules: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && /\.(?:tsx?|jsx?)(?:\?|$)/.test(new URL(response.url()).pathname)) failedModules.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  for (const [name, route] of boards) {
    await page.goto(`${social}${route}`);
    const rack = page.getByTestId('server-mixer');
    await expect(rack).toBeVisible();
    const fader = rack.getByRole('slider');
    await expect(fader).toBeEnabled();
    await expect(fader).toHaveValue(name === 'discover' ? '100' : '37');
    if (name === 'discover') {
      const saved = page.waitForResponse(response => response.url().endsWith('/v3/create') && response.request().postDataJSON()?.body?.sources?.[0]?.weight === 37);
      await fader.fill('37');
      expect((await saved).ok()).toBeTruthy();
    }
    await rack.getByRole('button', { name: 'Edit servers', exact: true }).click();
    await expect(page).toHaveURL(/editServers=1/);
    await expect(page.getByTestId('server-editor')).toBeVisible();
    await rack.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('server-editor')).toHaveCount(0);
    await page.reload();
    await expect(rack).toBeVisible();
    await expect(fader).toBeEnabled();
    await expect(fader).toHaveValue('37');
    if (process.env.E2E_MIXER_SHOTS) {
      await mkdir(process.env.E2E_MIXER_SHOTS, { recursive: true });
      await page.screenshot({ path: resolve(process.env.E2E_MIXER_SHOTS, `mixer-${name}-${width}.png`), fullPage: true });
    }
  }
  expect(pageErrors).toEqual([]);
  expect(failedModules).toEqual([]);
});
