// Screenshot harness — mock of `@/data/wapi`.
// Aliased in place of the real wapi client by screenshots/vite.config.ts so the
// messages views render logged-in WITHOUT the docker stack / a real token.
// See screenshots/README.md.
const TOKEN = { provider: 'web10', username: 'me' };

export function getWapi() {
  return {
    readToken: () => TOKEN,
    setToken: () => {},
    authListen: () => {},
    isSignedIn: () => true,
  };
}

export function createWapiWrapper() {
  return { setToken: () => {} };
}
