import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWeb10Mock } from './helpers/web10Mock';

const { setToken } = vi.hoisted(() => ({ setToken: vi.fn() }));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ setToken }) }));

describe('social auth listener node binding', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.web10;
  });

  it.each(['http://api.localhost', 'https://api.dev.web10.app', 'https://node.creator.example:8443'])(
    'passes the configured API origin to the SDK listener (%s)', async (apiOrigin) => {
      vi.stubEnv('VITE_API_ORIGIN', apiOrigin);
      const mock = installWeb10Mock();
      const { getSocialAuth } = await import('@/interfaces/auth');
      getSocialAuth().authListen(vi.fn());
      expect(mock.authListen).toHaveBeenCalledWith(expect.any(Function), { apiOrigin });
      expect(mock.createV3Client).toHaveBeenCalledWith({ apiOrigin });
    },
  );

  it('syncs each distinct token accepted by the SDK, including same-user refreshes', async () => {
    const mock = installWeb10Mock();
    const callback = vi.fn();
    const { getSocialAuth } = await import('@/interfaces/auth');
    getSocialAuth().authListen(callback);
    const accepted = mock.authListen.mock.calls[0][0] as (signedIn: boolean) => void;
    mock.decodeJwt.mockReturnValue({ username: 'alice', provider: 'api.web10.app' });
    mock.readTokenCookie.mockReturnValue('app-token-1');
    accepted(true);
    mock.readTokenCookie.mockReturnValue('app-token-2');
    accepted(true);
    expect(setToken.mock.calls).toEqual([['app-token-1'], ['app-token-2']]);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
