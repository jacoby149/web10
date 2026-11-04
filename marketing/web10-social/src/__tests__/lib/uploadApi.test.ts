import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from '@/lib/origins';
import { createUploadApi, currentUploadIdentity, UploadRequestError } from '@/data/uploadApi';
import { invalidateUploadSession, uploadAttempt } from '@/lib/uploadSession';

const token = (username: string) => `${btoa('{}')}.${btoa(JSON.stringify({ username, provider: 'node.example', site: 'auth.example', expires: '2099-01-01T00:00:00Z' }))}.metadata-only-test`;
const owner = { node: API_ORIGIN, provider: 'node.example', username: 'alice' };
afterEach(() => { invalidateUploadSession(); vi.restoreAllMocks(); });

describe('upload request ownership, not client-side authorization', () => {
  it('uses the current cookie credential and does not persist it in task metadata', async () => {
    let credential = token('alice');
    const request = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ phase: 'uploading' }) });
    vi.stubGlobal('fetch', request);
    const api = createUploadApi(owner, uploadAttempt(), () => credential);
    await api.status('a'.repeat(32), 'media');
    expect(JSON.parse(request.mock.calls[0][1].body).token).toBe(credential);
    expect(request.mock.calls[0][0]).toBe(`${API_ORIGIN}/v3/media/uploads/status`);
    credential = token('bob');
    await expect(api.status('a'.repeat(32), 'media')).rejects.toMatchObject({ status: 401 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a stored node URL cannot redirect the credential to another host', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const api = createUploadApi({ ...owner, node: 'https://attacker.invalid' }, uploadAttempt(), () => token('alice'));
    await expect(api.status('a'.repeat(32), 'media')).rejects.toBeInstanceOf(UploadRequestError);
    expect(request).not.toHaveBeenCalled();
  });

  it('A→B→A invalidates an outstanding response even when the final owner/token matches again', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    let credential = token('alice');
    const api = createUploadApi(owner, uploadAttempt(), () => credential);
    const request = api.status('a'.repeat(32), 'media');
    credential = token('bob'); invalidateUploadSession();
    credential = token('alice'); invalidateUploadSession();
    finish({ ok: true, status: 200, json: async () => ({ phase: 'completed', object_key: 'alice/private' }) });
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('checks ownership again after asynchronous JSON decoding', async () => {
    let credential = token('alice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { credential = token('bob'); return { phase: 'completed' }; } }));
    await expect(createUploadApi(owner, uploadAttempt(), () => credential).status('a'.repeat(32), 'media')).rejects.toMatchObject({ status: 401 });
  });

  it('missing/malformed credentials never select a saved account partition', () => {
    expect(currentUploadIdentity(API_ORIGIN, () => null)).toBeNull();
    expect(currentUploadIdentity(API_ORIGIN, () => 'bad-token')).toBeNull();
  });
});
