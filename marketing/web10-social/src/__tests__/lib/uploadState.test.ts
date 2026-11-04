import { describe, expect, it } from 'vitest';
import { formatBytes, matchesFile, remainingTime, uploadPercent, uploadReducer, type UploadAction, type UploadPhase, type UploadTask } from '@/components/Uploads/uploadState';

function task(phase: UploadPhase = 'uploading'): UploadTask {
  return { id: 'film', title: 'Nosferatu', description: 'Full film', authorLabel: 'Century Club Movies', audienceLabel: 'Public', file: { name: 'film.mp4', size: 1000, type: 'video/mp4', lastModified: 123 }, uploadedBytes: 420, remainingSeconds: 240, phase };
}

describe('upload UI state contract (no transport)', () => {
  it('pauses without losing progress and ignores late transfer events', () => {
    const paused = uploadReducer(task(), { type: 'pause' });
    expect(paused).toMatchObject({ phase: 'paused', uploadedBytes: 420, remainingSeconds: undefined });
    expect(uploadReducer(paused, { type: 'progress', uploadedBytes: 900 })).toBe(paused);
    expect(uploadReducer(paused, { type: 'uploaded' })).toBe(paused);
    expect(uploadReducer(paused, { type: 'resume' })).toMatchObject({ phase: 'uploading', uploadedBytes: 420 });
  });

  it('only reconnects interrupted uploads, not ones the user paused', () => {
    expect(uploadReducer(task(), { type: 'offline' })).toMatchObject({ phase: 'offline', uploadedBytes: 420, remainingSeconds: undefined });
    const paused = task('paused');
    expect(uploadReducer(paused, { type: 'offline' })).toBe(paused);
  });

  it('clamps acknowledged bytes, never moves backwards, and discards invalid estimates', () => {
    expect(uploadReducer(task(), { type: 'progress', uploadedBytes: 100 })).toMatchObject({ uploadedBytes: 420 });
    expect(uploadReducer(task(), { type: 'progress', uploadedBytes: 1500, remainingSeconds: Infinity })).toMatchObject({ uploadedBytes: 1000, remainingSeconds: undefined });
    const original = task();
    expect(uploadReducer(original, { type: 'progress', uploadedBytes: NaN })).toBe(original);
    expect(uploadReducer(original, { type: 'progress', uploadedBytes: Infinity })).toBe(original);
  });

  it('restores the same draft and progress after file access is lost', () => {
    const original = task();
    const restored = uploadReducer(original, { type: 'file-lost' });
    expect(restored).toMatchObject({ phase: 'needs-file', title: original.title, description: original.description, authorLabel: original.authorLabel, audienceLabel: original.audienceLabel, uploadedBytes: 420 });
    const wrong = uploadReducer(restored, { type: 'select-file', file: { ...original.file, size: 999 } });
    expect(wrong.phase).toBe('needs-file');
    expect(wrong.error).toMatch(/doesn’t match/);
    expect(wrong.uploadedBytes).toBe(420);
    expect(uploadReducer(wrong, { type: 'select-file', file: original.file })).toMatchObject({ phase: 'uploading', uploadedBytes: 420, error: undefined });
  });

  it.each(['name', 'size', 'type', 'lastModified'] as const)('file hint mismatch: %s', field => {
    const hint = task().file;
    const other = { ...hint, [field]: typeof hint[field] === 'number' ? 0 : 'different' };
    expect(matchesFile(hint, other)).toBe(false);
  });

  it('retries processing and publication independently, without uploading again', () => {
    const uploaded = uploadReducer(task(), { type: 'uploaded' });
    expect(uploaded).toMatchObject({ phase: 'processing', uploadedBytes: 1000 });
    const failed = uploadReducer(uploaded, { type: 'processing-failed', message: 'Worker timeout' });
    expect(failed.error).toBe('Worker timeout');
    const retry = uploadReducer(failed, { type: 'retry-processing' });
    expect(retry).toMatchObject({ phase: 'processing', error: undefined, uploadedBytes: 1000 });
    const publishing = uploadReducer(retry, { type: 'processed' });
    expect(publishing.phase).toBe('publishing');
    const failedPublish = uploadReducer(publishing, { type: 'publish-failed', message: 'Check publication' });
    expect(uploadReducer(failedPublish, { type: 'retry-processing' })).toBe(failedPublish);
    const retryPublish = uploadReducer(failedPublish, { type: 'retry-publish' });
    expect(retryPublish).toMatchObject({ phase: 'publishing', error: undefined, uploadedBytes: 1000 });
    expect(uploadReducer(retryPublish, { type: 'published', postPath: '/u/creator/p/123' })).toMatchObject({ phase: 'published', postPath: '/u/creator/p/123' });
  });

  it.each(['uploading', 'paused', 'offline', 'needs-file', 'processing', 'processing-failed'] as UploadPhase[])('cancels %s and ignores every late success/progress event', phase => {
    const cancelled = uploadReducer(task(phase), { type: 'cancel' });
    expect(cancelled.phase).toBe('cancelled');
    const events: UploadAction[] = [{ type: 'resume' }, { type: 'progress', uploadedBytes: 1000 }, { type: 'uploaded' }, { type: 'processed' }, { type: 'published' }, { type: 'retry-processing' }];
    events.forEach(event => expect(uploadReducer(cancelled, event)).toBe(cancelled));
  });

  it.each(['publishing', 'publish-failed', 'published'] as UploadPhase[])('does not promise to cancel an already-started publication (%s)', phase => {
    const current = task(phase);
    expect(uploadReducer(current, { type: 'cancel' })).toBe(current);
  });

  it('does not publish directly from upload or processing', () => {
    const current = task();
    expect(uploadReducer(current, { type: 'published' })).toBe(current);
    const processing = task('processing');
    expect(uploadReducer(processing, { type: 'published' })).toBe(processing);
  });

  it('formats bytes and only evidence-based estimates', () => {
    expect(formatBytes(514619769)).toBe('491 MiB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GiB');
    expect(formatBytes(1024)).toBe('1 KiB');
    expect(remainingTime()).toBeUndefined();
    expect(remainingTime(Infinity)).toBeUndefined();
    expect(remainingTime(-1)).toBeUndefined();
    expect(remainingTime(30)).toBe('Less than a minute remaining');
    expect(remainingTime(240)).toBe('About 4 minutes remaining');
    expect(remainingTime(7200)).toBe('About 2 hours remaining');
    expect(uploadPercent(task())).toBe(42);
    expect(uploadPercent({ ...task(), file: { ...task().file, size: 0 } })).toBe(0);
  });
});
