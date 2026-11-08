export * from './sourceAllocation';
export type FeedSource = { origin: string; weight: number };
export function normalizeFeedSource(value: string, home: string): string {
  const url = new URL(value);
  if (value.length > 512 || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.origin !== home && (url.protocol !== 'https:' || !url.hostname.includes('.')))) throw Error('Enter an exact HTTPS server origin, without a path.');
  if (url.origin !== home && (url.hostname.length > 253 || url.hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) throw Error('Invalid server hostname.');
  return url.origin;
}
