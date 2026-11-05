import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { API_ORIGIN } from '@/lib/origins';
import { UploadProvider, useUploads } from '@/context/UploadContext';
import { ComposerProvider } from '@/context/ComposerContext';
import type { MediaPostDraft } from '@/components/Uploads/uploadState';
import { loadUploads } from '@/data/uploadDraftStore';
import { invalidateUploadSession } from '@/lib/uploadSession';

const fake = vi.hoisted(() => ({ username: 'alice', run: vi.fn(), stop: vi.fn(), nudge: vi.fn() }));
vi.mock('@/data/notifications', () => ({ sendNotification: fake.nudge }));
vi.mock('web10-npm', async importOriginal => ({
  ...await importOriginal<typeof import('web10-npm')>(),
  readTokenCookie: () => fake.username ? `e30.${btoa(JSON.stringify({ username: fake.username, provider: 'node' }))}.test` : null,
}));
vi.mock('@/data/groups', () => ({ ensureCloseFriends: vi.fn(), ensureFollowers: vi.fn(), getDiscoverGroupId: () => 'discover' }));
vi.mock('@/data/posts', () => ({ determinePostGroups: () => ['followers', 'discover'] }));
vi.mock('@/data/actingIdentity', () => ({ actingPostGroups: async () => ['team'] }));
vi.mock('@/lib/resumableTransfer', () => ({ resumableTransfer: () => ({ run: fake.run, stop: fake.stop }) }));
vi.mock('@/components/shared/Toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let queue: NonNullable<ReturnType<typeof useUploads>>;
function Probe() { queue = useUploads()!; return null; }
const owner = { node: API_ORIGIN, provider: 'node', username: 'alice' };
const draft = (): MediaPostDraft => ({ title: 'A complete film', text: 'Original text', visibility: 'public', authorAs: 'team',
  authorLabel: 'Movie club', groups: ['team'], markAsMusic: false,
  media: [{ file: new File(['film'], 'movie.mp4', { type: 'video/mp4' }), width: 640, height: 480, duration: 5514, altText: '' }] });
function mount() {
  return render(<MemoryRouter><ComposerProvider><UploadProvider sessionKey="session"><Probe /></UploadProvider></ComposerProvider></MemoryRouter>);
}
let requests: { path: string; body: Record<string, unknown> }[];
let admitted: boolean;
let capabilityFails: boolean;
let phase: string;
function response(status: number, payload: unknown) { return { ok: status < 300, status, json: async () => payload }; }
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  fake.username = 'alice'; fake.run.mockReset(); fake.stop.mockReset(); fake.nudge.mockReset();
  fake.run.mockResolvedValue({ phase: 'completed' });
  requests = []; admitted = false; capabilityFails = false; phase = 'waiting';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(String(init?.body || '{}'));
    requests.push({ path, body });
    if (path.endsWith('/capabilities')) {
      if (capabilityFails) throw new Error('offline startup');
      return response(200, { enabled: true, deferred_creates: true });
    }
    if (path.endsWith('/validate')) return response(200, { allowed: true });
    if (path.endsWith('/deferred/status')) return admitted
      ? response(200, { phase, admitted: true, media_dependencies: ['media-id'], doc_id: phase === 'done' ? 'post-id' : null, error: null })
      : response(404, { detail: 'not found' });
    if (path.endsWith('/uploads/status')) return response(200, { phase: 'uploading', uploaded_bytes: 2, parts: [] });
    if (path.endsWith('/confirm')) return response(200, { doc_id: 'media-id' });
    if (path.endsWith('/deferred/create')) {
      admitted = true;
      return response(200, { phase: 'waiting', admitted: true, media_dependencies: ['media-id'], doc_id: null, error: null });
    }
    if (path.endsWith('/deferred/cancel')) return response(200, { phase: 'cancelled', admitted: false, media_dependencies: [], doc_id: null, error: null });
    if (path.endsWith('/abort')) return response(404, { detail: 'not found' });
    throw new Error(`Unexpected request: ${path}`);
  }));
});
afterEach(() => { cleanup(); invalidateUploadSession(); vi.unstubAllGlobals(); });

