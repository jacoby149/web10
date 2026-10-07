import { afterEach, describe, expect, it, vi } from 'vitest';
import * as v3 from '../../data/v3';
import { readGroupDetail } from '../../data/groups';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('group detail uses SDK credential transport', () => {
  it('delegates to the SDK instead of reading a cookie or constructing a credential URL', async () => {
    const detail = { name: 'jazz', group_id: 'g1', is_member: true, posts_state: 'ok', posts: [] };
    const getGroupDetail = vi.fn().mockResolvedValue(detail);
    vi.spyOn(v3, 'getV3Client').mockReturnValue({ getGroupDetail } as never);
    const cookieRead = vi.spyOn(v3, 'readTokenCookie');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await readGroupDetail('g1')).toEqual(detail);
    expect(getGroupDetail).toHaveBeenCalledExactlyOnceWith('g1');
    expect(cookieRead).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the structured SDK error without logging its credential-bearing details', async () => {
    const error = new v3.Web10Error('credential-echo', 404, 'session-secret');
    vi.spyOn(v3, 'getV3Client').mockReturnValue({ getGroupDetail: vi.fn().mockRejectedValue(error) } as never);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(readGroupDetail('g1')).rejects.toBe(error);
    expect(JSON.stringify(logs.mock.calls)).not.toContain('session-secret');
    expect(JSON.stringify(logs.mock.calls)).not.toContain('credential-echo');
  });
});
