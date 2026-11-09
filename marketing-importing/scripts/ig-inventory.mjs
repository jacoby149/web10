// ig-inventory.mjs — scrape a PUBLIC Instagram profile with headless Chromium
// (the yt-dlp `instagram:user` extractor is broken, so we read the rendered
// DOM). Writes state/<person>/inventory.json:
//   { handle, username, name, bio, external_url, post_count, avatar_url,
//     posts: [<url>, ...] }   ← posts in DOM order = NEWEST FIRST
//
// DOM facts (probed 09.11.2026, desktop web, logged out):
//  - a login-wall modal overlays the header; its close is
//    `[role="dialog"] div[role="button"]:has(svg[aria-label="Close"])`.
//  - the username is a SPAN in an H2 (no h1 on the page).
//  - header block = the username's nearest ancestor containing "followers"
//    but NOT the "Show more posts" grid button (username, stats, name, bio,
//    link line all live in it; suggested rails + grid do not).
//  - the bio may be truncated behind a "…more" leaf — click it, then re-read.
//  - the bio website can be bare text ("adammalev.com"), not an <a>.
//  - logged-out header shows no post count — the grid count is authoritative.
//  - stats render as value+label leaf pairs ("10" / "posts").
// Usage: node ig-inventory.mjs <person>
import { playwright, loadPerson, inventoryFile, saveJson, shot, consoleToFile } from './common.mjs';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const person = process.argv[2];
if (!person) {
  console.error('usage: ig-inventory.mjs <person>');
  process.exit(2);
}
const cfg = loadPerson(person);
const handle = cfg.instagram_handle;
const stateDir = path.join(import.meta.dirname, '..', 'state', person);
mkdirSync(stateDir, { recursive: true });

const { chromium } = playwright();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});
const page = await context.newPage();
consoleToFile(page, 'ig', path.join(stateDir, 'ig-console.log'));

// The login wall can (re)appear — close every variant we know.
const closeModals = async () => {
  const x = page.locator('[role="dialog"] div[role="button"]:has(svg[aria-label="Close"])').first();
  if (await x.count()) await x.click({ timeout: 2500 }).catch(() => {});
  for (const name of ['Not now', 'Maybe later']) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count()) await b.click({ timeout: 1500 }).catch(() => {});
  }
};

