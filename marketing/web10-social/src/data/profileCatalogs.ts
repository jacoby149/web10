export type CatalogKind = 'cities' | 'schools' | 'employers';
type CatalogRow = [id: string, name: string, detail: string, aliases: string[], lat?: number, lon?: number];

export interface CatalogEntry {
  id: string;
  name: string;
  detail: string;
  label: string;
  keys: string[];
  lat?: number;
  lon?: number;
}

const catalogs = new Map<CatalogKind, Promise<CatalogEntry[]>>();
const sources = { cities: 'geonames', schools: 'ror', employers: 'sec' } as const;

function searchKey(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function catalogEntry(kind: CatalogKind, [id, name, detail, aliases, lat, lon]: CatalogRow): CatalogEntry {
  const label = kind === 'cities' && detail ? `${name}, ${detail}` : name;
  return { id: `${sources[kind]}:${id}`, name, detail, label, lat, lon, keys: [name, ...aliases, `${name} ${detail}`].map(searchKey) };
}

export function loadProfileCatalog(kind: CatalogKind): Promise<CatalogEntry[]> {
  const cached = catalogs.get(kind);
  if (cached) return cached;
  console.debug('[social-catalog] loading suggestions', { kind });
  const request = fetch(`${import.meta.env.BASE_URL}profile-catalogs/${kind}-v1.json`)
    .then(async response => {
      if (!response.ok) throw new Error('Catalog unavailable');
      const rows: CatalogRow[] = await response.json();
      const entries = rows.map(row => catalogEntry(kind, row));
      console.debug('[social-catalog] suggestions loaded', { kind, entries: entries.length });
      return entries;
    }).catch(error => {
      catalogs.delete(kind);
      console.warn('[social-catalog] suggestions unavailable', { kind, errorType: error instanceof Error ? error.name : 'unknown' });
      throw error;
    });
  catalogs.set(kind, request);
  return request;
}

/** Exact name/alias first, then prefixes, then multi-word matches in any order. */
export function suggestEntries(entries: CatalogEntry[], text: string): CatalogEntry[] {
  const query = searchKey(text);
  if (query.length < 2) return [];
  const tokens = query.split(' ');
  const buckets: CatalogEntry[][] = [[], [], []];
  for (const entry of entries) {
    const rank = entry.keys.includes(query) ? 0 : entry.keys.some(key => key.startsWith(query)) ? 1
      : tokens.every(token => entry.keys.some(key => key.startsWith(token) || key.includes(` ${token}`))) ? 2 : -1;
    if (rank >= 0 && buckets[rank].length < 6) buckets[rank].push(entry);
    if (buckets[0].length === 6) break;
  }
  return buckets.flat().slice(0, 6);
}

/** Used in the browser only. Distance against city centroids, not boundaries. */
export function nearestCatalogCity(entries: CatalogEntry[], latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const rad = Math.PI / 180;
  let nearest: CatalogEntry | undefined;
  let best = Math.sin(35 / (2 * 6371)) ** 2;
  for (const entry of entries) {
    if (entry.lat === undefined || entry.lon === undefined) continue;
    const distance = Math.sin((entry.lat - latitude) * rad / 2) ** 2
      + Math.cos(latitude * rad) * Math.cos(entry.lat * rad) * Math.sin((entry.lon - longitude) * rad / 2) ** 2;
    if (distance < best) { best = distance; nearest = entry; }
  }
  return nearest;
}
