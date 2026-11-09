// core.mjs — the shared import loop (used by import.mjs and sync.mjs).
// Posts one Instagram post to web10 through the real app UI (the New Post
// sheet): attach media, caption = the IG description, public, submit, wait
// for the sheet to close (post created). State is written per post, so any
// run is resumable.
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadJson, saveJson, syncedFile, metaFile, mediaDir, shot, personDir } from './common.mjs';

function igId(url) {
  return url.split('/').filter(Boolean).pop();
}

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', timeout: 600000, ...opts }).toString();
}

/** Post metadata via yt-dlp (description + dates), cached per post. */
export function igMeta(person, url, id) {
  const cached = loadJson(metaFile(person, id), null);
  if (cached) return cached;
  const out = run(`yt-dlp --no-playlist -J ${JSON.stringify(url)}`, { cwd: '/tmp' });
  const j = JSON.parse(out);
  const meta = {
    url,
    id,
    description: j.description || j.title || '',
    upload_date: j.upload_date || null, // YYYYMMDD
    duration: j.duration || null,
    fetched_at: new Date().toISOString(),
  };
  saveJson(metaFile(person, id), meta);
  return meta;
}

/** Download the post's media (all carousel images / the reel video) into
 *  state/<person>/media/<id>/. Skips files already on disk. */
export function igDownload(person, url, id) {
  const dir = mediaDir(person, id);
  mkdirSync(dir, { recursive: true });
  const existing = () => readdirSync(dir).filter((f) => !f.endsWith('.part')).sort();
  if (existing().length > 0) return existing();
  // No --no-playlist: a carousel posts as a per-image playlist; reels are
  // single entries. -f picks bestvideo+bestaudio for video, the image for photos.
  const out = run(
    `yt-dlp -f "bv*+ba/b" --merge-output-format mp4 -o ${JSON.stringify(path.join(dir, '%(playlist_index|)02d-%(id)s.%(ext)s'))} ${JSON.stringify(url)}`,
    { cwd: '/tmp', timeout: 1800000 },
  );
  const files = existing();
  if (!files.length) throw new Error(`yt-dlp downloaded nothing for ${url}\n${out.slice(-2000)}`);
  return files;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Instagram DOM fallback ─────────────────────────────────────────────────
// yt-dlp (2026.08.19) cannot extract the image entries of photo posts
// ("No video formats found"). The rendered post page CAN: the caption is in
// the server-rendered og:description, and every carousel slide's full-res
// CDN img loads when you swipe. One shared browser context for the IG side.
const IG_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function igDom(browser) {
  let state = null;

  async function ensure() {
    if (!state) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'en-US',
        userAgent: IG_UA,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      state = { context, page };
    }
    return state;
  }

  async function close() {
    if (state) {
      await state.context.close().catch(() => {});
      state = null;
    }
  }

  // Caption from og:description:
  // "128 likes, 8 comments - adammalev on November 4, 2026: \"caption\"."
  async function meta(url) {
    const { page } = await ensure();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    const desc = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content || '');
    // "128 likes, 8 comments - adammalev on November 4, 2026: \"caption\"." → caption
    let out = (desc || '').trim();
    const m = out.match(/:\s*(.*)$/s);
    if (m) out = m[1].trim();
    out = out.replace(/^["“‘]+/, '').replace(/["”’]+\.?$/, '').trim();
    return { description: out };
  }

  // Every carousel image's full-res URL. Slides are virtualized — the
  // [aria-label="Next"] button only advances via in-page event dispatch
  // (a Playwright click / real mouse drag / CDP touch do NOT trigger it).
  // Reuses the current page if it's already on this post (meta() loads it).
  async function images(url) {
    const { page } = await ensure();
    if (page.url() !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
    }
    const collect = () =>
      page.evaluate(() =>
        [...new Set([...document.querySelectorAll('img')]
          .filter((i) => i.naturalWidth >= 600 && i.src.includes('cdninstagram'))
          .map((i) => i.src))]);
    // The carousel is VIRTUALIZED (~3 slides in the DOM at a time, old ones
    // unmount), so "DOM count grew" is the wrong signal — track the union of
    // URLs seen across all swipes instead. First-seen order == slide order.
    const union = new Set();
    const absorb = (urls) => urls.forEach((u) => union.add(u));
    absorb(await collect());
    let noGrowth = 0;
    for (let i = 0; i < 30 && noGrowth < 3; i++) {
      const swiped = await page.evaluate(() => {
        const btn = document.querySelector('[aria-label="Next"]');
        if (!btn || btn.disabled || !btn.offsetParent) return false;
        const r = btn.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
        btn.dispatchEvent(new PointerEvent('pointerdown', opts));
        btn.dispatchEvent(new MouseEvent('mousedown', opts));
        btn.dispatchEvent(new PointerEvent('pointerup', opts));
        btn.dispatchEvent(new MouseEvent('mouseup', opts));
        btn.dispatchEvent(new MouseEvent('click', opts));
        return true;
      });
      if (!swiped) break; // no Next button: single-image post
      let grew = false;
      for (let k = 0; k < 8 && !grew; k++) {
        await page.waitForTimeout(1500);
        const before = union.size;
        absorb(await collect());
        if (union.size > before) grew = true;
      }
      noGrowth = grew ? 0 : noGrowth + 1;
    }
    return [...union];
  }

  return { meta, images, close, _ensure: ensure };
}

