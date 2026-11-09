// common.mjs — shared plumbing for the marketing-importing scripts.
// Paths, state, credentials, and the proven web10 headless login.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
export const SCRIPTS = here;
export const IMPORT_DIR = path.resolve(here, '..'); // marketing-importing/
export const REPO_ROOT = path.resolve(IMPORT_DIR, '..'); // the web10 repo
export const SOCIAL_DIR = path.join(REPO_ROOT, 'marketing', 'web10-social');
export const SHOTS_DIR = path.join(REPO_ROOT, '.context', 'production-run');
mkdirSync(SHOTS_DIR, { recursive: true });

export const APP_ORIGIN = 'https://social.web10.app';

export const personDir = (p) => path.join(IMPORT_DIR, 'state', p);
export const inventoryFile = (p) => path.join(personDir(p), 'inventory.json');
export const syncedFile = (p) => path.join(personDir(p), 'synced.json');
export const mediaDir = (p, igId) => path.join(personDir(p), 'media', igId);
export const metaFile = (p, igId) => path.join(personDir(p), 'meta', `${igId}.json`);
export const avatarFile = (p) => path.join(personDir(p), 'avatar.jpg');

export function loadPerson(p) {
  const f = path.join(IMPORT_DIR, 'people', `${p}.json`);
  if (!existsSync(f)) {
    console.error(`no people/${p}.json — create it first (see README.md "Adding a person")`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function saveJson(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 1));
}

export function loadJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Credentials come from the environment ONLY. The skill asks the operator;
 *  nothing secret ever lands in this repo. */
export function requireCreds() {
  const username = process.env.WEB10_USERNAME;
  const password = process.env.WEB10_PASSWORD;
  if (!username || !password) {
    console.error('WEB10_USERNAME / WEB10_PASSWORD env vars are required.\nPer the skill: ask the operator for the username and password first, then export them for this run only.');
    process.exit(2);
  }
  return { username, password };
}

export function playwright() {
  const require = createRequire(path.join(SOCIAL_DIR, 'package.json'));
  return require('playwright');
}

export async function shot(page, name) {
  const p = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p }).catch(() => {});
  console.log(`  [shot] ${p}`);
  return p;
}

export function consoleToFile(page, label, file) {
  page.on('console', (m) => {
    try {
      const line = `[${label}] ${m.type()}: ${m.text()}\n`;
      require('node:fs').appendFileSync(file, line);
      if (m.type() === 'error') process.stdout.write('  ' + line);
    } catch {}
  });
}

// ── The proven web10 headless login (social.web10.app + auth.web10.app) ──────
// Login: one tap opens the consent popup. With the app contract already
// granted the popup auto-completes (token + close, zero UI) — every wait
// below is close-tolerant. The signed-in signal is the `@username` account
// row in the desktop topbar.
export async function web10Login(context, creds, { loginFailCheck = false } = {}) {
  const page = await context.newPage();
  console.log(`[login] open ${APP_ORIGIN}/feed`);
  await page.goto(`${APP_ORIGIN}/feed`, { waitUntil: 'domcontentloaded' });
  const signIn = page.getByTestId('sign-in-button-desktop');
  await signIn.waitFor({ state: 'visible', timeout: 90000 });

  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 30000 }),
    signIn.click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.locator('#username').waitFor({ state: 'visible', timeout: 60000 });

  const instant = popup.getByTestId(`account-picker-instant-${creds.username}`);
  if (await instant.count()) {
    await instant.click();
  } else {
    await popup.locator('#username').fill(creds.username);
    await popup.locator('#password').fill(creds.password);
    await popup.getByTestId('login-submit').click({ timeout: 15000 }).catch((e) => {
      if (!/closed/i.test(String(e))) throw e; // auto-complete raced the click
    });
  }

  // loginFailCheck: distinguish "unknown user" (→ caller falls back to
  // web10Signup) from slow-but-working. The auth status line says so plainly.
  if (loginFailCheck) {
    await popup.waitForTimeout(8000).catch(() => {});
    if (!popup.isClosed()) {
      const body = await popup.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/failed to sign in/i.test(body)) {
        popup.close().catch(() => {});
        throw new Error('UNKNOWN_USER');
      }
    }
  }

  // Consent: click if still open (approve-all / continue-as), else it already auto-closed.
  if (!popup.isClosed()) {
    const continueAs = popup.getByTestId('consent-continue-as');
    const approveAll = popup.getByTestId('consent-approve-all');
    const target = (await continueAs.count().catch(() => 0)) ? continueAs : approveAll;
    try {
      await target.first().waitFor({ state: 'visible', timeout: 8000 });
      await target.first().click({ timeout: 5000 });
    } catch {
      // closed mid-wait — fine
    }
  }
  await popup.waitForEvent('close', { timeout: 30000 }).catch(() => {});

  // Poll for the account row (the handoff is two-phase: approve + all-settled).
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const txt = await page.locator('[data-testid="topbar-desktop"]').innerText().catch(() => '');
    if (new RegExp(`@${creds.username}\\b`, 'i').test(txt)) {
      console.log(`[login] signed in as ${creds.username}`);
      return page;
    }
    await page.waitForTimeout(3000);
  }
  throw new Error(`never reached signed-in state for ${creds.username}`);
}

// Signup variant: same as web10Login but switches the popup to the create
// account form first. Used by web10identify when the account does not exist.
export async function web10Signup(context, creds) {
  const page = await context.newPage();
  await page.goto(`${APP_ORIGIN}/feed`, { waitUntil: 'domcontentloaded' });
  const signIn = page.getByTestId('sign-in-button-desktop');
  await signIn.waitFor({ state: 'visible', timeout: 90000 });

  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 30000 }),
    signIn.click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.locator('#username').waitFor({ state: 'visible', timeout: 60000 });

  await popup.getByTestId('login-create-account').click();
  await popup.locator('#username').fill(creds.username);
  await popup.locator('#password').fill(creds.password);
  await popup.locator('#retypepass').fill(creds.password);
  // #provider keeps its default (the production node), #contact stays empty.
  await popup.getByTestId('signup-submit').click({ timeout: 15000 }).catch((e) => {
    if (!/closed/i.test(String(e))) throw e;
  });

  // Consent: a fresh account has a fresh contract → approve-all is shown.
  const approveAll = popup.getByTestId('consent-approve-all');
  const continueAs = popup.getByTestId('consent-continue-as');
  const target = (await approveAll.count().catch(() => 0)) ? approveAll : continueAs;
  try {
    await target.first().waitFor({ state: 'visible', timeout: 30000 });
    await target.first().click({ timeout: 10000 });
    await shot(popup, 'identify-consent');
  } catch {
    if (!popup.isClosed()) {
      const t = await popup.evaluate(() => document.body?.innerText || '').catch(() => '');
      throw new Error(`signup did not reach consent and popup stayed open:\n${t.slice(0, 2000)}`);
    }
  }
  await popup.waitForEvent('close', { timeout: 30000 }).catch(() => {});

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const txt = await page.locator('[data-testid="topbar-desktop"]').innerText().catch(() => '');
    if (new RegExp(`@${creds.username}\\b`, 'i').test(txt)) {
      console.log(`[signup] account ${creds.username} created and signed in`);
      return page;
    }
    await page.waitForTimeout(3000);
  }
  throw new Error(`never reached signed-in state after signup for ${creds.username}`);
}
