/** Local dispatch consent, not a server grant. Never persist a bearer token. */
export async function sourceApprovalKey(credential: string): Promise<string> {
  console.info('[feed-sources] approval binding started');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential));
  console.info('[feed-sources] approval binding completed');
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function sourceApproved(key: string, origin: string): boolean {
  try { return sessionStorage.getItem(`feed-source:${key}:${origin}`) === 'approved'; } catch { return false; }
}
export function rememberSourceApproval(key: string, origin: string, approved: boolean): void {
  try {
    const name = `feed-source:${key}:${origin}`;
    if (approved) sessionStorage.setItem(name, 'approved'); else sessionStorage.removeItem(name);
  } catch { /* An explicit in-memory approval still works; reload must ask again. */ }
}
