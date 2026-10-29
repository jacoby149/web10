import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync, writeSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export const hosts = ['social.localhost', 'auth.localhost', 'api.localhost', 'rtc.localhost'];
export function allowedTarget(value, websocket = false) {
  try {
    const u = new URL(value);
    if (u.username || u.password) return false;
    if (!websocket && ['data:', 'blob:'].includes(u.protocol)) return true;
    return (u.protocol === (websocket ? 'ws:' : 'http:')) &&
      ((hosts.includes(u.hostname) && (!u.port || u.port === '80')) ||
       (!websocket && u.hostname === 'localhost' && u.port === '9000'));
  } catch { return false; }
}
export function validMarker(status, body) {
  return status === 200 && body?.experiment === 'web10-social-isolated';
}
function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max)
    throw new Error('InvalidNumericConfig');
  return Number(value);
}
export function configuration(env = process.env) {
  if (env.WEB10_DISPOSABLE !== 'social-evaluation' || (env.E2E_HTTP_PORT !== undefined && env.E2E_HTTP_PORT !== '80'))
    throw new Error('UnsafeEnvironment');
  // No alternate targets, including otherwise plausible localhost overrides.
  if (Object.keys(env).some(k => /(?:BASE_?URL|API_BASE|SOCIAL_BASE|AUTH_BASE|RTC_BASE)$/i.test(k)))
    throw new Error('TargetOverride');
  return { repetitions: integer(env.WEB10_EVAL_REPETITIONS, 20, 3, 100),
    warmups: integer(env.WEB10_EVAL_WARMUP, 2, 0, 10), results: resultsDirectory(env.WEB10_EVAL_RESULTS) };
}
export function disableProxyEnvironment(env = process.env) {
  for (const key of Object.keys(env)) if (/^(?:(?:https?|all)_proxy|npm_config_proxy|npm_config_https_proxy)$/i.test(key)) delete env[key];
  env.NO_PROXY = env.no_proxy = '*';
  env.NODE_USE_ENV_PROXY = '0';
}
export function resultsDirectory(path) {
  if (!path || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path || !lstatSync(path).isDirectory())
    throw new Error('InvalidResultsDirectory');
  return path;
}
export function writeResult(directory, name, value) {
  if (!['operations.json', 'run.json'].includes(name)) throw new Error('InvalidResultName');
  writeFileSync(join(resultsDirectory(directory), name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
export function safeError(error) {
  const name = ['TimeoutError', 'TypeError', 'AssertionError', 'Error'].includes(error?.name) ? error.name : 'Error';
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : undefined;
  return { name, class: status !== undefined ? 'HTTP' : name === 'TimeoutError' ? 'Timeout' : 'Operation',
    ...(status !== undefined ? { status } : {}) };
}
export function networkState() {
  return Object.fromEntries(['groups', 'query', 'read', 'other'].map(stage => [stage, { pending: 0, success: 0, expected_denial: 0, http_failure: 0, network_failure: 0 }]));
}
export function networkStage(value, method = 'POST') {
  const u = new URL(value);
  if (u.origin !== 'http://api.localhost' || u.pathname === '/__experiment') return null;
  if (method !== 'POST') return 'other';
  return ({ '/v3/groups/list': 'groups', '/v3/query': 'query', '/v3/read': 'read' })[u.pathname] ?? 'other';
}
export function feedNetworkReady(network, nonempty) {
  if (Object.values(network).some(stage => stage.http_failure || stage.network_failure)) throw new Error('FeedNetworkFailure');
  return Object.values(network).every(stage => stage.pending === 0) && network.groups.success > 0 && (!nonempty || network.query.success > 0);
}
// Installed before page scripts. HTTP/WS routing is not an OS-level sandbox and cannot fence STUN.
export function blockPeerConnections() {
  globalThis.__web10EvalPeerAttempts = 0;
  function denied() {
    globalThis.__web10EvalPeerAttempts++;
    globalThis.__web10EvalPeerAttempt?.();
    throw new Error('PeerConnectionExcluded');
  }
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection'])
    Object.defineProperty(globalThis, name, { value: denied, writable: false, configurable: false });
}
export function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * q;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
}
export function summarize(records, expectedRepetitions) {
  const operations = {};
  for (const operation of new Set(records.map(r => r.operation))) {
    const all = records.filter(r => r.operation === operation);
    const measured = all.filter(r => !r.warmup && r.phase === 'measurement');
    const values = measured.filter(r => r.success && r.finalized === true).map(r => r.duration_ms);
    operations[operation] = { n: values.length, attempted: measured.length, failures: all.filter(r => !r.success || r.finalized !== true).length,
      min_ms: values.length ? Math.min(...values) : null, median_ms: quantile(values, .5),
      p95_ms: values.length >= 20 ? quantile(values, .95) : null,
      p95_note: values.length >= 20 ? 'descriptive, repeated same-session samples' : 'insufficient n (<20)' };
  }
  const measured = Object.values(operations).some(o => o.n > 0);
  const complete = expectedRepetitions === undefined || ['following.reload-empty', 'following.reload-nonempty']
    .every(name => operations[name]?.n === expectedRepetitions && operations[name]?.attempted === expectedRepetitions);
  return { success: measured && complete && records.every(r => r.success && r.finalized === true), operations };
}
export const definitions = {
  provenance: 'synthetic, isolated loopback, single reader; not capacity or WAN latency',
  duration_ms: 'monotonic elapsed operation time including browser navigation, waits and read-only polls',
  timestamps: 'started_at and finished_at are Unix epoch seconds on the collector host for resource correlation',
  polls: 'explicit readiness predicate evaluations, including initial evaluation',
  requests: 'browser requests (all resources) plus explicit API calls during operation; marker probes excluded',
  samples: 'Following full browser reload to exact expected cards/count; same session/cache; setup and warmups excluded',
  quantiles: 'linear interpolation at (n-1)*q; p95 only for n>=20; failures retained, never timed as successes',
  network: 'per-stage completed 2xx API requests, non-2xx responses and transport failures; all pending API calls must settle; empty requires groups/list, nonempty also query',
  p2p: 'excluded: persisted p2pEnabled=false; native peer constructors blocked before scripts; no RTC delivery claims',
  isolation: 'exact HTTP/WS route guards plus peer-constructor guard; not a complete OS/network sandbox',
  durability: 'fsynced start/finish operations.jsonl events; unmatched starts are interrupted failures, not latency samples',
};
function safeRow(row) {
  const out = Object.fromEntries(['operation', 'phase', 'success', 'finalized', 'started_at', 'finished_at', 'duration_ms',
    'warmup', 'trial', 'polls', 'requests', 'blocked_external', 'peer_attempts', 'expected_posts'].map(key => [key, row[key]]));
  out.network = Object.fromEntries(Object.keys(networkState()).map(stage => [stage,
    Object.fromEntries(['pending', 'success', 'expected_denial', 'http_failure', 'network_failure'].map(key => [key, Number(row.network?.[stage]?.[key] ?? 0)]))]));
  if (row.error) out.error = safeError(row.error);
  return out;
}
export function recoverJournal(directory) {
  const starts = new Map();
  let invalid = false;
  for (const line of readFileSync(join(resultsDirectory(directory), 'operations.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (!Number.isSafeInteger(event.id) || !/^[a-z][a-z0-9_.-]*$/.test(event.row.operation)) throw new Error();
      if (event.event === 'start' && !starts.has(event.id)) starts.set(event.id, { ...safeRow(event.row), success: false, finalized: false });
      else if (event.event === 'finish' && starts.has(event.id) && !starts.get(event.id).finalized) {
        const start = starts.get(event.id);
        if (['operation', 'phase', 'trial', 'warmup', 'started_at'].some(key => event.row[key] !== start[key]) || event.row.finalized !== true) throw new Error();
        starts.set(event.id, safeRow(event.row));
      } else throw new Error();
    } catch { invalid = true; }
  }
  const rows = [...starts.values()];
  if (invalid) rows.push({ operation: 'journal.invalid', phase: 'correctness', success: false, finalized: false });
  return rows;
}
export function journal(directory) {
  const records = [];
  const fd = directory === undefined ? undefined : openSync(join(resultsDirectory(directory), 'operations.jsonl'), 'wx', 0o600);
  let sequence = 0;
  function emit(event, id, row) {
    if (fd !== undefined) { writeSync(fd, JSON.stringify({ event, id, row: safeRow(row) }) + '\n'); fsyncSync(fd); }
  }
  return { records, close() { if (fd !== undefined) closeSync(fd); }, async run(operation, phase, action, options = {}) {
    if (!/^[a-z][a-z0-9_.-]*$/.test(operation)) throw new Error('InvalidOperation');
    const row = { operation, phase, success: false, finalized: false, started_at: Date.now() / 1000, finished_at: null, duration_ms: 0, warmup: options.warmup === true,
      trial: options.trial ?? 0, polls: 0, requests: 0, blocked_external: 0, peer_attempts: 0, network: networkState(), expected_posts: options.expected_posts ?? 0 };
    const id = ++sequence;
    emit('start', id, row);
    const start = performance.now();
    try { const value = await action(row); row.success = true; return value; }
    catch (error) { row.error = safeError(error); throw new Error(row.error.class); }
    finally {
      row.duration_ms = performance.now() - start; row.finished_at = Date.now() / 1000; row.finalized = true;
      emit('finish', id, row); records.push(safeRow(row));
    }
  } };
}
