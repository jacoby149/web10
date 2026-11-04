import { describe, expect, it } from 'vitest';
import { PreviewUploadQueue, ownerKey } from '../../../screenshots/harness/previewUploadQueue';
import type { MediaPostDraft, UploadTask } from '@/components/Uploads/uploadState';

const alice = { node: 'node-a', provider: 'issuer-a', username: 'alice' };
const bob = { ...alice, username: 'bob' };
function task(): UploadTask {
  return { id: 'film', title: 'Nosferatu', description: 'Full film', authorLabel: 'Team A', audienceLabel: 'Public', file: { name: 'film.mp4', size: 1000, type: 'video/mp4', lastModified: 123 }, uploadedBytes: 420, phase: 'uploading' };
}
function draft(authorAs = 'group-a'): MediaPostDraft {
  return { title: 'Movie night', text: '**Whole film**', authorAs, authorLabel: authorAs,
    groups: ['destination'], visibility: 'private', pinnedAdId: 'ad', markAsMusic: true,
    media: [{ file: new File(['movie'], 'film.mp4', { type: 'video/mp4', lastModified: 123 }), width: 640, height: 480, duration: 5514, altText: 'Silent film', edited: true }],
  };
}

describe('preview lifecycle model — not real authentication/persistence', () => {
  it.each(['username', 'provider', 'node'] as const)('partitions tasks by %s, even when the other owner fields match', field => {
    const store = new PreviewUploadQueue(alice, [task()]);
    store.activate({ ...alice, [field]: 'different' });
    expect(store.getSnapshot().tasks).toEqual([]);
    store.activate(alice);
    expect(store.getSnapshot().tasks[0]).toMatchObject({ title: 'Nosferatu', uploadedBytes: 420, phase: 'needs-file' });
  });

  it('hides queue and draft data on logout; old commands cannot cancel after A→B→A', () => {
    const store = new PreviewUploadQueue(alice, [task()]);
    const stale = store.bind();
    store.activate(null);
    expect(store.getSnapshot().tasks).toEqual([]);
    expect(store.getDraft('film')).toBeUndefined();
    store.activate(bob);
    stale.command('film', { type: 'cancel' });
    store.activate(alice);
    stale.command('film', { type: 'cancel' });
    expect(store.getSnapshot().tasks[0].phase).toBe('needs-file');
  });

  it('a stale composer cannot enqueue into a new account or a later session of the same account', () => {
    const store = new PreviewUploadQueue(alice, []);
    const stale = store.bind();
    store.activate(bob);
    expect(() => stale.queue(draft())).toThrow(/account changed/);
    store.activate(alice);
    expect(() => stale.queue(draft())).toThrow(/account changed/);
    expect(store.getSnapshot().tasks).toEqual([]);
  });

  it('late events cannot borrow a resumed attempt even when its phase matches again', () => {
    const store = new PreviewUploadQueue(alice, [task()]);
    const worker = store.bind();
    store.bind().command('film', { type: 'pause' });
    store.bind().command('film', { type: 'resume' });
    worker.command('film', { type: 'progress', uploadedBytes: 999 });
    worker.command('film', { type: 'uploaded' });
    expect(store.getSnapshot().tasks[0]).toMatchObject({ phase: 'uploading', uploadedBytes: 420 });
    store.bind().command('film', { type: 'progress', uploadedBytes: 600 });
    expect(store.getSnapshot().tasks[0].uploadedBytes).toBe(600);
  });

  it('same-owner reauthentication invalidates old callbacks without reauthoring the task', () => {
    const store = new PreviewUploadQueue(alice, [task()]);
    const stale = store.bind();
    store.activate(alice);
    stale.command('film', { type: 'uploaded' });
    expect(store.getSnapshot().tasks[0]).toMatchObject({ phase: 'needs-file', authorLabel: 'Team A' });
  });

  it('scenario reset rejects callbacks for a previous task with the same ID', () => {
    const store = new PreviewUploadQueue(alice, [task()]);
    const stale = store.bind();
    store.bind().reset([task()]);
    stale.command('film', { type: 'uploaded' });
    expect(store.getSnapshot().tasks[0].phase).toBe('uploading');
  });

  it('snapshots full draft metadata without File objects and never rewrites an old author with a new draft', () => {
    const store = new PreviewUploadQueue(alice, []);
    const first = draft();
    const id = store.bind().queue(first);
    first.groups!.push('later-destination');
    first.authorAs = 'changed';
    store.bind().queue(draft('group-b'));
    expect(store.getDraft(id)).toMatchObject({ title: 'Movie night', text: '**Whole film**', authorAs: 'group-a', groups: ['destination'], visibility: 'private', pinnedAdId: 'ad', markAsMusic: true });
    expect(store.getDraft(id)!.media[0]).toMatchObject({ duration: 5514, edited: true, altText: 'Silent film' });
    expect(store.getDraft(id)!.media[0].file).not.toBeInstanceOf(File);
    expect(store.getDraft(id)!.media[0].file).toMatchObject({ name: 'film.mp4', size: 5 });
    store.activate(bob);
    expect(store.getDraft(id)).toBeUndefined();
    store.activate(alice);
    expect(store.getDraft(id)!.authorAs).toBe('group-a');
  });

  it('owner keys cannot collide through separators or caller object mutation', () => {
    expect(ownerKey({ node: 'a/b', provider: 'c', username: 'd' })).not.toBe(ownerKey({ node: 'a', provider: 'b/c', username: 'd' }));
    const owner = { ...alice };
    const store = new PreviewUploadQueue(owner, [task()]);
    owner.username = 'bob';
    expect(store.getSnapshot().owner!.username).toBe('alice');
  });
});
