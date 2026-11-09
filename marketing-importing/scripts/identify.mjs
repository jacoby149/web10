// identify.mjs — the web10identify skill, the PERSON REGISTRY.
//
//   add       register a person (insta handle ↔ web10 username) in the repo
//   show      print one registry entry
//   list      print every identified person
//   resolve   given a loose name ("adam malev"), find the closest identified
//             person by name — the operator's way of pointing at a person
//
// No credentials, no accounts, no content: this only writes people/<key>.json
// so import/sync know WHO "adam malev" is on each side.
import { loadJson, saveJson, IMPORT_DIR } from './common.mjs';
import path from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const PEOPLE = path.join(IMPORT_DIR, 'people');

function entries() {
  if (!existsSync(PEOPLE)) return [];
  return readdirSync(PEOPLE)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(PEOPLE, f), 'utf8')))
    .filter((e) => e && e.person);
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Similarity of the input against one candidate string: 0..1. */
function sim(input, candidate) {
  const a = normalize(input), b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

function candidates(e) {
  // Field order = preference order on ties.
  return [
    ['display_name', e.display_name],
    ['key', e.person || e.key],
    ['web10_username', e.web10_username],
    ['instagram_handle', e.instagram_handle],
  ].filter(([, v]) => v);
}

function command(cmd, args) {
  if (cmd === 'list') {
    const all = entries();
    if (!all.length) return console.log('(no identified persons yet)');
    for (const e of all) {
      console.log(`${e.person || e.key.padEnd(16)}  web10: ${String(e.web10_username).padEnd(14)}  insta: @${e.instagram_handle}`);
    }
    return;
  }

  if (cmd === 'show') {
    const key = args[0];
    if (!key) throw new Error('usage: identify.mjs show <key>');
    const file = path.join(PEOPLE, `${key}.json`);
    if (!existsSync(file)) throw new Error(`no registry entry for ${key}`);
    return console.log(JSON.stringify(loadJson(file), null, 2));
  }

  if (cmd === 'add') {
    // identify.mjs add --key adam_malev --web10-username adam --insta adammalev --name "Adam Malev" [--permission "..."] [--website-default "..."]
    const flags = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[i + 1];
    }
    const key = flags.key;
    const web10Username = flags['web10-username'];
    const insta = flags.insta;
    const name = flags.name;
    if (!key || !web10Username || !insta) {
      throw new Error('usage: identify.mjs add --key <key> --web10-username <u> --insta <handle> --name "<Display Name>" [--permission "..."]');
    }
    const file = path.join(PEOPLE, `${key}.json`);
    if (existsSync(file) && !flags.force) throw new Error(`${key} is already identified — use --force to overwrite`);
    const prev = loadJson(file, null);
    const instaClean = String(insta).replace(/^@/, '');
    const entry = {
      ...prev,
      person: key,
      web10_username: web10Username,
      instagram_handle: instaClean,
      display_name: name || web10Username,
      website_default: flags['website-default'] || `https://www.instagram.com/${instaClean}/`,
      permission: flags.permission || prev?.permission || 'NO PERMISSION RECORDED — do not import until the owner permission is documented here.',
      created: prev?.created || new Date().toISOString().slice(0, 10),
    };
    saveJson(file, entry);
    console.log(`[identify] registered ${key}: insta @${entry.instagram_handle} → web10 ${web10Username}`);
    if (/NO PERMISSION/i.test(entry.permission)) console.log('[identify] WARNING: permission not recorded yet');
    return;
  }

  if (cmd === 'resolve') {
    const input = args.join(' ');
    if (!input.trim()) throw new Error('usage: identify.mjs resolve "<a name, loose is fine>"');
    const all = entries();
    if (!all.length) return console.log('(no identified persons yet)');
    const scored = all
      .map((e) => {
        let best = { field: null, value: null, score: 0 };
        for (const [field, value] of candidates(e)) {
          const s = sim(input, value);
          if (s > best.score) best = { field, value, score: s };
        }
        return { entry: e, best: best.score, field: [best.field, best.value] };
      })
      .sort((a, b) => b.best - a.best)
      .slice(0, 3);
    for (const s of scored) {
      const mark = s === scored[0] ? '>' : ' ';
      console.log(`${mark} ${s.best.toFixed(2)}  ${s.entry.person}  (via ${s.field[0]}="${normalize(s.field[1])}")  web10=${s.entry.web10_username} insta=@${s.entry.instagram_handle}`);
    }
    const top = scored[0];
    const gap = scored[1] ? top.best - scored[1].best : 1;
    if (top.best >= 0.8 && gap >= 0.15) {
      console.log(`RESOLVED: ${top.entry.person}`);
      return;
    }
    console.log(`AMBIGUOUS (best ${top.best.toFixed(2)}${scored[1] ? `, gap ${gap.toFixed(2)}` : ''}) — ask the operator to confirm.`);
    process.exitCode = 3;
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  command(cmd, args);
} catch (e) {
  console.error(`[identify] ${e.message}`);
  process.exit(1);
}
