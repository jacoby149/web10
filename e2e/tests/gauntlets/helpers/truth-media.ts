import { expect, type APIRequestContext } from '@playwright/test';
import { API_BASE, SOCIAL_ORIGIN } from './setup';

/**
 * The media truth primitive (gauntlets/media.md, the truth rule).
 *
 * Media is the heaviest surface: an upload (the presigned MinIO path), a
 * transcode (the in-process ffmpeg worker → HLS renditions + thumbnails), and a
 * playback (hls.js on desktop). The media doc is the status surface — its body
 * carries `transcoding_settings` (status: processing → done|failed, the
 * variants, the read-minted `manifest_url`). The load-bearing assertion is the
 * transcode-truth: a doc that stays `processing` forever, or reaches `done`
 * with no variants, is a transcode bug the UI-only assertion (the player
 * renders) would miss — the player might render the raw fallback while the
 * transcode is broken.
 *
 * The shape (read DB, reduce, compare) is the same as truth.ts / truth-posts.ts;
 * the fields are the media doc's: the transcode status, whether the variants
 * exist, and whether the read minted a `manifest_url`.
 */

/** The media truth for a media doc (the DB, not the UI). */
export interface MediaTruth {
  /** The transcode status: 'processing' | 'done' | 'failed' ('' when absent). */
  status: string;
  /** Whether the doc carries HLS renditions (a `done` doc must). */
  hasVariants: boolean;
  /** The number of HLS renditions (0 when none). */
  variantCount: number;
  /** Whether the read minted a `manifest_url` for the reader. */
  hasManifestUrl: boolean;
  /** The read-minted `manifest_url` (path-only, the client prepends the API origin; '' when absent). */
  manifestUrl: string;
}

/**
 * Read the backend truth for a media doc. The source of truth, not the UI: the
 * media doc by doc_id (the same read path the app polls — `POST /v3/read`). The
 * read mints a fresh `manifest_url` for the reader (the 10-min JWT sig), so
 * `hasManifestUrl` is true for a transcoded doc the reader can access.
 *
 * The service is `media_metadata` — the collection the social app's
 * `uploadMedia` confirms into (`/v3/media/confirm`), which is also the
 * collection the feed's media-ref resolution queries. A doc created via
 * `/v3/create` with `service: 'media'` lands in a different collection the feed
 * never resolves, so the truth read keys off the app's real collection.
 */
export async function mediaTruth(
  request: APIRequestContext,
  token: string,
  mediaDocId: string,
): Promise<MediaTruth> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'media_metadata', doc_id: mediaDocId }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) return { status: '', hasVariants: false, variantCount: 0, hasManifestUrl: false, manifestUrl: '' };
  const doc = (await res.json()) as { body?: { transcoding_settings?: Record<string, unknown> } };
  const ts = doc.body?.transcoding_settings ?? {};
  const variants = Array.isArray(ts.variants) ? (ts.variants as unknown[]) : [];
  const manifestUrl = typeof ts.manifest_url === 'string' ? ts.manifest_url : '';
  return {
    status: typeof ts.status === 'string' ? ts.status : '',
    hasVariants: variants.length > 0,
    variantCount: variants.length,
    hasManifestUrl: manifestUrl !== '',
    manifestUrl,
  };
}

/**
 * The API floor's transcode check (the diagnostic anchor): poll the media doc's
 * `transcoding_settings.status` until it reaches `done` (or `failed` → throw),
 * then assert the variants exist. The transcode is a real ffmpeg run — the
 * slowest step in the suite — so the default timeout is 120s. A doc that
 * reaches `done` with no variants, or that times out still `processing`, is a
 * transcode bug the UI-only assertion would miss.
 */
export async function assertMediaTranscoded(
  request: APIRequestContext,
  token: string,
  mediaDocId: string,
  timeoutMs = 120_000,
): Promise<MediaTruth> {
  const deadline = Date.now() + timeoutMs;
  let last: MediaTruth = { status: '', hasVariants: false, variantCount: 0, hasManifestUrl: false, manifestUrl: '' };
  for (;;) {
    last = await mediaTruth(request, token, mediaDocId);
    if (last.status === 'failed') {
      throw new Error(`transcode failed for media doc ${mediaDocId}: ${JSON.stringify(last)}`);
    }
    if (last.status === 'done') break;
    if (Date.now() >= deadline) {
      throw new Error(`transcode did not finish within ${timeoutMs}ms (last status: ${last.status || 'absent'})`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // A `done` doc must carry HLS renditions — a done-with-no-variants is the
  // transcode bug the player-render assertion would miss.
  expect(last.hasVariants, `transcode reached 'done' but the doc has no variants`).toBe(true);
  return last;
}
