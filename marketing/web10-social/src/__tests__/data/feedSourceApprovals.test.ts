import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberSourceApproval, sourceApprovalKey, sourceApproved } from '@/data/feedSourceApprovals';
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });
describe('tab-local credential-generation approval', () => {
  it('stores only a digest binding, separates credentials/origins, and revokes on removal', async () => {
    // Node-only test adapter; the browser app's type environment stays DOM-only.
    const { webcrypto } = await import(/* @vite-ignore */ 'node:' + 'crypto');
    vi.stubGlobal('crypto', webcrypto);
    const credential = 'synthetic-secret-current-JWT', nextCredential = 'synthetic-secret-next-JWT';
    const key = await sourceApprovalKey(credential), next = await sourceApprovalKey(nextCredential);
    expect(key).toHaveLength(64); expect(key).not.toBe(next);
    rememberSourceApproval(key, 'https://node.example', true);
    expect(sourceApproved(key, 'https://node.example')).toBe(true);
    expect(sourceApproved(next, 'https://node.example')).toBe(false);
    expect(sourceApproved(key, 'https://another.example')).toBe(false);
    expect(JSON.stringify(sessionStorage)).not.toContain(credential);
    rememberSourceApproval(key, 'https://node.example', false);
    expect(sourceApproved(key, 'https://node.example')).toBe(false);
  });
});
