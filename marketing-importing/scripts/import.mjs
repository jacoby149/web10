// import.mjs — the web10import skill. Full first-time import of a person:
//   1. IG inventory (scrape)
//   2. web10 account (log in; create it if it does not exist yet)
//   3. profile setup (display name, bio, website, PFP from the IG profile)
//   4. every IG post, CHRONOLOGICAL (oldest → newest), through the real app
//      UI (the New Post sheet) — state-tracked so the run is resumable.
//
// Usage:
//   WEB10_USERNAME=adam WEB10_PASSWORD=*** node import.mjs adam_malev [--limit N] [--dry] [--no-profile] [--refresh-inventory]
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  loadPerson, requireCreds, inventoryFile, avatarFile, syncedFile, loadJson, APP_ORIGIN,
  web10Login, web10Signup, playwright, shot, consoleToFile,
} from './common.mjs';
import { importPosts } from './core.mjs';

const args = process.argv.slice(2);
const person = args[0];
if (!person) {
  console.error('usage: import.mjs <person> [--limit N] [--dry] [--no-profile] [--refresh-inventory]');
  process.exit(2);
}
const flag = (f) => args.includes(f);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const cfg = loadPerson(person);
if (/NO PERMISSION/i.test(cfg.permission || '')) {
  console.error(`[import] REFUSED: people/${person}.json has no owner permission recorded.\nAdd the permission (who granted it, when) before importing anyone's content.`);
  process.exit(3);
}
const creds = requireCreds();

