// ── imports.ts — the "port your YouTube" pipeline (KB: social/import.md) ─────
// The node-side import: create a job + presigned upload URLs (one per export
// part), upload the parts straight to MinIO, start, then poll the status. The
// job row is the status surface — it carries `progress` (0-100), the record
// counts, and a live `message`, so the UI renders a real "x% imported" bar.
//
// The v3 endpoints are POST-with-token-in-body (the node's v3 idiom), so this
// module fetches them directly with the token cookie — the same seam
// `groups.ts` uses for the public GET endpoints. The presigned upload itself
// is a raw POST to MinIO (no token — the S3 key is the boundary).
//
// Target group: the import can write into a group the user OWNS (a "page" —
// the channel becomes the group's face, the group-as-profile model) instead of
// the user's personal profile. The node gates this (403 if not the owner).

import { getV3Client, readTokenCookie, extractDetail, Web10Error } from './v3';
import { API_ORIGIN } from '../lib/origins';

const LOG = (...args: unknown[]) => console.log('[imports]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[imports]', ...args);

export type ImportPlatform = 'youtube';

export interface ImportPart {
  filename: string;
  size_bytes?: number;
}

export interface ImportUpload {
  part_index: number;
  object_key: string;
  upload_url: string;
  fields: Record<string, string>;
}

export interface ImportJob {
  job_id: string;
  user_key: string;
  platform: string;
  phase: 'pending' | 'queued' | 'processing' | 'complete' | 'error';
  object_keys: string[];
  target_group_id: string;
  total_records: number;
  written_records: number;
  skipped_records: number;
  /** 0-100 — the "x% imported" percentage (100 = complete). */
  progress: number;
  errors: string[];
  message: string;
  created_at: string;
  updated_at: string;
}

export interface ImportCreateResponse {
  job_id: string;
  platform: string;
  job: ImportJob;
  uploads: ImportUpload[];
}

async function v3Post<T>(action: string, body: Record<string, unknown>): Promise<T> {
  // State-first, cookie fallback — the same precedence the SDK's v3Post uses
  // (D45: state.token is re-synced on session transitions; the cookie is the
  // session's source of truth for the fallback).
  const token = getV3Client().state.token ?? readTokenCookie();
  if (!token) {
    throw new Web10Error('Not signed in', 401);
  }
  LOG('POST /v3/' + action, JSON.stringify({ ...body, token: '***' }));
  const res = await fetch(`${API_ORIGIN}/v3/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token }),
  });
  if (!res.ok) {
    const detail = await res.text().then(extractDetail).catch(() => null);
    LOG_ERR('POST /v3/' + action, 'failed', res.status, detail ?? '');
    throw new Web10Error(detail ?? `Import request failed: ${res.status}`, res.status);
  }
  const data = (await res.json()) as T;
  LOG('POST /v3/' + action, 'ok');
  return data;
}

/** Create an import job. Returns the job + one presigned upload URL per part. */
export async function importCreate(
  platform: ImportPlatform,
  parts: ImportPart[],
  targetGroupId?: string,
): Promise<ImportCreateResponse> {
  const body: Record<string, unknown> = { platform, parts };
  if (targetGroupId) body.target_group_id = targetGroupId;
  return v3Post<ImportCreateResponse>('imports', body);
}

/** Upload one export part straight to MinIO via its presigned POST. */
export async function uploadImportPart(upload: ImportUpload, file: File): Promise<void> {
  const form = new FormData();
  Object.entries(upload.fields || {}).forEach(([k, v]) => form.append(k, String(v)));
  form.append('file', file);
  LOG('uploading part', upload.part_index, file.name);
  const res = await fetch(upload.upload_url, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`Upload failed for ${file.name} (${res.status})`);
  }
  LOG('uploaded part', upload.part_index);
}

/** Verify every part landed, then queue the job for the worker. */
export async function importStart(jobId: string): Promise<{ job_id: string; status: string }> {
  return v3Post<{ job_id: string; status: string }>('imports/start', { job_id: jobId });
}

/** Poll the job row (the status surface the UI renders). */
export async function importStatus(jobId: string): Promise<{ job_id: string; job: ImportJob }> {
  return v3Post<{ job_id: string; job: ImportJob }>('imports/status', { job_id: jobId });
}

/**
 * Create the job + upload every part + start it. Returns the job_id to poll.
 * The caller owns the polling (the UI renders the progress as it advances).
 */
export async function startImport(
  platform: ImportPlatform,
  files: File[],
  targetGroupId?: string,
): Promise<string> {
  const parts: ImportPart[] = files.map((f) => ({ filename: f.name, size_bytes: f.size }));
  const created = await importCreate(platform, parts, targetGroupId);
  for (let i = 0; i < created.uploads.length; i++) {
    await uploadImportPart(created.uploads[i], files[i]);
  }
  await importStart(created.job_id);
  return created.job_id;
}
