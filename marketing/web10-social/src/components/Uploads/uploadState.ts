import type { Visibility } from '@/data/types';

/** Composer handoff. Files are in-memory references, never recovery records. */
export interface MediaPostDraft {
  title: string;
  text: string;
  visibility: Visibility;
  authorAs?: string;
  authorLabel: string;
  groups?: string[];
  pinnedAdId?: string;
  markAsMusic: boolean;
  media: {
    file: File;
    width: number;
    height: number;
    duration: number;
    altText: string;
    edited?: boolean;
    albumArt?: File;
    /** The creator's chosen video thumbnail (a captured frame or their own
     *  image). The multipart transport does not carry it yet — a draft with
     *  a pick takes the standard upload path instead of the queue, so the
     *  pick is never silently dropped. */
    thumbnail?: File;
  }[];
}

export type UploadPhase = 'preparing' | 'uploading' | 'paused' | 'offline' | 'needs-file' | 'verifying'
  | 'processing' | 'processing-failed' | 'publishing' | 'publish-failed'
  | 'published' | 'cancelled';

export interface UploadFileHint {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

/** Transport-independent view model. Bytes represent acknowledged parts only. */
export interface UploadTask {
  id: string;
  title: string;
  description: string;
  authorLabel: string;
  audienceLabel: string;
  file: UploadFileHint;
  durationSeconds?: number;
  uploadedBytes: number;
  transferredBytes?: number;
  phase: UploadPhase;
  remainingSeconds?: number;
  error?: string;
  postPath?: string;
}

export type UploadAction =
  | { type: 'pause' | 'resume' | 'offline' | 'file-lost' | 'uploaded' | 'processed'
    | 'retry-processing' | 'retry-publish' | 'cancel' }
  | { type: 'progress'; uploadedBytes: number; remainingSeconds?: number }
  | { type: 'select-file'; file: UploadFileHint }
  | { type: 'processing-failed' | 'publish-failed'; message: string }
  | { type: 'published'; postPath?: string };

export const transferPhases: UploadPhase[] = ['uploading', 'paused', 'offline', 'needs-file'];
export const isFinished = (task: UploadTask) => task.phase === 'published' || task.phase === 'cancelled';

export function fileHint(file: File): UploadFileHint {
  return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified };
}

/** Hint check for the UI only. A real adapter must additionally verify content. */
export function matchesFile(expected: UploadFileHint, actual: UploadFileHint) {
  return expected.name === actual.name && expected.size === actual.size
    && expected.type === actual.type && expected.lastModified === actual.lastModified;
}

export function uploadReducer(task: UploadTask, action: UploadAction): UploadTask {
  const move = (phase: UploadPhase): UploadTask => ({ ...task, phase, error: undefined, remainingSeconds: undefined });
  switch (action.type) {
    case 'progress':
      if (task.phase !== 'uploading' || !Number.isFinite(action.uploadedBytes)) return task;
      return {
        ...task,
        uploadedBytes: Math.min(task.file.size, Math.max(task.uploadedBytes, action.uploadedBytes)),
        remainingSeconds: Number.isFinite(action.remainingSeconds) && action.remainingSeconds! > 0 ? action.remainingSeconds : undefined,
      };
    case 'pause':
      return task.phase === 'uploading' || task.phase === 'offline' ? move('paused') : task;
    case 'resume':
      return task.phase === 'paused' || task.phase === 'offline' ? move('uploading') : task;
    case 'offline':
      return task.phase === 'uploading' ? move('offline') : task;
    case 'file-lost':
      return transferPhases.includes(task.phase) ? move('needs-file') : task;
    case 'select-file':
      if (task.phase !== 'needs-file') return task;
      return matchesFile(task.file, action.file)
        ? move('uploading')
        : { ...task, error: 'That file doesn’t match. Select the original file with the same name, size and modification date.' };
    case 'uploaded':
      return task.phase === 'uploading' ? { ...move('processing'), uploadedBytes: task.file.size } : task;
    case 'processing-failed':
      return task.phase === 'processing' ? { ...move('processing-failed'), error: action.message } : task;
    case 'retry-processing':
      return task.phase === 'processing-failed' ? move('processing') : task;
    case 'processed':
      return task.phase === 'processing' ? move('publishing') : task;
    case 'publish-failed':
      return task.phase === 'publishing' ? { ...move('publish-failed'), error: action.message } : task;
    case 'retry-publish':
      return task.phase === 'publish-failed' ? move('publishing') : task;
    case 'published':
      return task.phase === 'publishing' ? { ...move('published'), postPath: action.postPath } : task;
    case 'cancel':
      // Once publication starts, cancellation cannot promise to undo a write.
      return transferPhases.includes(task.phase) || task.phase === 'preparing' || task.phase === 'verifying' || task.phase === 'processing' || task.phase === 'processing-failed'
        ? move('cancelled') : task;
  }
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MiB`;
  return `${Math.round(bytes / 1024)} KiB`;
}

export function uploadPercent(task: UploadTask) {
  const bytes = task.phase === 'uploading' && Number.isFinite(task.transferredBytes) ? Math.max(task.uploadedBytes, task.transferredBytes!) : task.uploadedBytes;
  return task.file.size > 0 ? Math.min(100, Math.max(0, Math.floor(bytes / task.file.size * 100))) : 0;
}

export function remainingTime(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return undefined;
  if (seconds < 60) return 'Less than a minute remaining';
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `About ${minutes} minutes remaining` : `About ${Math.ceil(minutes / 60)} hours remaining`;
}