function runLocal(script, extra = []) {
  const r = spawnSync('node', [path.join(import.meta.dirname, script), person, ...extra], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[import] ${script} failed (exit ${r.status}) — aborting.`);
    process.exit(r.status || 1);
  }
}

// 1. Inventory ─────────────────────────────────────────────────────────────
let inventory;
if (flag('--refresh-inventory')) {
  console.log('[import] refreshing IG inventory');
  runLocal('ig-inventory.mjs');
} else if (!existsSync(inventoryFile(person))) {
  console.log('[import] no inventory yet — scraping');
  runLocal('ig-inventory.mjs');
} else {
  inventory = JSON.parse(readFileSync(inventoryFile(person), 'utf8'));
  console.log(`[import] using existing inventory (${inventory.posts.length} posts, scraped ${inventory.scraped_at})`);
}

// 2. Avatar download (with variant fallback — the URL may be a rewritten CDN size)
async function ensureAvatar() {
  if (!inventory.avatar_url) return null;
  const { execSync } = await import('node:child_process');
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const ok = (f) => existsSync(f) && statSync(f).size > 500;
  if (ok(avatarFile(person))) return avatarFile(person);
  const variants = [inventory.avatar_url]; // the URL is signed per-variant — no rewrites
  for (const u of variants) {
    try {
      execSync(`curl -sL -A ${JSON.stringify(UA)} ${JSON.stringify(u)} -o ${JSON.stringify(avatarFile(person))}`, { timeout: 60000 });
      if (ok(avatarFile(person))) {
        console.log(`[import] avatar downloaded (${statSync(avatarFile(person)).size} bytes)`);
        return avatarFile(person);
      }
    } catch {}
  }
  console.log('[import] avatar download failed — continuing without PFP');
  return null;
}

// 3. Browser: login (or create the account), then profile + import ─────────
const { chromium } = playwright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
context.setDefaultTimeout(60000);
// The app's avatar/banner upload can spawn a DETACHED <input type=file>
// (document.createElement + .click(), never appended). Headless Chromium won't
// open a file chooser for an element not in the DOM — patch InputElement.click
// to attach detached file inputs synchronously (same tick, before the click).
await context.addInitScript(() => {
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (...args) {
    try {
      if (this.type === 'file' && !this.isConnected) {
        this.style.display = 'none';
        document.body.appendChild(this);
      }
    } catch {}
    return orig.apply(this, args);
  };
});
let page;
try {
  try {
    page = await web10Login(context, creds, { loginFailCheck: !flag('--dry') });
  } catch (e) {
    if (String(e.message).includes('UNKNOWN_USER')) {
      console.log('[import] account does not exist yet — creating it');
      page = await web10Signup(context, creds);
    } else {
      throw e;
    }
  }
} catch (e) {
  console.error(`[import] login failed: ${e.message}`);
  await browser.close();
  process.exit(1);
}
consoleToFile(page, 'import', path.join(import.meta.dirname, '..', 'state', person, 'import-console.log'));

if (!flag('--dry')) {
  // ── 4. Profile setup ───────────────────────────────────────────────────
  if (!flag('--no-profile')) {
    console.log('[import] profile setup');
    await page.goto(`${APP_ORIGIN}/u/${creds.username}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('edit-profile-button').waitFor({ state: 'visible', timeout: 60000 });
    await page.getByTestId('edit-profile-button').click();
    const nameInput = page.getByTestId('profile-name-input');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.fill(inventory.name || cfg.display_name || creds.username);
    if (inventory.bio && inventory.bio.trim()) {
      await page.getByPlaceholder('Bio').fill(inventory.bio);
    }
    if (inventory.external_url) {
      await page.getByPlaceholder('Website').fill(inventory.external_url);
    }
    await page.getByTestId('save-profile-button').click();
    await nameInput.waitFor({ state: 'detached', timeout: 30000 });
    console.log('  name/bio/website saved');

    // PFP. Clicking the camera button opens the face-picker lightbox, whose
    // "Upload" tile drives a PERSISTENT in-DOM input (the e2e seam) → crop
    // view → confirm. A raw filechooser is the fallback (older app builds).
    // A PFP hiccup must not block the content import: catch and continue.
    const avatar = await ensureAvatar();
    if (avatar) {
      try {
        console.log('[import] avatar upload');
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
        await page.getByTestId('edit-avatar-button').click();
        const lightbox = page.getByTestId('profile-media-lightbox');
        const chooser = await chooserPromise;
        if (chooser) {
          await chooser.setFiles(avatar);
          await page.waitForTimeout(10000); // upload + save round-trip
        } else {
          await lightbox.waitFor({ state: 'visible', timeout: 15000 });
          await lightbox.getByTestId('profile-media-upload-input').setInputFiles(avatar);
          const confirm = page.getByTestId('face-crop-confirm');
          await confirm.waitFor({ state: 'visible', timeout: 30000 });
          await confirm.click();
          await lightbox.waitFor({ state: 'detached', timeout: 45000 });
        }
        const uploadError = page.getByTestId('profile-upload-error');
        if (await uploadError.count()) {
          console.error(`  avatar upload error: ${await uploadError.innerText().catch(() => '')}`);
        } else {
          console.log('  avatar saved');
        }
      } catch (e) {
        console.error(`  avatar upload failed (${String(e.message).split('\n')[0]}) — continuing without PFP; fix later via the profile screen`);
        // Make sure nothing is left covering the UI before the post loop.
        await page.getByTestId('profile-media-lightbox-close').click({ timeout: 5000 }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
      }
    } else {
      console.log('  no avatar available — skipped');
    }
    await shot(page, 'import-01-profile');
  }

  // ── 5. Chronological import ────────────────────────────────────────────
  // Inventory is newest-first → reverse → oldest first.
  const chronological = [...inventory.posts].reverse();
  const result = await importPosts({
    person, page, posts: chronological,
    limit, dry: false, shotPrefix: 'import', browser,
  });
  console.log(`\n[import] done: ${result.processed} posted this run. ${result.stoppedAt ? `STOPPED at ${result.stoppedAt} — fix and rerun (state resumes where it left off).` : 'All in-scope posts synced.'}`);
} else {
  const chronological = [...inventory.posts].reverse();
  const synced = loadJson(syncedFile(person), { synced: {} });
  const pending = chronological.filter((u) => !synced.synced[u]).length;
  console.log(`[import] DRY RUN: ${chronological.length} posts in scope, ${pending} not yet synced; first ${Math.min(limit, pending)} would be posted.`);
}

await browser.close();
