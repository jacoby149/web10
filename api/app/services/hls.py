"""HLS streaming helpers (D44 — the video spine).

The auth model is bifurcated (`knowledge/knowledge-base/web10-v3/media/
minio-auth-bifurcated.md`): everything in MinIO uses presigned URLs EXCEPT
video HLS, where 100+ segments over minutes can't be presigned
individually. Instead:

1. A READ of a transcoded document mints a short-lived JWT ("sig") bound to
   (reader, doc_id, hls prefix). The read injects `transcoding_settings.
   manifest_url` carrying that sig.
2. The manifest endpoint verifies the sig AND re-checks access (author or
   group membership) — this is the permission gate, re-run every 10 minutes
   when the sig expires and the player re-fetches the manifest.
3. Variant manifests and segments carry the same sig. Segment serving is
   sig-only (no DB hit — JWT validation is fast; the prefix rides in the
   sig, so a sig for doc X can only ever address X's HLS tree).
"""

import logging
import re
import time

import jwt

import app.settings as settings
from app.v3.services import clickhouse as ch

logger = logging.getLogger("web10-hls")

# Segment/variant params are path components under the sig's prefix —
# anything with a slash or a dot-dot is a traversal attempt, not a segment.
_VARIANT_RE = re.compile(r"^\d+p$")
_SEG_RE = re.compile(r"^seg\d+\.ts$")


def hls_prefix(video_object_key: str) -> str:
    """The MinIO prefix the worker writes HLS output under.

    The raw file is `{user}/{uuid}/{filename}`; its HLS tree lives at
    `{user}/{uuid}/hls/...` (rendition dirs + thumbnails).
    """
    base = video_object_key.rsplit("/", 1)[0]
    if "/" not in video_object_key:
        base = ""
    return f"{base}/hls" if base else "hls"


def mint_sig(username: str, doc_id: str, prefix: str) -> str:
    """Mint the 10-minute stream token bound to (reader, doc, hls prefix)."""
    now = int(time.time())
    return jwt.encode(
        {"username": username, "doc_id": doc_id, "prefix": prefix, "iat": now, "exp": now + settings.HLS_SIG_TTL},
        settings.PRIVATE_KEY,
        algorithm=settings.ALGORITHM,
    )


def verify_sig(sig: str, doc_id: str) -> dict:
    """Verify the stream token. Returns the payload on success.

    Raises ValueError on any failure (bad signature, expired, doc mismatch)
    — the caller maps that to a 403.
    """
    if not sig:
        raise ValueError("missing sig")
    try:
        payload = jwt.decode(sig, settings.PRIVATE_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError as e:
        raise ValueError(f"invalid or expired stream token: {e}")
    if payload.get("doc_id") != doc_id:
        raise ValueError("stream token does not match this document")
    if not payload.get("username") or not payload.get("prefix"):
        raise ValueError("malformed stream token")
    return payload


def can_view_doc(doc_id: str, username: str) -> dict | None:
    """The document if `username` may view it — author, or a member of any
    group the document belongs to. None otherwise (the caller 403s).

    This is the re-check the sig expiry buys: every manifest (re)fetch
    re-runs group membership, so a revoked membership stops the stream
    within one sig TTL.
    """
    doc = ch.get_document_any_author(doc_id)
    if not doc:
        return None
    if doc["author_key"] == username:
        return doc
    for group_id in ch.get_doc_groups(doc_id):
        if ch.is_group_member(group_id, username):
            return doc
    return None


def variant_tag(variant: dict) -> str:
    """`360p` from a variant's height — the rendition dir name."""
    return f"{variant['height']}p"


def synthesize_master_manifest(doc_id: str, sig: str, variants: list[dict]) -> str:
    """The master manifest is a VIEW over `transcoding_settings.variants` —
    the document is the source of truth (transcoding-foundation.md)."""
    lines = ["#EXTM3U"]
    for v in variants:
        tag = variant_tag(v)
        lines.append(
            f"#EXT-X-STREAM-INF:BANDWIDTH={int(v['bitrate_kbps']) * 1000},"
            f"RESOLUTION={v['width']}x{v['height']},CODECS='avc1.4d401e,mp4a.40.2'"
        )
        lines.append(f"/v3/media/hls/variant?doc_id={doc_id}&variant={tag}&sig={sig}")
    return "\n".join(lines) + "\n"


def rewrite_variant_manifest(doc_id: str, variant: str, sig: str, manifest_text: str) -> str:
    """Rewrite a variant manifest's bare segment names into signed segment
    URLs. `#`-lines pass through; every other non-empty line is a segment."""
    out = []
    for line in manifest_text.splitlines():
        if line.startswith("#"):
            out.append(line)
        elif line.strip():
            out.append(f"/v3/media/hls/segment?doc_id={doc_id}&variant={variant}&seg={line.strip()}&sig={sig}")
    return "\n".join(out) + "\n"


def segment_key(prefix: str, variant: str, seg: str) -> str:
    """Build + validate the MinIO key for a segment request.

    Raises ValueError on traversal-shaped input — the sig's prefix is the
    only addressable tree, and variant/seg are strictly `360p` / `seg001.ts`.
    """
    if not _VARIANT_RE.match(variant):
        raise ValueError(f"bad variant: {variant!r}")
    if not _SEG_RE.match(seg):
        raise ValueError(f"bad segment: {seg!r}")
    return f"{prefix}/{variant}/{seg}"