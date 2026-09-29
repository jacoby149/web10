import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { API_ORIGIN } from '../../lib/origins';
import { importCreate, importStart, importStatus, uploadImportPart, startImport } from '../../data/imports';

const TOKEN = 'test.token.here';

function mockV3Client() {
  const mock = {
    state: { token: TOKEN },
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  vi.spyOn(v3, 'readTokenCookie').mockReturnValue(TOKEN);
  return mock;
}

function jsonFetch(payload: Record<string, unknown>) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
}

function file(name = 'takeout-001.tar') {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/x-tar' });
}

describe('imports data layer — the port-your-YouTube pipeline', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockV3Client();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('importCreate posts platform + parts with the token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: 'j1', platform: 'youtube', job: {}, uploads: [] }), { status: 200 }),
    );
    await importCreate('youtube', [{ filename: 'a.tar', size_bytes: 3 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_ORIGIN}/v3/imports`);
    const body = JSON.parse(init.body);
    expect(body.platform).toBe('youtube');
    expect(body.parts).toEqual([{ filename: 'a.tar', size_bytes: 3 }]);
    expect(body.token).toBe(TOKEN);
    expect(body.target_group_id).toBeUndefined();
  });

  it('importCreate includes target_group_id when a group is chosen', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: 'j1', platform: 'youtube', job: {}, uploads: [] }), { status: 200 }),
    );
    await importCreate('youtube', [{ filename: 'a.tar' }], 'web10.app/groups/alice/my-page');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.target_group_id).toBe('web10.app/groups/alice/my-page');
  });

  it('uploadImportPart posts the file to the presigned URL with the fields', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const upload = {
      part_index: 0,
      object_key: 'imports/alice/j1/part-000.tar',
      upload_url: 'https://minio.example.com/bucket',
      fields: { key: 'imports/alice/j1/part-000.tar', policy: 'abc' },
    };
    await uploadImportPart(upload, file());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://minio.example.com/bucket');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('key')).toBe('imports/alice/j1/part-000.tar');
    expect(form.get('policy')).toBe('abc');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('importStart posts the job_id', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ job_id: 'j1', status: 'queued' }), { status: 200 }));
    const res = await importStart('j1');
    expect(res.status).toBe('queued');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.job_id).toBe('j1');
  });

  it('importStatus returns the job row (with progress)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: 'j1',
          job: { job_id: 'j1', phase: 'processing', progress: 42, total_records: 100, written_records: 42 },
        }),
        { status: 200 },
      ),
    );
    const res = await importStatus('j1');
    expect(res.job.progress).toBe(42);
  });

  it('startImport: create → upload each part → start, returns the job_id', async () => {
    const uploads = [
      { part_index: 0, object_key: 'k0', upload_url: 'https://minio/0', fields: { key: 'k0' } },
      { part_index: 1, object_key: 'k1', upload_url: 'https://minio/1', fields: { key: 'k1' } },
    ];
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ job_id: 'j1', platform: 'youtube', job: {}, uploads }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job_id: 'j1', status: 'queued' }), { status: 200 }));

    const jobId = await startImport('youtube', [file('a.tar'), file('b.tar')], 'web10.app/groups/alice/my-page');
    expect(jobId).toBe('j1');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // call 0 = create (with target), calls 1-2 = uploads, call 3 = start
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).target_group_id).toBe('web10.app/groups/alice/my-page');
    expect(fetchMock.mock.calls[1][0]).toBe('https://minio/0');
    expect(fetchMock.mock.calls[2][0]).toBe('https://minio/1');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).job_id).toBe('j1');
  });

  it('a non-ok create throws with the node detail', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'you do not own the target group' }), { status: 403 }),
    );
    await expect(importCreate('youtube', [{ filename: 'a.tar' }], 'g')).rejects.toThrow('you do not own the target group');
  });
});
