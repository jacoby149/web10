// sync.mjs — the web10accountsync skill. Incremental: re-scrape the IG
// profile, diff against state/<person>/synced.json, and post ONLY what's new
// (chronological among the new). The account must already exist (run
// import.mjs first). Credentials come from env — the skill asks the operator.
//
// Usage:
//   WEB10_USERNAME=adam WEB10_PASSWORD=*** node sync.mjs adam_malev [--limit N] [--dry]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  loadPerson, requireCreds, inventoryFile, loadJson, APP_ORIGIN,
  web10Login, playwright, consoleToFile,
} from './common.mjs';
import { importPosts } from './core.mjs';

const args = process.argv.slice(2);
const person = args[0];
if (!person) {
  console.error('usage: sync.mjs <person> [--limit N] [--dry]');
  process.exit(2);
}
const flag = (f) => args.includes(f);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const cfg = loadPerson(person);
if (/NO PERMISSION/i.test(cfg.permission || '')) {
  console.error(`[sync] REFUSED: people/${person}.json has no owner permission recorded.`);
  process.exit(3);
}
const creds = requireCreds();

// 1. Fresh IG inventory (the IG side moves; always re-scrape).
console.log('[sync] re-scraping IG inventory');
const r = spawnSync('node', [path.join(import.meta.dirname, 'ig-inventory.mjs'), person], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error(`[sync] inventory scrape failed (exit ${r.status}). If IG is rate-limiting, wait and retry — the last inventory is still at ${inventoryFile(person)}.`);
  process.exit(1);
}
const inventory = loadJson(inventoryFile(person));
const synced = loadJson(path.join(import.meta.dirname, '..', 'state', person, 'synced.json'), { synced: {}, order: [] });
const seen = new Set(Object.keys(synced.synced));

const newPosts = (inventory.posts || []).filter((u) => !seen.has(u));
console.log(`[sync] IG shows ${inventory.posts.length} posts; ${seen.size} already on web10; ${newPosts.length} new.`);

if (!newPosts.length) {
  console.log('[sync] all caught up — nothing to do.');
  process.exit(0);
}

if (flag('--dry')) {
  for (const u of [...newPosts].reverse().slice(0, 20)) console.log('  would post: ' + u);
  if (newPosts.length > 20) console.log(`  … and ${newPosts.length - 20} more`);
  process.exit(0);
}

// 2. Login (the account exists from import.mjs; no signup fallback here).
const { chromium } = playwright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
context.setDefaultTimeout(60000);
let page;
try {
  page = await web10Login(context, creds);
} catch (e) {
  console.error(`[sync] login failed: ${e.message}`);
  await browser.close();
  process.exit(1);
}
consoleToFile(page, 'sync', path.join(import.meta.dirname, '..', 'state', person, 'sync-console.log'));

// 3. Post the new ones, oldest first (chronological among the new).
const chronological = [...newPosts].reverse();
const result = await importPosts({ person, page, posts: chronological, limit, dry: false, shotPrefix: 'sync', browser });
console.log(`\n[sync] done: ${result.processed} new post(s) synced. ${result.stoppedAt ? `STOPPED at ${result.stoppedAt} — rerun to resume.` : 'Account fully in sync.'}`);
await browser.close();
