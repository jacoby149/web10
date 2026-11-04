import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import type { FileUploadIntent, UploadApi, UploadSessionView } from '@/data/uploadApi';
import { fileChecksum, partChecksum } from './fileChecksum';

/** Uppy is the byte engine only. The server owns completion and verification. */
export function resumableTransfer(api: UploadApi, intent: FileUploadIntent, onProgress: (confirmed: number, transferred: number) => void) {
  let uppy: Uppy | null = null;
  let stopped = false;
  let preserveRemote = true;
  const check = () => { api.check(); if (stopped) throw new DOMException('Upload stopped', 'AbortError'); };
  return {
    async run(file: File): Promise<UploadSessionView> {
      check();
      if (file.size !== intent.size_bytes || await fileChecksum(file, check) !== intent.checksum_sha256) {
        throw new Error('That file has different content. Select the original video; your uploaded parts are still saved.');
      }
      check();
      let session = await api.start(intent);
      if (session.phase === 'completing') session = await api.complete(intent.session_id, intent.service);
      if (session.phase === 'completed') { onProgress(file.size, file.size); return session; }
      if (session.phase !== 'uploading' || !session.upload_id) throw new Error('This upload is no longer resumable. Check its status before starting over.');
      const confirmed = new Map<number, number>();
      const saved = () => [...confirmed.values()].reduce((sum, bytes) => sum + bytes, 0);
      uppy = new Uppy({ autoProceed: false, restrictions: { maxNumberOfFiles: 1 }, logger: {
        debug() {}, warn() { console.warn('[upload] transfer warning'); }, error() { console.error('[upload] transfer error'); },
      } });
      uppy.use(AwsS3, {
        shouldUseMultipart: true, getChunkSize: () => session.part_size, limit: 2,
        retryDelays: [0, 1000, 3000, 5000], allowedMetaFields: false,
        createMultipartUpload: async () => { check(); return { key: session.object_key, uploadId: session.upload_id! }; },
        listParts: async () => {
          check();
          const latest = await api.status(intent.session_id, intent.service);
          if (latest.phase !== 'uploading') throw new Error('Upload state changed. Resume again to recover its completed result.');
          for (const part of latest.parts) confirmed.set(part.PartNumber, part.Size);
          onProgress(saved(), saved());
          return latest.parts;
        },
        signPart: async (_file, options) => {
          check();
          const checksum = await partChecksum(options.body);
          check();
          return api.sign(intent.session_id, intent.service, options.partNumber, checksum);
        },
        completeMultipartUpload: async () => {
          check();
          session = await api.complete(intent.session_id, intent.service);
          check();
          return {};
        },
        abortMultipartUpload: async () => { if (!preserveRemote) await api.abort(intent.session_id, intent.service); },
      });
      const id = uppy.addFile({ name: file.name, type: file.type, data: file });
      // Plugin 5.x consumes this state, although core's file type does not
      // declare the plugin-specific member. Preserve its normal file fields.
      const restoredFile = { ...uppy.getFile(id), s3Multipart: { key: session.object_key, uploadId: session.upload_id } };
      uppy.setFileState(id, restoredFile);
      uppy.on('s3-multipart:part-uploaded', (_file, part) => {
        if (stopped) return;
        try { api.check(); } catch { return; }
        confirmed.set(part.PartNumber, Math.min(session.part_size, file.size - (part.PartNumber - 1) * session.part_size));
        onProgress(saved(), saved());
      });
      uppy.on('upload-progress', (_file, progress) => {
        if (stopped) return;
        try { api.check(); } catch { return; }
        onProgress(saved(), progress.bytesUploaded || saved());
      });
      await uppy.upload();
      check();
      session = await api.status(intent.session_id, intent.service);
      if (session.phase === 'completing') session = await api.complete(intent.session_id, intent.service);
      if (session.phase !== 'completed') throw new Error('Upload interrupted. Resume to recover storage-confirmed progress.');
      onProgress(file.size, file.size);
      return session;
    },
    stop() {
      stopped = true;
      // destroy() emits cancel-all; suppress its remote abort hook on pause,
      // navigation and account changes. Explicit Cancel calls the API separately.
      preserveRemote = true;
      uppy?.pauseAll();
      uppy?.destroy();
      uppy = null;
    },
  };
}