describe('real queue orchestration with IndexedDB and HTTP adapter (byte engine stubbed)', () => {
  it('indexes tags in deferred posts but only nudges when publication is observed', async () => {
    const view = mount();
    await waitFor(() => expect(queue.enabled).toBe(true));
    const input = { ...draft(), text: 'Film night @bob' };
    await act(async () => { await queue.queue(input); });
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('processing'));
    expect(requests.find(item => item.path.endsWith('/deferred/create'))!.body.intent).toMatchObject({ body: { mention_usernames: ['bob'] } });
    expect(fake.nudge).not.toHaveBeenCalled();
    view.unmount(); phase = 'done';
    mount();
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('published'));
    expect(fake.nudge).toHaveBeenCalledExactlyOnceWith({ username: 'bob', provider: 'node' }, { type: 'post_mention', from: 'team', ref_doc_id: 'post-id' });
  });

  it('saves the frozen draft and admits HLS-waiting publication, then observes its result after remount without a file', async () => {
    const view = mount();
    await waitFor(() => expect(queue.enabled).toBe(true));
    const input = draft();
    await act(async () => { expect(await queue.queue(input)).toBe(true); });
    input.text = 'Later edit'; input.groups!.push('unintended');
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('processing'));
    expect(fake.run).toHaveBeenCalledTimes(1);
    const create = requests.find(item => item.path.endsWith('/deferred/create'))!;
    expect(create.body.intent).toMatchObject({ author_as: 'team', groups: ['team', 'discover'], body: { text: 'Original text', media_refs: ['media-id'] } });
    expect((await loadUploads(owner))[0]).toMatchObject({ phase: 'processing', deferred_admitted: true, media_doc_id: 'media-id' });
    view.unmount(); phase = 'done';
    mount();
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('published'));
    expect(queue.tasks[0].postPath).toBe('/groups/team/p/post-id');
    expect(fake.run).toHaveBeenCalledTimes(1);
    expect(requests.filter(item => item.path.endsWith('/deferred/create'))).toHaveLength(1);
  });

  it('restores an interrupted transfer, asks for the original file, and resumes that same task', async () => {
    fake.run.mockImplementationOnce(() => new Promise(() => {}));
    const view = mount(); await waitFor(() => expect(queue.enabled).toBe(true));
    const input = draft();
    await act(async () => { await queue.queue(input); });
    await waitFor(() => expect(fake.run).toHaveBeenCalledTimes(1));
    const id = queue.tasks[0].id;
    view.unmount(); mount();
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('needs-file'));
    expect(queue.tasks[0].uploadedBytes).toBe(2);
    await act(async () => { queue.selectFile(id, input.media[0].file); });
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('processing'));
    expect(queue.tasks[0].id).toBe(id);
    expect(fake.run).toHaveBeenCalledTimes(2);
  });

  it('does not expose an old account queue after logout, and restores only its partition on return', async () => {
    mount(); await waitFor(() => expect(queue.enabled).toBe(true));
    await act(async () => { await queue.queue(draft()); });
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('processing'));
    await act(async () => { fake.username = 'bob'; invalidateUploadSession(); });
    await waitFor(() => expect(queue.tasks).toEqual([]));
    await act(async () => { fake.username = 'alice'; invalidateUploadSession(); });
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('processing'));
  });

  it('keeps original-file selection available after wrong-content reselection', async () => {
    fake.run.mockImplementationOnce(() => new Promise(() => {}));
    const view = mount(); await waitFor(() => expect(queue.enabled).toBe(true));
    const input = draft();
    await act(async () => { await queue.queue(input); });
    await waitFor(() => expect(fake.run).toHaveBeenCalledTimes(1));
    const id = queue.tasks[0].id;
    view.unmount(); mount();
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('needs-file'));
    const source = input.media[0].file;
    await act(async () => { queue.selectFile(id, new File(['fake'], source.name, { type: source.type, lastModified: source.lastModified })); });
    await waitFor(() => expect(queue.tasks[0]?.error).toMatch(/different content/));
    expect(queue.tasks[0].phase).toBe('needs-file');
    expect(queue.tasks[0].uploadedBytes).toBe(2);
    expect(fake.run).toHaveBeenCalledTimes(1);
    await act(async () => { queue.selectFile(id, source); });
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('processing'));
  });

  it('cancels the durable intent before aborting transfer and never deletes a published post', async () => {
    fake.run.mockImplementationOnce(() => new Promise(() => {}));
    mount(); await waitFor(() => expect(queue.enabled).toBe(true));
    await act(async () => { await queue.queue(draft()); });
    await waitFor(() => expect(fake.run).toHaveBeenCalledTimes(1));
    await act(async () => { queue.command(queue.tasks[0].id, { type: 'cancel' }); });
    await waitFor(() => expect(queue.tasks[0]?.phase).toBe('cancelled'));
    const paths = requests.map(item => item.path);
    expect(paths.indexOf('/v3/deferred/cancel')).toBeLessThan(paths.indexOf('/v3/media/uploads/abort'));
    expect(paths.some(path => path.includes('delete'))).toBe(false);
  });

  it('retries capability discovery on reconnect after offline startup', async () => {
    capabilityFails = true;
    mount(); await waitFor(() => expect(queue.loading).toBe(false));
    expect(queue.enabled).toBe(false);
    capabilityFails = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(queue.enabled).toBe(true));
  });

  it('leaves edited and mixed media on the existing composer path', async () => {
    mount(); await waitFor(() => expect(queue.enabled).toBe(true));
    const edited = draft(); edited.media[0].edited = true;
    const mixed = draft(); mixed.media.push(mixed.media[0]);
    expect(await queue.queue(edited)).toBe(false);
    expect(await queue.queue(mixed)).toBe(false);
    expect(queue.tasks).toEqual([]);
  });
});
