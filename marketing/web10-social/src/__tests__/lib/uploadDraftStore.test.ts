import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { identityKey } from '@/data/uploadApi';
import { loadUploads, saveUpload, StaleUploadRecord, uploadKey, type SavedUpload } from '@/data/uploadDraftStore';

const owner = { node: 'https://node.example', provider: 'node.example', username: 'alice' };
function row(): SavedUpload {
  const id = 'a'.repeat(32);
  return { version: 1, key: uploadKey(owner, id), owner_key: identityKey(owner), owner, id, revision: 0,
    phase: 'uploading', file: { name: 'Nosferatu.mp4', size: 514619769, type: 'video/mp4', lastModified: 123 },
    draft: { title: 'Nosferatu (1922)', text: '**Whole film**', visibility: 'public', authorAs: 'team', authorLabel: 'Century Club Movies',
      groups: ['team', 'discover'], pinnedAdId: 'ad', markAsMusic: false, width: 640, height: 480, duration: 5514, altText: 'Silent film' },
    uploaded_bytes: 8388608, created_at: '2026-11-03T00:00:00Z', checksum_sha256: 'b'.repeat(64) };
}
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));

describe('owner-scoped IndexedDB upload recovery', () => {
  it('recovers the complete immutable draft and acknowledged progress through a new database connection', async () => {
    const original = row();
    await saveUpload(original, null);
    original.draft.groups.push('later-group');
    const [restored] = await loadUploads(owner);
    expect(restored.draft).toMatchObject({ title: 'Nosferatu (1922)', text: '**Whole film**', groups: ['team', 'discover'], authorAs: 'team', pinnedAdId: 'ad' });
    expect(restored.uploaded_bytes).toBe(8388608);
    expect(restored.file.size).toBe(514619769);
    expect(restored.checksum_sha256).toBe('b'.repeat(64));
  });

  it.each(['node', 'provider', 'username'] as const)('does not return another %s partition', async field => {
    await saveUpload(row(), null);
    expect(await loadUploads({ ...owner, [field]: 'different' })).toEqual([]);
  });

  it('allowlists metadata rather than persisting File objects, credentials or signed URLs', async () => {
    const original = { ...row(), token: 'must-not-persist', signedUrl: 'must-not-persist', source: new File(['bytes'], 'file.mp4') };
    await saveUpload(original, null);
    const serialized = JSON.stringify(await loadUploads(owner));
    expect(serialized).not.toContain('must-not-persist');
    expect(serialized).not.toContain('source');
    expect(serialized).toContain('checksum_sha256');
  });

  it('two tabs cannot overwrite the same revision and cancellation cannot be resurrected', async () => {
    const first = await saveUpload(row(), null);
    const results = await Promise.allSettled([
      saveUpload({ ...first, phase: 'paused' }, first.revision),
      saveUpload({ ...first, phase: 'offline' }, first.revision),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const [current] = await loadUploads(owner);
    const cancelled = await saveUpload({ ...current, phase: 'cancelled' }, current.revision);
    await expect(saveUpload({ ...cancelled, phase: 'processing' }, cancelled.revision)).rejects.toBeInstanceOf(StaleUploadRecord);
    expect((await loadUploads(owner))[0].phase).toBe('cancelled');
  });

  it('unsupported/corrupt records are reported, not silently deleted or represented as an empty queue', async () => {
    await saveUpload(row(), null);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('web10-upload-queue-v1', 1);
      open.onerror = reject;
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('tasks', 'readwrite');
        tx.objectStore('tasks').put({ ...row(), version: 999 });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = reject;
      };
    });
    await expect(loadUploads(owner)).rejects.toThrow(/could not be restored safely/);
  });

  it('does not claim persistence when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(saveUpload(row(), null)).rejects.toThrow(/No upload has started/);
  });
});
