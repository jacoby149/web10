// Build a "real" YouTube Takeout fixture for the import e2e.
//
// The import pipeline only reads the CSV/JSON data members of a Takeout
// archive — it deliberately skips the video MP4s (a real export is ~27GB of
// them). So the "real test" does NOT upload 29GB: it reads the operator's
// actual Takeout CSVs (videos.csv, comments.csv, channel.csv), packs them into
// a small zip with the REAL Takeout member paths, and computes the exact
// expected counts using the SAME logic as the node parser
// (api/app/services/importers/youtube.py) — so the e2e asserts the real data
// landed, not a synthetic guess.
//
// Two sources:
//   1. REAL — the operator's export (YT_EXPORT_DIR, or a default path). The
//      CSVs are read straight from the takeout-*.zip parts (no 29GB extract).
//   2. SYNTHETIC — a committed fallback (yt-takeout-synthetic.zip) so CI / a
//      fresh checkout with no export still runs a green, deterministic test.
//
// Output: a zip buffer + a manifest { source, expected: {...}, zipPath }.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
// fflate ships with @playwright/test's transitive deps; fall back to a tiny
// hand-rolled store-only zip if it's not resolvable (keeps this dependency-free).
let zipSync;
try {
  ({ zipSync } = require('fflate'));
} catch {
  zipSync = null;
}

const BASE = 'Takeout/YouTube and YouTube Music/';
const VIDEOS = `${BASE}video metadata/videos.csv`;
const COMMENTS = `${BASE}comments/comments.csv`;
const CHANNEL = `${BASE}channels/channel.csv`;

// ---------------------------------------------------------------------------
// CSV parsing (mirrors the node parser's csv.DictReader behavior)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  // Minimal RFC4180 parser: handles quoted fields with embedded commas,
  // newlines, and escaped quotes ("" -> "). Returns { header, rows } so a
  // subset can be re-serialized (the e2e chunk limit).
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else if (c === '\r') {
      // skip (CRLF)
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0];
  const dataRows = rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, idx) => (o[h] = r[idx] ?? ''));
    return o;
  });
  return { header, rows: dataRows };
}

// Re-encode rows (subset of a parsed CSV) back to RFC4180 text — used to build
// the limited chunk the e2e uploads. Quotes any field containing a comma,
// quote, or newline (mirrors how Takeout writes its CSVs).
function serializeCsv(header, rows) {
  const quote = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.map(quote).join(',')];
  for (const r of rows) lines.push(header.map((h) => quote(r[h])).join(','));
  return lines.join('\n');
}

function safeStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

