import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

assert.ok(process.argv[2], 'usage: node check-paper.mjs /path/to/report.json');
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const paper = readFileSync(new URL('../../first-draft/main.tex', import.meta.url), 'utf8');
assert.equal(report.manifest.creators_total, 1000);
assert.equal(report.cells.length, 20);
for (const cell of report.cells) {
  assert.equal(cell.runs_requested, 20);
  assert.equal(cell.timing_samples, 20);
  assert.equal(cell.queries_completed, 20);
  assert.equal(cell.queries_200, cell.transport === 'http' ? 20 : 0);
}
assert.equal(report.cells.reduce((n, cell) => n + cell.timing_samples, 0), 400);
assert.equal(report.cells.reduce((n, cell) => n + cell.queries_200, 0), 320);

const summary = (k, mode, line, feed = 'personal') => {
  const key = `{'feed': '${feed}', 'k': ${k}, 'mode': '${mode}', 'line': '${line}'}`;
  assert.ok(report.summaries[key], `missing cell: ${key}`);
  return report.summaries[key];
};
const close = (printed, actual, label) => assert.ok(Math.abs(printed - actual) <= 0.005001,
  `${label}: manuscript ${printed} vs report ${actual}`);
const table = paper.match(/\\label\{tab:fanout\}([\s\S]*?)\\end\{tabular\}/)?.[1];
assert.ok(table, 'fan-out table missing');
const rows = [...table.matchAll(/^\s*(10|100|1000)\s*&\s*(Per-group|Batched)\s*&\s*([BC])\s*&\s*([\d.]+)\s*&\s*([\d.]+)\s*&\s*([\d.]+)\s*&\s*([\d.]+)/gm)];
assert.equal(rows.length, 12);
const seen = new Set();
for (const [, k, resolver, line, ...values] of rows) {
  const key = `${k}/${resolver}/${line}`;
  assert.ok(!seen.has(key), `duplicate table row: ${key}`);
  seen.add(key);
  const phases = summary(Number(k), resolver === 'Per-group' ? 'per-group' : 'batched', line);
  const actual = [phases.readable.p50, phases.readable.p95, phases.total.p50, phases.total.p95];
  values.forEach((value, i) => close(Number(value), actual[i], `${key} column ${i}`));
}
const b10 = summary(10, 'batched', 'B');
const b1000 = summary(1000, 'batched', 'B');
const p10 = summary(10, 'per-group', 'B');
const p1000 = summary(1000, 'per-group', 'B');
const ratios = [
  p1000.readable.p50 / p10.readable.p50,
  b1000.readable.p50 / b10.readable.p50,
  p1000.readable.p50 / b1000.readable.p50,
  p1000.total.p50 / b1000.total.p50,
  b1000.total.p50 / b10.total.p50,
];
for (const ratio of ratios) {
  assert.ok(paper.includes(`${ratio.toFixed(2)}\\times`), `missing/mismatched ratio ${ratio}`);
}
for (const [k, printed] of [[10, 28.65], [100, 29.99], [1000, 54.17]]) {
  close(printed, summary(k, 'n/a', 'A').execute.p50, `baseline K${k}`);
}
close(29.92, summary(1, 'n/a', 'A', 'discover').execute.p50, 'discover baseline');
close(13.12, b10.compile.p50, 'K10 batched compilation');
close(48.78, b1000.compile.p50, 'K1000 batched compilation');
for (const [mode, readable, total] of [['per-group', 9.53, 75.98], ['batched', 25.37, 87.51]]) {
  const cell = summary(1, mode, 'B', 'discover');
  close(readable, cell.readable.p50, `discover ${mode} readable`);
  close(total, cell.total.p50, `discover ${mode} total`);
}
console.info('Verified 48 table values, five growth/speedup ratios, baselines, compilation, discover and 400-sample accounting.');
