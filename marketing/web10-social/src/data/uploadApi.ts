import { decodeJwt, readTokenCookie, type V3Document } from 'web10-npm';
import { API_ORIGIN } from '@/lib/origins';
import { uploadAttempt } from '@/lib/uploadSession';

export interface UploadIdentity { node: string; provider: string; username: string }
export const identityKey = (owner: UploadIdentity) => JSON.stringify([owner.node, owner.provider, owner.username]);

export function currentUploadIdentity(node = API_ORIGIN, readToken = readTokenCookie): UploadIdentity | null {
  const token = readToken();
  let decoded;
  try { decoded = token ? decodeJwt(token) : null; } catch { return null; }
  return decoded?.username && decoded.username !== 'anon' && decoded.provider
    ? { node, provider: decoded.provider, username: decoded.username } : null;
}

export interface UploadSessionView {
  session_id: string;
  phase: 'reserved' | 'uploading' | 'completing' | 'completed' | 'aborting' | 'aborted' | 'failed';
  object_key: string;
  upload_id: string | null;
  expires_at: number;
  part_size: number;
  uploaded_bytes: number;
  parts: { PartNumber: number; Size: number; ETag: string }[];
  checksum_sha256: string;
  failure_code?: string;
}
export interface FileUploadIntent {
  session_id: string;
  service: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
}
export interface DeferredView {
  operation_id: string; phase: 'waiting' | 'creating' | 'done' | 'cancelled' | 'blocked' | 'failed';
  doc_id: string | null; error: string | null; expires_at: string;
  admitted: boolean; media_dependencies: string[];
}
export interface DeferredIntent {
  service: string; body: Record<string, unknown>; groups: string[]; author_as?: string;
  ref_value?: string; ad_preference?: { mode: string; target?: string };
}
export class UploadRequestError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'UploadRequestError'; }
}

export function createUploadApi(owner: UploadIdentity, attempt: ReturnType<typeof uploadAttempt>, readToken = readTokenCookie, configuredNode = API_ORIGIN) {
  const credential = () => {
    attempt.check();
    if (owner.node !== configuredNode) throw new UploadRequestError(401, 'Upload belongs to a different configured node.');
    const token = readToken();
    const current = currentUploadIdentity(configuredNode, () => token);
    if (!current || identityKey(current) !== identityKey(owner)) throw new UploadRequestError(401, 'The account changed. Return to the original account to continue this upload.');
    return token;
  };
  const check = () => { credential(); };
  async function call<T>(operation: string, body: Record<string, unknown>, family = 'media/uploads'): Promise<T> {
    const token = credential();
    console.log('[upload] request started', { operation });
    const response = await fetch(`${configuredNode}/v3/${family}/${operation}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, token }), signal: attempt.signal,
    });
    check();
    const payload = await response.json();
    check();
    console.log('[upload] request completed', { operation, status: response.status });
    if (!response.ok) throw new UploadRequestError(response.status, payload.detail || 'Upload request failed. Your saved progress has not been discarded.');
    return payload as T;
  }
  return {
    check,
    start: (intent: FileUploadIntent) => call<UploadSessionView>('start', { ...intent }),
    status: (session_id: string, service: string) => call<UploadSessionView>('status', { session_id, service }),
    sign: (session_id: string, service: string, part_number: number, checksum_sha256: string) => call<{ url: string; method: 'PUT'; headers: Record<string, string>; expires: number }>('sign-part', { session_id, service, part_number, checksum_sha256 }),
    complete: (session_id: string, service: string) => call<UploadSessionView>('complete', { session_id, service }),
    abort: (session_id: string, service: string) => call<UploadSessionView>('abort', { session_id, service }),
    confirm: (session_id: string, service: string, metadata: { width: number; height: number; duration_seconds: number; alt_text?: string }) => call<V3Document>('confirm', { session_id, service, ...metadata }),
    retryTranscode: (session_id: string, service: string) => call<{ status: string }>('retry-transcode', { session_id, service }),
    defer: (operation_id: string, intent: DeferredIntent, media_dependencies: string[]) => call<DeferredView>('create', { operation_id, service: intent.service, intent, media_dependencies }, 'deferred'),
    validate: (operation_id: string, intent: DeferredIntent) => call<{ allowed: boolean }>('validate', { operation_id, service: intent.service, intent }, 'deferred'),
    job: (operation_id: string, service = 'posts') => call<DeferredView>('status', { operation_id, service }, 'deferred'),
    cancelJob: (operation_id: string, service = 'posts') => call<DeferredView>('cancel', { operation_id, service }, 'deferred'),
    retryJob: (operation_id: string, service = 'posts') => call<DeferredView>('retry', { operation_id, service }, 'deferred'),
  };
}
export type UploadApi = ReturnType<typeof createUploadApi>;
