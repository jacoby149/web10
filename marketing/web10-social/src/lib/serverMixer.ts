/** Mixer values select fetch budgets, never destinations or permissions. */
export type ServerWeights = Record<string, number>;
export type ServerAllocation = { origin: string; weight: number; count: number };

function origins(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Expected an exact HTTPS server origin');
    }
    return url.origin;
  }))];
}

export function sanitizeServerWeights(raw: unknown, subscribedOrigins: readonly string[]): ServerWeights {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(origins(subscribedOrigins).flatMap((origin) => {
    const value = Object.prototype.hasOwnProperty.call(raw, origin) ? (raw as Record<string, unknown>)[origin] : undefined;
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? [[origin, value]] : [];
  }));
}

export function parseServerMixer(value: string | null, subscribedOrigins: readonly string[]): ServerWeights | null {
  if (value === null) return null;
  if (value.length > 8192) return {};
  try { return sanitizeServerWeights(JSON.parse(value), subscribedOrigins); } catch { return {}; }
}

export function encodeServerMixer(weights: unknown, subscribedOrigins: readonly string[]): string {
  const clean = sanitizeServerWeights(weights, subscribedOrigins);
  return JSON.stringify(Object.fromEntries(Object.entries(clean).sort(([a], [b]) => a.localeCompare(b))));
}

/** Largest-remainder allocation; rotate equal remainders so tiny budgets don't
 * permanently starve the last server. Zero pauses reads without deleting follows.
 */
export function allocateServerFetches(
  subscribedOrigins: readonly string[], weights: ServerWeights, budget = 20, page = 0,
): ServerAllocation[] {
  if (!Number.isInteger(budget) || budget < 0 || budget > 1000 || !Number.isSafeInteger(page) || page < 0) {
    throw new Error('Invalid server fetch budget or page');
  }
  const servers = origins(subscribedOrigins);
  const clean = sanitizeServerWeights(weights, servers);
  const rows = servers.map((origin) => ({ origin, weight: clean[origin] ?? 100, count: 0 }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!total || !budget) return rows;
  for (const row of rows) row.count = Math.floor(budget * row.weight / total);
  const remaining = budget - rows.reduce((sum, row) => sum + row.count, 0);
  const offset = page % rows.length;
  const remainderOrder = rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => row.weight > 0)
    .sort((a, b) => (budget * b.row.weight % total) - (budget * a.row.weight % total)
      || ((a.index - offset + rows.length) % rows.length) - ((b.index - offset + rows.length) % rows.length));
  for (const { row } of remainderOrder.slice(0, remaining)) row.count++;
  return rows;
}