// Header scope + leaf lines, in one evaluate (share the scope rule).
const readHeader = () =>
  page.evaluate((handle) => {
    const main = document.querySelector('main');
    if (!main) return null;
    // The username leaf: first visible, childless element with the handle text.
    const leaves = [...main.querySelectorAll('span, div, h2, a')]
      .filter((el) => el.children.length === 0 && el.offsetParent !== null);
    const uname = leaves.find((el) => (el.innerText || '').trim().toLowerCase() === handle.toLowerCase());
    if (!uname) return { error: 'username leaf not found' };
    // Header block: nearest ancestor with the "followers" stat but without the
    // "Show more posts" grid affordance.
    let scope = uname.parentElement;
    while (
      scope &&
      scope !== main &&
      (!/followers/i.test(scope.innerText || '') || /Show more posts/i.test(scope.innerText || ''))
    ) {
      scope = scope.parentElement;
    }
    const root = scope && /followers/i.test(scope.innerText || '') ? scope : main;
    // Avatar: topmost visible img in main (the profile photo, top-left).
    const avatar = [...main.querySelectorAll('img')]
      .filter((im) => im.offsetParent !== null)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    let avatarUrl = avatar ? avatar.src : null;
    if (avatar && avatar.srcset) {
      const urls = avatar.srcset.split(',').map((s) => s.trim().split(/\s+/)[0]);
      avatarUrl = urls[urls.length - 1] || avatarUrl;
    }
    // NOTE: do NOT rewrite the CDN size variant (s150x150 → s640x640) — the
    // URL is signed per-variant and the rewrite 403s. s150 is all the DOM
    // exposes; web10 re-encodes the avatar on upload anyway.
    // innerText lines are the reliable unit: bio lines live in divs with <br>
    // children (a childless-leaf walk misses them); "more" + highlight titles
    // show up here too (filtered positionally on the node side).
    const text = (root.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const links = [...root.querySelectorAll('a[href^="http"]')]
      .filter((a) => !a.href.includes('instagram.com') && a.offsetParent !== null)
      .map((a) => ({ href: a.href, text: (a.innerText || '').trim() }));
    return {
      username: handle,
      text,
      avatarUrl,
      links,
      scopeTag: root.tagName,
      scopeSnippet: (root.innerText || '').slice(0, 200),
    };
  }, handle);

try {
  console.log(`[inventory] open instagram.com/${handle}`);
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await closeModals();
  await page.waitForTimeout(1500);

  let header = await readHeader();
  if (!header || header.error) {
    console.log('[inventory] first read failed, closing modals and retrying…');
    await closeModals();
    await page.waitForTimeout(2000);
    header = await readHeader();
    if (!header || header.error) throw new Error(`profile did not render: ${header?.error || 'no <main>'}`);
  }
  console.log(`[inventory] scope: <${header.scopeTag}> :: ${JSON.stringify(header.scopeSnippet)}`);
  const { links } = header;

  // Expand a truncated bio ("…more" line inside the header), then re-read.
  const more = page.locator('main').getByText(/^(…\s*)?more$/i).first();
  if (await more.count()) {
    await more.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const header2 = await readHeader();
  const lines = (header2 || header).text;

  // Positional parse of the header lines:
  //   [handle, "N posts"?, "N followers", "N following", Full Name,
  //    (handle again), bio line..., pure-domain link line, highlight titles...]
  const isStatLine = (l) => /^\d[\d,.]*[kKmMbB]?\s*(posts?|followers|following)$/i.test(l);
  const isDomainLine = (l) => /^([a-z0-9-]+\.)+[a-z]{2,}(:\/\S*)?$/i.test(l);
  const statIdx = lines.findIndex(isStatLine);
  const nameIdx = lines.findIndex((l, i) => i > statIdx && !isStatLine(l) && l !== handle && !isDomainLine(l));
  const name = nameIdx >= 0 ? lines[nameIdx] : cfg.display_name || handle;
  const linkLineIdx = lines.findIndex((l, i) => i > nameIdx && isDomainLine(l));
  const bioEnd = linkLineIdx >= 0 ? linkLineIdx : lines.length;
  const bio = lines
    .slice(nameIdx + 1, bioEnd)
    .filter((l) => l !== handle && !isStatLine(l) && !/^more$/i.test(l))
    .join('\n');
  const postCountLine = lines.find(isStatLine);
  const postCount = postCountLine ? parseInt(postCountLine.replace(/[^0-9]/g, ''), 10) : null;
  const externalUrl =
    linkLineIdx >= 0 ? `https://${lines[linkLineIdx].replace(/^https?:\/\//i, '')}` :
    links[0]?.href ||
    cfg.website_default ||
    `https://www.instagram.com/${handle}/`;

  console.log(`[inventory] name=${JSON.stringify(name)} (line ${nameIdx})`);
  console.log(`[inventory] avatar=${String(header.avatarUrl || '').slice(0, 70)}…`);
  console.log(`[inventory] links=${JSON.stringify(links.map((l) => l.href))}`);
  console.log(`[inventory] link=${externalUrl}`);
  console.log(`[inventory] bio=${JSON.stringify(bio.slice(0, 200))}`);

  // Grid: the handler's OWN post permalinks, DOM order (newest first).
  // Filter by handle — suggested carousels link other users' posts.
  const collect = () =>
    page.evaluate((handle) => {
      const seen = new Set();
      const urls = [];
      for (const a of document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]')) {
        const href = a.href;
        if (href.includes(`/${handle}/`) && !seen.has(href)) {
          seen.add(href);
          urls.push(href);
        }
      }
      return urls;
    }, handle);

  let urls = await collect();
  let stale = 0;
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    await closeModals();
    const next = await collect();
    if (next.length === urls.length) {
      stale++;
      if (stale >= 4) break;
    } else {
      stale = 0;
      urls = next;
    }
  }
  console.log(`[inventory] grid links collected: ${urls.length}`);
  if (!urls.length) throw new Error('grid is empty — profile private, or the wall blocked the grid');

  await closeModals();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await shot(page, `inventory-${person}-profile`);

  saveJson(inventoryFile(person), {
    person,
    handle,
    username: handle,
    name,
    bio,
    external_url: externalUrl,
    post_count: urls.length,
    avatar_url: header.avatarUrl,
    scraped_at: new Date().toISOString(),
    posts: urls, // NEWEST FIRST
  });
  console.log(`[inventory] wrote ${inventoryFile(person)}`);
} finally {
  await browser.close();
}