// The Comment Text field is a JSON *sequence* (one or more concatenated
// objects, NOT an array) — mirrors _parse_comment_text in youtube.py.
function parseCommentText(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // A JSON sequence is a run of top-level objects / strings. Decode them in a
  // loop with a lenient scanner (no native raw_decode in JS).
  const parts = [];
  let idx = 0;
  const tryDecode = (start) => {
    // find the end of the next JSON value starting at `start`
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) {
          const slice = s.slice(start, i + 1);
          try {
            return { value: JSON.parse(slice), end: i + 1 };
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  };
  try {
    while (idx < s.length) {
      while (idx < s.length && ' \t\r\n,'.includes(s[idx])) idx++;
      if (idx >= s.length) break;
      const dec = tryDecode(idx);
      if (!dec) break;
      const v = dec.value;
      if (v && typeof v === 'object' && typeof v.text === 'string' && v.text) parts.push(v.text);
      else if (typeof v === 'string') parts.push(v);
      idx = dec.end;
    }
  } catch {
    return s || null;
  }
  return parts.join('') || null;
}

// ---------------------------------------------------------------------------
// Expected-count computation (mirrors map_youtube_* in youtube.py)
// ---------------------------------------------------------------------------

function computeExpected(videos, comments, channels) {
  const videoIds = new Set();
  let stagingPosts = 0;
  let publicStaged = 0;
  let privateStaged = 0;
  for (const r of videos) {
    const vid = safeStr(r['Video ID']);
    if (!vid) continue;
    const title = safeStr(r['Video Title (Original)']);
    const desc = safeStr(r['Video Description (Original)']);
    if (!title && !desc) continue;
    stagingPosts++;
    videoIds.add(vid);
    const privacy = safeStr(r['Privacy']) || 'Public';
    if (privacy.toLowerCase() === 'public') publicStaged++;
    else privateStaged++;
  }

  let commentsWritten = 0;
  let orphanComments = 0;
  for (const r of comments) {
    const vid = safeStr(r['Video ID']);
    if (!vid || !videoIds.has(vid)) {
      orphanComments++;
      continue;
    }
    const text = parseCommentText(r['Comment Text']);
    if (!text) continue;
    if (!safeStr(r['Comment ID'])) continue;
    commentsWritten++;
  }

  const profile = channels.length
    ? {
        displayName: safeStr(channels[0]['Channel Title (Original)']),
        channelId: safeStr(channels[0]['Channel ID']),
      }
    : null;

  return { stagingPosts, publicStaged, privateStaged, commentsWritten, orphanComments, profile };
}

// ---------------------------------------------------------------------------
// Source 1: the operator's real Takeout export
// ---------------------------------------------------------------------------

function findExportDir() {
  const candidates = [
    process.env.YT_EXPORT_DIR,
    '/Users/starscream/Documents/GitHub/yt-export',
    resolve(process.cwd(), '../../yt-export'),
    resolve(process.cwd(), '../yt-export'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const parts = readdirSync(dir).filter((f) => /^takeout-.*\.zip$/.test(f));
    if (parts.length) return { dir, parts: parts.sort() };
  }
  return null;
}

function readZipEntry(zipPath, entryName) {
  // Use `unzip -p` via a child process? No — keep it dependency-light: the
  // Takeout CSVs are small, so read the zip with a minimal central-directory
  // scan. But hand-rolling a zip *reader* is error-prone; instead we shell out
  // to `unzip` (present on the operator's Mac + the CI base image).
  const { execFileSync } = require('node:child_process');
  try {
    return execFileSync('unzip', ['-p', zipPath, entryName], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function buildFromRealExport(limit) {
  const found = findExportDir();
  if (!found) return null;
  const { dir, parts } = found;

  // The CSVs live in the first part (Takeout puts the metadata first). Scan
  // parts until we have all three.
  let videosRaw = null;
  let commentsRaw = null;
  let channelRaw = null;
  for (const part of parts) {
    const zipPath = join(dir, part);
    if (!videosRaw) videosRaw = readZipEntry(zipPath, VIDEOS);
    if (!commentsRaw) commentsRaw = readZipEntry(zipPath, COMMENTS);
    if (!channelRaw) channelRaw = readZipEntry(zipPath, CHANNEL);
    if (videosRaw && commentsRaw && channelRaw) break;
  }
  if (!videosRaw || !commentsRaw || !channelRaw) return null;

  const chunk = applyLimit(videosRaw, commentsRaw, limit);
  const expected = computeExpected(chunk.videoRows, chunk.commentRows, parseCsv(channelRaw.toString('utf-8')).rows);
  if (!expected.stagingPosts) return null;

  return {
    source: 'real',
    dir,
    videosRaw: Buffer.from(chunk.videosRaw, 'utf-8'),
    commentsRaw: Buffer.from(chunk.commentsRaw, 'utf-8'),
    channelRaw,
    expected,
    limited: limit > 0,
  };
}

// ---------------------------------------------------------------------------
// Source 2: the committed synthetic fallback
// ---------------------------------------------------------------------------

function buildFromSynthetic(limit) {
  const zipPath = resolve(process.cwd(), 'fixtures/yt-takeout-synthetic.zip');
  if (!existsSync(zipPath)) return null;
  const buf = readFileSync(zipPath);
  // Unzip the three CSVs out of the committed fixture.
  const tmp = require('node:os').tmpdir();
  const { execFileSync } = require('node:child_process');
  const out = join(tmp, `yt-synthetic-${Date.now()}`);
  require('node:fs').mkdirSync(out, { recursive: true });
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', out]);
  const read = (p) => {
    const f = join(out, p);
    return existsSync(f) ? readFileSync(f) : null;
  };
  const videosRaw = read(VIDEOS);
  const commentsRaw = read(COMMENTS);
  const channelRaw = read(CHANNEL);
  require('node:fs').rmSync(out, { recursive: true, force: true });
  if (!videosRaw || !commentsRaw || !channelRaw) return null;

  const chunk = applyLimit(videosRaw, commentsRaw, limit);
  const expected = computeExpected(chunk.videoRows, chunk.commentRows, parseCsv(channelRaw.toString('utf-8')).rows);
  if (!expected.stagingPosts) return null;

  return {
    source: 'synthetic',
    dir: null,
    videosRaw: Buffer.from(chunk.videosRaw, 'utf-8'),
    commentsRaw: Buffer.from(chunk.commentsRaw, 'utf-8'),
    channelRaw,
    expected,
    limited: limit > 0,
  };
}

// ---------------------------------------------------------------------------
// Chunk limit — import a bounded slice of the channel (keeps the e2e light)
// ---------------------------------------------------------------------------

/**
 * Limit the Takeout to the first `limit` videos (0 = all) + only the comments
 * on those videos. Returns the re-serialized CSVs + the limited row arrays
 * (for expected-count computation). The channel is always kept whole.
 */
function applyLimit(videosRaw, commentsRaw, limit) {
  const v = parseCsv(videosRaw.toString('utf-8'));
  const c = parseCsv(commentsRaw.toString('utf-8'));
  if (!limit || limit <= 0 || v.rows.length <= limit) {
    return { videosRaw: videosRaw.toString('utf-8'), commentsRaw: commentsRaw.toString('utf-8'), videoRows: v.rows, commentRows: c.rows };
  }
  const videoRows = v.rows.slice(0, limit);
  const videoIds = new Set(videoRows.map((r) => safeStr(r['Video ID'])).filter(Boolean));
  const commentRows = c.rows.filter((r) => videoIds.has(safeStr(r['Video ID'])));
  return {
    videosRaw: serializeCsv(v.header, videoRows),
    commentsRaw: serializeCsv(c.header, commentRows),
    videoRows,
    commentRows,
  };
}

// ---------------------------------------------------------------------------
// Pack the three CSVs into a Takeout-shaped zip
// ---------------------------------------------------------------------------

function packZip(videosRaw, commentsRaw, channelRaw) {
  const files = {
    [VIDEOS]: videosRaw,
    [COMMENTS]: commentsRaw,
    [CHANNEL]: channelRaw,
  };
  if (zipSync) {
    return Buffer.from(zipSync(files, { level: 0 }));
  }
  // Fallback: store-only zip (no compression) — hand-rolled, correct CRC32.
  return storeOnlyZip(files);
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function storeOnlyZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    const crc = crc32(dataBuf);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(0, 8); // method: store
    lh.writeUInt16LE(0, 10); // time
    lh.writeUInt16LE(0, 12); // date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(dataBuf.length, 18); // compressed
    lh.writeUInt32LE(dataBuf.length, 22); // uncompressed
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28); // extra len
    chunks.push(lh, nameBuf, dataBuf);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(dataBuf.length, 20);
    ch.writeUInt32LE(dataBuf.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([ch, nameBuf]));

    offset += lh.length + nameBuf.length + dataBuf.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// The default e2e chunk: import the first N videos of the channel (a light,
// fast, deterministic slice of the real data). Override with YT_IMPORT_LIMIT
// (0 = the whole channel). The import pipeline is the same either way — only
// the number of records changes.
const DEFAULT_LIMIT = 12;

export function buildYtTakeout(limit) {
  if (limit === undefined || limit === null) {
    const env = Number(process.env.YT_IMPORT_LIMIT);
    limit = Number.isFinite(env) ? env : DEFAULT_LIMIT;
  }
  const real = buildFromRealExport(limit);
  const src = real || buildFromSynthetic(limit);
  if (!src) {
    throw new Error(
      'No YouTube Takeout source found. Set YT_EXPORT_DIR to the folder of takeout-*.zip parts, ' +
        'or commit e2e/fixtures/yt-takeout-synthetic.zip.',
    );
  }
  const zip = packZip(src.videosRaw, src.commentsRaw, src.channelRaw);
  return {
    source: src.source,
    dir: src.dir,
    expected: src.expected,
    limited: src.limited,
    limit,
    zip,
  };
}

// CLI: `node e2e/fixtures/yt-takeout.mjs` → prints the manifest + writes the
// synthetic fixture (so it can be committed once).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const result = buildYtTakeout();
  console.log(JSON.stringify({ source: result.source, dir: result.dir, limited: result.limited, limit: result.limit, expected: result.expected, zipBytes: result.zip.length }, null, 2));
  if (process.argv.includes('--write-synthetic')) {
    // Rebuild the synthetic fixture from the committed CSVs (idempotent).
    const synthetic = buildFromSynthetic();
    if (synthetic) {
      writeFileSync(resolve(process.cwd(), 'fixtures/yt-takeout-synthetic.zip'), packZip(synthetic.videosRaw, synthetic.commentsRaw, synthetic.channelRaw));
      console.log('wrote fixtures/yt-takeout-synthetic.zip');
    }
  }
}
