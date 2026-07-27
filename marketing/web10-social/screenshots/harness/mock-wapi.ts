// Screenshot harness — mock of `@/data/wapi`.
// Aliased in place of the real wapi client by screenshots/vite.config.ts so the
// harness views render logged-in WITHOUT the docker stack / a real token.
// See screenshots/README.md.
//
// DRIFT GUARD: this mock implements the FULL WapiWrapper interface from the
// real src/data/wapi.ts (type-only relative import, erased at compile time).
// `satisfies WapiWrapper` makes `tsc -b` FAIL if the real interface gains a
// method this mock lacks — so a missing stub is a compile error, not a
// playwright selector timeout. If you add a method to WapiWrapper, add a
// stub here in the same commit (tsc will point at this file if you forget).
import type { WapiWrapper, WapiToken } from '../../src/data/wapi';

const TOKEN: WapiToken = { provider: 'web10', username: 'me' };

function createMockWrapper(): WapiWrapper {
  return {
    // Auth — always signed in as web10/me.
    isSignedIn: () => true,
    signOut: () => {},
    setToken: () => {},
    readToken: () => TOKEN,
    openAuthPortal: () => {},
    authListen: () => {},

    // CRUD — empty in-memory defaults. Views that need seeded content get it
    // from the `@/data` barrel mock (mock-data.ts), not from here.
    read: async () => [],
    create: async <T = Record<string, unknown>>(_service: string, body: Record<string, unknown>) => body as T,
    update: async <T = Record<string, unknown>>() => ({}) as T,
    delete: async () => {},
    aggregate: async () => [],

    // Media — deterministic fake URLs; nothing fetches them in the harness.
    getUploadUrl: async (_mimeType, _sizeBytes, filename) => ({
      uploadUrl: 'https://mock.invalid/upload',
      fields: {},
      objectKey: `mock/${filename}`,
      contentType: _mimeType,
    }),
    confirmUpload: async <T = Record<string, unknown>>(params) => ({ ...params }) as T,
    getReadUrl: async (objectKey) => ({
      readUrl: `https://mock.invalid/${objectKey}`,
      expiresIn: 3600,
    }),

    // P2P — no-op in the harness.
    initP2P: () => {},
    sendP2P: () => {},
  };
}

export function createWapiWrapper(): WapiWrapper {
  return createMockWrapper();
}

export function getWapi(): WapiWrapper {
  return createMockWrapper();
}

// Module-level exports the real wapi.ts also provides — keep in sync so
// imports like `deriveObjectKey` never hit a missing-export error.
export function resetWapi(): void {}
export function clearReadUrlCache(): void {}
export function deriveObjectKey(storedUrl: string): string {
  try {
    const u = new URL(storedUrl);
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length > 1) return segs.slice(1).join('/');
    return segs.join('/') || storedUrl;
  } catch {
    return storedUrl;
  }
}
