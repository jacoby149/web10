import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MediaPostDraft, UploadAction, UploadTask } from '@/components/Uploads/uploadState';
import { fileHint } from '@/components/Uploads/uploadState';
import { UploadCenter, UploadIndicator } from '@/components/Uploads/UploadCenter';
import { createUploadApi, currentUploadIdentity, identityKey, UploadRequestError, type DeferredIntent, type DeferredView } from '@/data/uploadApi';
import { loadUploads, saveUpload, uploadKey, videoDraft, StaleUploadRecord, type SavedUpload } from '@/data/uploadDraftStore';
import { determinePostGroups } from '@/data/posts';
import { ensureCloseFriends, ensureFollowers, getDiscoverGroupId } from '@/data/groups';
import { actingPostGroups } from '@/data/actingIdentity';
import type { resumableTransfer as TransferFactory } from '@/lib/resumableTransfer';
import { uploadAttempt } from '@/lib/uploadSession';
import { API_ORIGIN } from '@/lib/origins';
import { useComposer } from './ComposerContext';
import { toast } from '@/components/shared/Toast';
import { mentionedUsernames } from '@/data/mentions';
import { sendNotification } from '@/data/notifications';

type Attempt = ReturnType<typeof uploadAttempt>;
interface Context {
  enabled: boolean; loading: boolean; tasks: UploadTask[]; error: string | null;
  queue(draft: MediaPostDraft): Promise<boolean>;
  command(id: string, action: UploadAction): void;
  selectFile(id: string, file: File): void;
}
const UploadContext = createContext<Context | null>(null);
const terminal = (row: SavedUpload) => row.phase === 'published' || row.phase === 'cancelled';

function createIntent(row: SavedUpload): DeferredIntent {
  const draft = row.draft;
  const tags = draft.width < draft.height ? ['short'] : draft.markAsMusic ? ['music'] : undefined;
  return { service: 'posts', groups: [...draft.groups], author_as: draft.authorAs,
    body: { title: draft.title || undefined, text: draft.text, mention_usernames: mentionedUsernames(draft.text), visibility: draft.visibility,
      media_refs: row.media_doc_id ? [row.media_doc_id] : [], tags },
    ad_preference: draft.pinnedAdId ? { mode: 'pinned', target: draft.pinnedAdId } : { mode: 'none' } };
}
function service(row: SavedUpload) { return row.draft.visibility === 'public' ? 'public_media' : 'media'; }

