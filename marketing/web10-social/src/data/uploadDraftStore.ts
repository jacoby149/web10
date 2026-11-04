import type { MediaPostDraft, UploadFileHint, UploadPhase } from '@/components/Uploads/uploadState';
import { identityKey, type UploadIdentity } from './uploadApi';

export interface SavedVideoDraft {
  title: string; text: string; visibility: MediaPostDraft['visibility']; authorAs?: string;
  authorLabel: string; groups: string[]; pinnedAdId?: string; markAsMusic: boolean;
  width: number; height: number; duration: number; altText: string;
}
export interface SavedUpload {
  version: 1; key: string; owner_key: string; owner: UploadIdentity; id: string;
  revision: number; phase: UploadPhase; file: UploadFileHint; draft: SavedVideoDraft;
  created_at: string; uploaded_bytes: number; checksum_sha256?: string;
  media_doc_id?: string; deferred_admitted?: boolean; doc_id?: string; error?: string;
}
export class StaleUploadRecord extends Error { constructor() { super('Upload changed in another tab. Reload its current state.'); } }
const DATABASE = 'web10-upload-queue-v1';
const phases = new Set(['preparing', 'uploading', 'paused', 'offline', 'needs-file', 'verifying', 'processing', 'processing-failed', 'publishing', 'publish-failed', 'published', 'cancelled']);
export const uploadKey = (owner: UploadIdentity, id: string) => JSON.stringify([identityKey(owner), id]);

function validate(row: SavedUpload, owner: UploadIdentity) {
  if (!row || row.version !== 1 || !row.owner || row.owner_key !== identityKey(owner) || identityKey(row.owner) !== identityKey(owner)
    || !/^[0-9a-f]{32}$/.test(row.id) || row.key !== uploadKey(owner, row.id) || !Number.isInteger(row.revision) || row.revision < 0 || !phases.has(row.phase)
    || !row.file || !Number.isSafeInteger(row.file.size) || row.file.size <= 0 || typeof row.file.name !== 'string'
    || typeof row.file.type !== 'string' || !row.file.type.startsWith('video/') || !Number.isFinite(row.file.lastModified)
    || !row.draft || typeof row.draft.title !== 'string' || typeof row.draft.text !== 'string' || !Array.isArray(row.draft.groups)
    || !row.draft.groups.length || row.draft.groups.some(group => typeof group !== 'string' || !group)
    || typeof row.draft.authorLabel !== 'string' || typeof row.draft.markAsMusic !== 'boolean'
    || [row.draft.width, row.draft.height, row.draft.duration].some(value => !Number.isFinite(value) || value < 0)
    || !['public', 'friends', 'private'].includes(row.draft.visibility) || !Number.isFinite(row.uploaded_bytes) || row.uploaded_bytes < 0 || row.uploaded_bytes > row.file.size
    || row.checksum_sha256 && !/^[0-9a-f]{64}$/.test(row.checksum_sha256)
    || row.deferred_admitted && (!row.media_doc_id || !row.checksum_sha256)) {
    throw new Error('A saved upload could not be restored safely. Its data has not been deleted.');
  }
  return row;
}

/** Explicit allowlist: neither File objects nor arbitrary credential fields reach IndexedDB. */
function snapshot(row: SavedUpload, revision: number): SavedUpload {
  const owner = { node: row.owner.node, provider: row.owner.provider, username: row.owner.username };
  const draft = row.draft;
  return validate({ version: 1, key: uploadKey(owner, row.id), owner_key: identityKey(owner), owner, id: row.id, revision,
    phase: row.phase, created_at: row.created_at, uploaded_bytes: row.uploaded_bytes,
    file: { name: row.file.name, type: row.file.type, size: row.file.size, lastModified: row.file.lastModified },
    draft: { title: draft.title, text: draft.text, visibility: draft.visibility, authorAs: draft.authorAs,
      authorLabel: draft.authorLabel, groups: [...draft.groups], pinnedAdId: draft.pinnedAdId, markAsMusic: draft.markAsMusic,
      width: draft.width, height: draft.height, duration: draft.duration, altText: draft.altText },
    checksum_sha256: row.checksum_sha256, media_doc_id: row.media_doc_id, deferred_admitted: row.deferred_admitted,
    doc_id: row.doc_id, error: row.error,
  }, owner);
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser cannot save resumable drafts. No upload has started.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tasks', { keyPath: 'key' }).createIndex('owner_key', 'owner_key');
    request.onerror = () => reject(new Error('Upload recovery storage is unavailable. Your composer has not been cleared.'));
    request.onblocked = () => reject(new Error('Close another web10 tab to update upload recovery storage.'));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export async function loadUploads(owner: UploadIdentity): Promise<SavedUpload[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tasks', 'readonly');
    const request = transaction.objectStore('tasks').index('owner_key').getAll(identityKey(owner));
    request.onsuccess = () => {
      try { resolve(request.result.map(row => validate(row, owner))); }
      catch (error) { reject(error); }
    };
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(new Error('Saved uploads could not be read. Try again.')); };
  });
}

export async function saveUpload(row: SavedUpload, expectedRevision: number | null): Promise<SavedUpload> {
  const saved = snapshot(row, expectedRevision === null ? 0 : expectedRevision + 1);
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tasks', 'readwrite');
    const store = transaction.objectStore('tasks');
    let conflict = false;
    const request = store.get(saved.key);
    request.onsuccess = () => {
      const old = request.result as SavedUpload | undefined;
      if (expectedRevision === null ? !!old : !old || old.revision !== expectedRevision
        || ['cancelled', 'published'].includes(old.phase) && saved.phase !== old.phase) {
        conflict = true; transaction.abort(); return;
      }
      store.put(saved);
    };
    transaction.oncomplete = () => { db.close(); resolve(saved); };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(conflict ? new StaleUploadRecord() : new Error('Upload draft could not be saved. Check browser storage space; your existing record has not been discarded.'));
    };
  });
}

export function videoDraft(draft: MediaPostDraft, groups: string[]): SavedVideoDraft {
  const media = draft.media[0];
  return { title: draft.title, text: draft.text, visibility: draft.visibility, authorAs: draft.authorAs, authorLabel: draft.authorLabel,
    groups: [...groups], pinnedAdId: draft.pinnedAdId, markAsMusic: draft.markAsMusic,
    width: media.width, height: media.height, duration: media.duration, altText: media.altText };
}
