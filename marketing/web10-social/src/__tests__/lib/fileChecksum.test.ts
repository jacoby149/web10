import { describe, expect, it, vi } from 'vitest';
import { fileChecksum } from '@/lib/fileChecksum';
import { resumableTransfer } from '@/lib/resumableTransfer';
import type { UploadApi } from '@/data/uploadApi';

describe('original-file content identity', () => {
  it('hashes a multi-part movie with bounded slices rather than a whole-file ArrayBuffer', async () => {
    const bytes = new Uint8Array(17 * 1024 * 1024).fill(17);
    const blob = new Blob([bytes]);
    const slice = blob.slice.bind(blob);
    const sizes: number[] = [];
    blob.slice = (start, end, type) => { sizes.push((end || blob.size) - (start || 0)); return slice(start, end, type); };
    blob.arrayBuffer = async () => { throw new Error('whole-file reads forbidden'); };
    const result = await fileChecksum(blob);
    // Independently generated with Python hashlib over the same fixture bytes.
    expect(result).toBe('b20aefcb39bd0176b29b355a54887add3d5ac6c41dc2b1a7cc6e673f244b5f42');
    expect(Math.max(...sizes)).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(sizes).toHaveLength(3);
  });

  it('aborts hashing an invalidated attempt before reading source bytes', async () => {
    const file = new Blob(['film']);
    await expect(fileChecksum(file, () => { throw new DOMException('stale', 'AbortError'); })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects different bytes despite identical filename, size, type and date before native start', async () => {
    const original = new File(['film'], 'movie.mp4', { type: 'video/mp4', lastModified: 123 });
    const other = new File(['fake'], 'movie.mp4', { type: 'video/mp4', lastModified: 123 });
    const start = vi.fn();
    const api = { check: vi.fn(), start } as unknown as UploadApi;
    const transfer = resumableTransfer(api, { session_id: 'a'.repeat(32), service: 'media', filename: original.name, mime_type: original.type, size_bytes: original.size, checksum_sha256: await fileChecksum(original) }, vi.fn());
    await expect(transfer.run(other)).rejects.toThrow(/different content/);
    expect(start).not.toHaveBeenCalled();
    transfer.stop();
  });
});