export function UploadProvider({ children, sessionKey }: { children: ReactNode; sessionKey: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { closeComposer, openComposer } = useComposer();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SavedUpload[]>([]);
  const [moving, setMoving] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const files = useRef(new Map<string, File>());
  const attempts = useRef(new Map<string, { attempt: Attempt; stop(): void }>());
  const writes = useRef(new Map<string, Promise<unknown>>());
  const epoch = useRef(0);
  const currentOwner = currentUploadIdentity();
  const lastOwner = useRef(currentOwner ? identityKey(currentOwner) : null);
  const available = useRef(false);
  const runRef = useRef<(id: string) => void>(() => {});

  function owned(row: SavedUpload) {
    const current = currentUploadIdentity();
    return current && identityKey(current) === row.owner_key;
  }
  function replace(next: SavedUpload[]) { rowsRef.current = next; setRows(next); }
  function stop(id: string) {
    const running = attempts.current.get(id);
    running?.attempt.stop(); running?.stop(); attempts.current.delete(id);
  }
  function update(id: string, patch: Partial<SavedUpload>, attempt?: Attempt): Promise<SavedUpload> {
    const previous = writes.current.get(id) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      attempt?.check();
      const row = rowsRef.current.find(item => item.id === id);
      if (!row || !owned(row)) throw new DOMException('Account changed', 'AbortError');
      const next = await saveUpload({ ...row, ...patch }, row.revision);
      attempt?.check();
      if (owned(next)) replace(rowsRef.current.map(item => item.id === id ? next : item));
      return next;
    });
    writes.current.set(id, pending);
    return pending;
  }
  async function applyJob(row: SavedUpload, job: DeferredView, attempt: Attempt) {
    const phase = job.phase === 'done' ? 'published' : job.phase === 'creating' ? 'publishing'
      : job.phase === 'cancelled' ? 'cancelled' : job.phase === 'blocked' ? 'publish-failed'
        : job.phase === 'failed' ? (job.error === 'media_preparation_failed' ? 'processing-failed' : 'publish-failed') : 'processing';
    const messages: Record<string, string> = {
      publication_authority_changed: 'You no longer have permission to publish as the selected account or group. Check app approval and group permissions, then try again.',
      existing_result_requires_review: 'This post already exists, but its audience needs checking. We won’t create a duplicate.',
      media_preparation_failed: 'Video preparation failed. Your original is uploaded; retrying processing will not upload it again.',
      operation_expired: 'This pending post has expired. Check its status before starting another post.',
    };
    const patch: Partial<SavedUpload> = { phase, deferred_admitted: job.admitted,
      media_doc_id: row.media_doc_id || job.media_dependencies[0], doc_id: job.doc_id || undefined,
      error: job.error ? messages[job.error] || 'The pending post needs attention. Its original upload is retained.' : undefined };
    if (Object.entries(patch).every(([key, value]) => row[key as keyof SavedUpload] === value)) return row;
    const result = await update(row.id, patch, attempt);
    if (phase === 'published' && row.phase !== 'published') {
      if (job.doc_id) {
        for (const username of mentionedUsernames(row.draft.text)) {
          sendNotification({ username, provider: row.owner.provider }, { type: 'post_mention', from: row.draft.authorAs || row.owner.username, ref_doc_id: job.doc_id });
        }
      }
      window.dispatchEvent(new CustomEvent('post-created'));
      toast.success('Your video is ready and your post is published.');
      files.current.delete(row.id);
    }
    return result;
  }

  async function run(id: string) {
    if (!available.current || attempts.current.has(id)) return;
    let row = rowsRef.current.find(item => item.id === id);
    if (!row || terminal(row) || !owned(row) || row.phase === 'paused') return;
    const attempt = uploadAttempt();
    const api = createUploadApi(row.owner, attempt);
    let transfer: ReturnType<typeof TransferFactory> | undefined;
    attempts.current.set(id, { attempt, stop: () => transfer?.stop() });
    const work = async () => {
      row = rowsRef.current.find(item => item.id === id)!;
      api.check();
      try {
        const job = await api.job(row.id);
        if (job.admitted || job.phase === 'cancelled') { await applyJob(row, job, attempt); return; }
      } catch (failure) {
        if (!(failure instanceof UploadRequestError) || failure.status !== 404 || row.deferred_admitted) throw failure;
      }
      let native;
      if (row.checksum_sha256) {
        try { native = await api.status(id, service(row)); }
        catch (failure) { if (!(failure instanceof UploadRequestError) || failure.status !== 404) throw failure; }
      }
      if (native?.phase === 'completing') native = await api.complete(id, service(row));
      if (native?.phase === 'failed' || native?.phase === 'aborted') {
        await update(id, { phase: 'needs-file', error: 'This transfer can no longer resume. Discard this pending post and start again with the original file.' }, attempt);
        return;
      }
      if (native?.phase !== 'completed') {
        const file = files.current.get(id);
        if (!file) {
          await update(id, { phase: 'needs-file', uploaded_bytes: native?.uploaded_bytes || row.uploaded_bytes, error: undefined }, attempt);
          return;
        }
        if (!row.checksum_sha256) {
          const { fileChecksum } = await import('@/lib/fileChecksum');
          row = await update(id, { checksum_sha256: await fileChecksum(file, api.check) }, attempt);
        }
        row = await update(id, { phase: 'uploading', error: undefined }, attempt);
        let acknowledged = row.uploaded_bytes;
        setMoving(previous => ({ ...previous, [id]: acknowledged }));
        const { resumableTransfer } = await import('@/lib/resumableTransfer');
        api.check();
        transfer = resumableTransfer(api, { session_id: id, service: service(row), filename: row.file.name, mime_type: row.file.type, size_bytes: row.file.size, checksum_sha256: row.checksum_sha256! }, (confirmed, transferred) => {
          setMoving(previous => ({ ...previous, [id]: Math.max(previous[id] || 0, transferred) }));
          if (confirmed <= acknowledged) return;
          acknowledged = confirmed;
          update(id, { uploaded_bytes: confirmed }, attempt).catch(() => {});
        });
        native = await transfer.run(file);
      }
      row = await update(id, { phase: 'verifying', uploaded_bytes: row.file.size }, attempt);
      const metadata = await api.confirm(id, service(row), { width: row.draft.width, height: row.draft.height, duration_seconds: row.draft.duration, alt_text: row.draft.altText || undefined });
      row = await update(id, { media_doc_id: metadata.doc_id }, attempt);
      const job = await api.defer(id, createIntent(row), [metadata.doc_id]);
      row = await applyJob(row, job, attempt);
      files.current.delete(id);
    };
    try {
      if (navigator.locks) await navigator.locks.request(`web10-upload:${row.key}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Another tab is handling this upload. Continue there or close it and resume here.');
        await work();
      });
      else await work();
    } catch (failure) {
      if (!attempt.signal.aborted && row && owned(row)) {
        if (failure instanceof StaleUploadRecord) { setError(failure.message); }
        else {
          const phase = row.deferred_admitted ? 'publish-failed' : !navigator.onLine ? 'offline' : files.current.has(id) ? 'paused' : 'needs-file';
          await update(id, { phase, error: failure instanceof Error ? failure.message : 'Upload interrupted. Your saved progress has not been discarded.' }, attempt).catch(() => {});
        }
      }
    } finally {
      transfer?.stop(); attempt.release();
      if (attempts.current.get(id)?.attempt === attempt) attempts.current.delete(id);
    }
  }
  runRef.current = id => { void run(id); };

  async function hydrate(resetComposer = false) {
    const captured = ++epoch.current;
    for (const id of attempts.current.keys()) stop(id);
    files.current.clear();
    setMoving({});
    replace([]);
    if (resetComposer) closeComposer();
    const owner = currentUploadIdentity();
    if (!owner) return;
    try {
      const saved = await loadUploads(owner);
      const current = currentUploadIdentity();
      if (captured !== epoch.current || !current || identityKey(current) !== identityKey(owner)) return;
      const merged = new Map(saved.map(row => [row.id, row]));
      for (const row of rowsRef.current) {
        if (row.owner_key === identityKey(owner) && (!merged.has(row.id) || merged.get(row.id)!.revision < row.revision)) merged.set(row.id, row);
      }
      const restored = [...merged.values()];
      replace(restored); setError(null);
      for (const row of restored) if (!terminal(row) && row.phase !== 'paused') runRef.current(row.id);
    } catch (failure) { if (captured === epoch.current) setError(failure instanceof Error ? failure.message : 'Upload drafts could not be restored.'); }
  }
  useEffect(() => {
    let cancelled = false;
    let discovering = false;
    const discover = async () => {
      if (cancelled || discovering || available.current) return;
      discovering = true;
      console.log('[upload] capability discovery started');
      try {
        const response = await fetch(`${API_ORIGIN}/v3/media/uploads/capabilities`);
        if (!response.ok) throw new Error('Upload capability discovery unavailable');
        const capability = await response.json();
        if (cancelled) return;
        available.current = !!(capability?.enabled && capability?.deferred_creates);
        setEnabled(available.current);
        console.log('[upload] capability discovery completed', { enabled: available.current });
        if (available.current) await hydrate();
      } catch {
        console.warn('[upload] capability discovery unavailable; retry on reconnect');
      } finally {
        discovering = false;
        if (!cancelled) setLoading(false);
      }
    };
    void discover();
    window.addEventListener('online', discover);
    return () => {
      cancelled = true; window.removeEventListener('online', discover);
      for (const id of attempts.current.keys()) stop(id); files.current.clear();
    };
  }, []);
  useEffect(() => {
    const owner = currentUploadIdentity();
    const key = owner ? identityKey(owner) : null;
    if (key !== lastOwner.current) { lastOwner.current = key; if (available.current) void hydrate(true); }
  }, [sessionKey]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('compose') === '1' && currentUploadIdentity()) openComposer();
  }, [location.search, sessionKey]);
  useEffect(() => {
    const changed = () => {
      const owner = currentUploadIdentity(); lastOwner.current = owner ? identityKey(owner) : null;
      if (available.current) void hydrate(true);
    };
    const offline = () => {
      for (const row of rowsRef.current) if (owned(row) && ['preparing', 'uploading'].includes(row.phase)) {
        stop(row.id); void update(row.id, { phase: 'offline' }).catch(() => {});
      }
    };
    const online = () => {
      for (const row of rowsRef.current) if (owned(row) && row.phase === 'offline') runRef.current(row.id);
    };
    window.addEventListener('upload-session-changed', changed);
    window.addEventListener('offline', offline); window.addEventListener('online', online);
    const timer = window.setInterval(() => {
      for (const row of rowsRef.current) if (owned(row) && ['processing', 'publishing'].includes(row.phase)) runRef.current(row.id);
    }, 3000);
    return () => { window.clearInterval(timer); window.removeEventListener('upload-session-changed', changed); window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }, []);

  async function queue(draft: MediaPostDraft) {
    // The queue transport is a single UNEDITED video with no thumbnail pick:
    // an edited file is already the finished re-encode (the standard path),
    // and the multipart confirm does not carry the creator's thumbnail yet
    // (the pick would be silently lost — the follow-up lane item extends
    // confirm to carry it). A draft with a pick returns false and the
    // standard upload runs, honoring the pick.
    if (
      !enabled ||
      draft.media.length !== 1 ||
      !draft.media[0].file.type.startsWith('video/') ||
      draft.media[0].edited ||
      draft.media[0].thumbnail
    ) {
      if (draft.media[0]?.thumbnail) console.log('[upload] draft has a thumbnail pick — standard path (the queue transport cannot carry it yet)');
      return false;
    }
    const owner = currentUploadIdentity();
    if (!owner) throw new Error('Log in before queuing a video.');
    const admission = uploadAttempt();
    try {
      const api = createUploadApi(owner, admission);
      let groups = draft.groups ? [...draft.groups] : draft.authorAs ? await actingPostGroups(draft.authorAs) : determinePostGroups(draft.visibility, owner.username);
      api.check();
      if (!draft.authorAs && !draft.groups) {
        if (draft.visibility === 'private') await ensureCloseFriends(owner.username); else await ensureFollowers(owner.username);
      }
      api.check();
      if (draft.authorAs || draft.groups) groups = draft.visibility === 'public' ? [...new Set([...groups, getDiscoverGroupId()])] : groups.filter(group => group !== getDiscoverGroupId());
      if (!groups.length) throw new Error('Choose an audience before posting.');
      const id = crypto.randomUUID().replace(/-/g, '');
      const row: SavedUpload = { version: 1, key: uploadKey(owner, id), owner_key: identityKey(owner), owner, id, revision: 0,
        phase: 'preparing', file: fileHint(draft.media[0].file), draft: videoDraft(draft, groups), created_at: new Date().toISOString(), uploaded_bytes: 0 };
      await api.validate(id, createIntent(row));
      const saved = await saveUpload(row, null);
      api.check();
      files.current.set(id, draft.media[0].file);
      replace([...rowsRef.current, saved]);
      runRef.current(id);
      closeComposer(); navigate(`/uploads?upload=${id}`);
      return true;
    } finally { admission.release(); }
  }

  function command(id: string, action: UploadAction) {
    const row = rowsRef.current.find(item => item.id === id);
    if (!row || !owned(row) || !enabled) return;
    void (async () => {
      if (action.type === 'pause') { stop(id); await update(id, { phase: 'paused', error: undefined }); return; }
      if (action.type === 'resume') { await update(id, { phase: 'preparing', error: undefined }); runRef.current(id); return; }
      const attempt = uploadAttempt();
      try {
        const api = createUploadApi(row.owner, attempt);
        if (action.type === 'cancel') {
          stop(id);
          const cancelled = await api.cancelJob(id);
          if (cancelled.phase !== 'cancelled') throw new Error('Publication has already started. Check its outcome.');
          try { await api.abort(id, service(row)); } catch (failure) { if (!(failure instanceof UploadRequestError) || ![404, 409].includes(failure.status)) throw failure; }
          await update(id, { phase: 'cancelled', error: undefined }, attempt); files.current.delete(id);
        } else if (action.type === 'retry-processing' || action.type === 'retry-publish') {
          const status = await api.job(id);
          if (status.phase === 'done') { await applyJob(row, status, attempt); return; }
          if (action.type === 'retry-processing') await api.retryTranscode(id, service(row));
          const retried = ['blocked', 'failed'].includes(status.phase) ? await api.retryJob(id) : status;
          await applyJob(row, retried, attempt);
        }
      } finally { attempt.release(); }
    })().catch(failure => { toast.error(failure instanceof Error ? failure.message : 'The pending post could not be updated.'); });
  }
  function selectFile(id: string, file: File) {
    const row = rowsRef.current.find(item => item.id === id);
    if (!row || !owned(row) || row.phase !== 'needs-file') return;
    stop(id);
    const attempt = uploadAttempt();
    const api = createUploadApi(row.owner, attempt);
    attempts.current.set(id, { attempt, stop() {} });
    void (async () => {
      let resume = false;
      try {
        const { fileChecksum } = await import('@/lib/fileChecksum');
        api.check();
        if (file.size !== row.file.size || row.checksum_sha256 && await fileChecksum(file, api.check) !== row.checksum_sha256) {
          files.current.delete(id);
          await update(id, { phase: 'needs-file', error: 'That file has different content. Select the original video; your uploaded parts are still saved.' }, attempt);
          return;
        }
        api.check();
        files.current.set(id, file);
        await update(id, { phase: 'preparing', error: undefined }, attempt);
        resume = true;
      } catch (failure) {
        if (!attempt.signal.aborted) toast.error(failure instanceof Error ? failure.message : 'The selected file could not be checked.');
      } finally {
        attempt.release();
        if (attempts.current.get(id)?.attempt === attempt) attempts.current.delete(id);
        if (resume && !attempt.signal.aborted) runRef.current(id);
      }
    })();
  }
  const tasks: UploadTask[] = rows.filter(owned).map(row => ({ id: row.id, title: row.draft.title, description: row.draft.text,
    authorLabel: row.draft.authorLabel, audienceLabel: row.draft.visibility === 'public' ? 'Public' : 'Chosen audience', file: row.file,
    durationSeconds: row.draft.duration, uploadedBytes: row.uploaded_bytes, transferredBytes: moving[row.id], phase: row.phase, error: row.error,
    postPath: row.doc_id ? row.draft.authorAs ? `/groups/${encodeURIComponent(row.draft.authorAs)}/p/${row.doc_id}` : `/u/${encodeURIComponent(row.owner.username)}/p/${row.doc_id}` : undefined }));
  return <UploadContext.Provider value={{ enabled, loading, tasks, error, queue, command, selectFile }}>{children}</UploadContext.Provider>;
}

export function useUploads() { return useContext(UploadContext); }
export function UploadsScreen() {
  const queue = useUploads();
  if (!queue || queue.loading) return <div className="p-6 text-sm text-muted-foreground">Restoring uploads…</div>;
  if (!queue.enabled) return <div className="p-6 text-sm text-muted-foreground">Background uploads aren’t available on this server yet. You can still upload and post from the composer.</div>;
  return <>{queue.error && <p role="alert" className="m-4 rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm text-danger">{queue.error}</p>}<UploadCenter tasks={queue.tasks} onCommand={queue.command} onSelectFile={queue.selectFile} composePath="/feed?compose=1" /></>;
}
export function UploadDock() {
  const queue = useUploads();
  return queue?.enabled ? <UploadIndicator tasks={queue.tasks} /> : null;
}