function isPhotoYtDlpError(e) {
  return /No video formats found|Unable to extract/i.test(String(e?.message || e));
}

/** Set the caption on the open composer via the __editor test seam. */
async function setCaption(page, composer, text) {
  if (!text) return;
  const paras = text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  await page
    .evaluate((html) => {
      const el = document.querySelector('[data-testid="composer-textarea"]');
      const editor = el && el.__editor;
      if (editor) editor.commands.setContent(html, false);
      else throw new Error('composer editor seam missing');
    }, paras);
}

/**
 * Import a list of IG post URLs (in processing order = oldest first).
 * Returns { processed, stoppedAt }. Writes state/<person>/synced.json per post.
 */
export async function importPosts({ person, page, posts, limit = Infinity, dry = false, shotPrefix = 'import', browser = null }) {
  const synced = loadJson(syncedFile(person), { synced: {}, order: [] });
  const pending = posts.filter((u) => !synced.synced[u]).slice(0, limit);
  console.log(`[import] ${posts.length} post(s) in scope, ${pending.length} pending (limit ${limit === Infinity ? '∞' : limit})`);
  if (!pending.length) {
    console.log('[import] nothing to do — all in scope already synced.');
    return { processed: 0, stoppedAt: null };
  }

  let processed = 0;
  for (let i = 0; i < pending.length; i++) {
    const url = pending[i];
    const id = igId(url);
    console.log(`\n[import] (${i + 1}/${pending.length}) ${url}`);

    if (dry) {
      console.log('  [dry] would import');
      continue;
    }

    let meta, files;
    try {
      meta = igMeta(person, url, id);
      files = igDownload(person, url, id);
    } catch (e) {
      if (!isPhotoYtDlpError(e) || !browser) {
        console.error(`  FAILED download/meta: ${e.message}`);
        return { processed, stoppedAt: url };
      }
      // Photo post (or something yt-dlp can't parse): DOM fallback — the
      // caption comes from og:description, the slides from swiping the
      // carousel, and each slide is a signed full-res CDN url.
      console.log('  yt-dlp failed — DOM fallback (og caption + carousel swipe)');
      const ig = igDom(browser);
      try {
        const domMeta = await ig.meta(url);
        meta = {
          url, id,
          description: domMeta.description,
          upload_date: null, duration: null,
          fetched_at: new Date().toISOString(), via: 'dom',
        };
        saveJson(metaFile(person, id), meta);
        const dir = mediaDir(person, id);
        mkdirSync(dir, { recursive: true });
        const urls = await ig.images(url);
        if (!urls.length) throw new Error('DOM fallback found no images');
        files = urls.map((u, i) => `${String(i + 1).padStart(2, '0')}-photo.jpg`);
        urls.forEach((u, i) => {
          execSync(
            `curl -sL -A ${JSON.stringify('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36')} ${JSON.stringify(u)} -o ${JSON.stringify(path.join(dir, files[i]))}`,
            { timeout: 120000 },
          );
        });
      } catch (e2) {
        console.error(`  FAILED DOM fallback: ${e2.message}`);
        await ig.close().catch(() => {});
        return { processed, stoppedAt: url };
      }
      await ig.close().catch(() => {});
    }
    console.log(`  media: ${files.join(', ')}`);
    console.log(`  caption: ${JSON.stringify((meta.description || '').slice(0, 100))}`);

    try {
      // 1. Open the New Post sheet.
      await page.getByTestId('new-post-fab').click();
      const composer = page.locator('[data-testid="new-post-sheet"] [data-testid="post-composer"]').first();
      await composer.waitFor({ state: 'visible', timeout: 30000 });

      // 2. Public visibility (default, but assert it).
      const vis = composer.locator('[data-testid="visibility-selector"]');
      if ((await vis.inputValue().catch(() => null)) !== 'public') await vis.selectOption('public');

      // 3. Attach the media (carousel-safe: all files, playlist order).
      await composer.locator('input[type="file"]').setInputFiles(files.map((f) => path.join(mediaDir(person, id), f)));

      // 4. Caption = the IG description.
      await setCaption(page, composer, meta.description);

      // 5. Wait for the media tray to finish client-side processing
      //    (the overlay spins while validating/reading metadata; an error box
      //    means the file was rejected — fail fast, don't wait it out).
      const tray = composer.locator('[data-testid="media-tray"]');
      await tray.waitFor({ state: 'visible', timeout: 30000 });
      const deadline = Date.now() + 120000;
      let processing = true;
      while (Date.now() < deadline && processing) {
        processing = false;
        const spin = await tray.locator('.animate-spin').count();
        const errBox = await tray.locator('[data-lucide="alert-triangle"]').count();
        if (errBox > 0) {
          const msg = await tray.locator('.text-danger').first().innerText().catch(() => 'media rejected');
          throw new Error(`media rejected: ${msg}`);
        }
        if (spin > 0 || (await tray.locator('img, video').count()) === 0) {
          processing = true;
          await page.waitForTimeout(2000);
        }
      }

      // 6. Submit and wait for the sheet to close itself (= post created).
      await composer.locator('[data-testid="post-submit"]').click();
      const sheet = page.locator('[data-testid="new-post-sheet"]');
      try {
        await sheet.waitFor({ state: 'detached', timeout: 5 * 60 * 1000 });
      } catch {
        const errEl = composer.locator('[data-testid="composer-error"]');
        const errMsg = (await errEl.count()) ? await errEl.first().innerText().catch(() => '') : '';
        console.error(`  POST DID NOT COMPLET${errMsg ? ` — error: ${errMsg}` : 'E within 5 min'}`);
        await shot(page, `${shotPrefix}-FAILED-${id}`);
        return { processed, stoppedAt: url };
      }

      synced.synced[url] = {
        ig_id: id,
        files,
        caption: meta.description || '',
        upload_date: meta.upload_date,
        posted_at: new Date().toISOString(),
      };
      synced.order.push(url);
      saveJson(syncedFile(person), synced);
      processed++;
      console.log(`  ✓ posted + recorded (${processed} total)`);
      if (i === 0) await shot(page, `${shotPrefix}-01-first-post`);
    } catch (e) {
      console.error(`  FAILED post UI step: ${e.message}`);
      await shot(page, `${shotPrefix}-FAILED-${id}`);
      return { processed, stoppedAt: url };
    }
    // Small pause between posts (behave like a human, not a firehose).
    await page.waitForTimeout(2000);
  }

  return { processed, stoppedAt: null };
}
