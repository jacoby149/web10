"""Update check — foundation: the node's own version identity.

A deployed node must know which version it runs. The version is baked into
the image at build time: ``api/Dockerfile`` (repo-root context, the
marketing-ui precedent) writes ``/web10/VERSION`` from the top line of
``knowledge-base/changelogs/CHANGELOG.md`` — the project's release version,
the same number ``cd.yml``/``deploy.yml`` bake into the status pill. That
keeps the version correct on Portainer's GitOps rebuilds, which export no
env vars (the same "stuck on unknown" hole marketing-ui's /status page used
to sit in).

Resolution order (``node_version``):

    WEB10_VERSION env  →  /web10/VERSION  →  "unknown"

The last case is honest, not broken: the local ``docker-compose.yml`` and
the e2e stack mount the ``api/`` source over ``/web10``, which shadows the
baked file — a code-mounted dev node runs whatever the checkout is, and it
says so.

The upstream-comparison half: the next version is the top line of the
changelog on ``UPSTREAM_REPO`` @ ``UPSTREAM_REF`` (default
jacoby149/web10 @ main), read over a pinned TLS connection to
raw.githubusercontent.com — public-DNS-only, no redirects, bounded
first-line transfer, no credentials. GitHub *releases* are NOT the source:
they stopped at v2.0.0 while the project is on 5.x, and the GitOps deploy
model tracks the ref — the changelog on the ref is what a redeploy brings.
Detection, not auto-update; per-worker cache (1 h success / 5 min
failure), ``?force=true`` bypass; a GitHub outage degrades to
"unavailable", never a 500. The full contract is documented in
``knowledge-base/web10-v3/setup/update-check.md``.
"""

import ipaddress
import logging
import re
import socket
import ssl
import threading
import time
from pathlib import Path
from urllib.parse import quote

import urllib3

from app.settings import (
    UPDATE_CHECK_FAIL_TTL_SECONDS,
    UPDATE_CHECK_TIMEOUT_SECONDS,
    UPDATE_CHECK_TTL_SECONDS,
    UPSTREAM_REF,
    UPSTREAM_REPO,
)

log = logging.getLogger(__name__)

# Pinned host — the only origin this service ever talks to.
RAW_HOST = "raw.githubusercontent.com"
# The changelog's in-repo path (stable — it is where every version lives).
CHANGELOG_PATH = "knowledge-base/changelogs/CHANGELOG.md"
# House changelog top line: "5.15.1 || 10.11.2026". Only the leading version
# matters to the comparison; the rest of the line is ignored.
_VERSION_LINE = re.compile(r"^(\d+\.\d+\.\d+)")
_REPO_NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?/[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
_REF_NAME = re.compile(r"^[a-zA-Z0-9._/-]{1,200}$")
# 4 KiB is 40,000× more first-line than the changelog format needs.
_FIRST_LINE_CAP = 4096
# The image-baked version file (api/Dockerfile writes it from the CHANGELOG
# top line). A module constant so tests can point it elsewhere.
VERSION_FILE = Path(__file__).resolve().parents[2] / "VERSION"

_CACHE_LOCK = threading.Lock()
_CACHE: dict = {"at": 0.0, "ok": False, "version": None, "reason": None}


class UpstreamError(Exception):
    """The upstream version could not be determined (network/parse/HTTP)."""


def _settings() -> tuple[str, str]:
    """Validate the configured upstream (repo/ref come from settings, never the
    request; a misconfigured env fails per request, not silently)."""
    repo = str(UPSTREAM_REPO or "").strip()
    ref = str(UPSTREAM_REF or "").strip()
    if not _REPO_NAME.fullmatch(repo) or not _REF_NAME.fullmatch(ref):
        raise UpstreamError("misconfigured-upstream")
    return repo, ref


def node_version() -> str:
    """The version THIS node runs: WEB10_VERSION env, else the image-baked
    /web10/VERSION, else 'unknown' (dev/e2e volume mounts shadow the file)."""
    from app.settings import WEB10_VERSION

    explicit = str(WEB10_VERSION or "").strip()
    if explicit:
        return explicit
    try:
        baked = VERSION_FILE.read_text().strip()
        if baked:
            return baked
    except OSError:
        log.info("[update-check] no baked %s — reporting unknown", VERSION_FILE)
    return "unknown"


def parse_changelog_version(first_line: str | None) -> str | None:
    """The leading X.Y.Z of a changelog top line; None when it is not one."""
    if not first_line:
        return None
    m = _VERSION_LINE.match(first_line.strip())
    return m.group(1) if m else None


def _compare(current: str, latest: str) -> bool:
    """update_available = latest strictly ahead of current (semver tuple —
    both sides are parse_changelog_version output, so the parts are ints)."""

    def key(v: str):
        return tuple(int(p) for p in v.split("."))

    return key(latest) > key(current)


def _read_first_line(resp) -> str | None:
    """Stream-read until the first newline (bounded) — the top entry is all the check needs."""
    chunks = []
    total = 0
    while True:
        chunk = resp.read(1024, decode_content=True)
        if not chunk:
            break
        total += len(chunk)
        idx = chunk.find(b"\n")
        if idx != -1:
            chunks.append(chunk[:idx])
            break
        chunks.append(chunk)
        if total >= _FIRST_LINE_CAP:
            raise UpstreamError("response-too-large")
    return b"".join(chunks).decode("utf-8", errors="replace").strip() or None


def _fetch_upstream_version() -> str:
    """One pinned HTTPS GET of the upstream changelog's first line.

    Fails closed (UpstreamError) on any deviation: DNS to a non-public
    address, TLS/hostname mismatch, a non-200, or a first line that is not a
    changelog version. Never follows redirects.
    """
    repo, ref = _settings()
    path = f"/{quote(repo, safe='/')}/{quote(ref, safe='/')}/{CHANGELOG_PATH}"

    addresses = socket.getaddrinfo(RAW_HOST, 443, type=socket.SOCK_STREAM)
    candidates = []
    for _fam, _type, _proto, _canon, sockaddr in addresses:
        try:
            addr = ipaddress.ip_address(sockaddr[0])
        except (ValueError, IndexError):
            continue
        if not addr.is_global or addr.is_multicast or addr.is_reserved or addr.is_unspecified:
            continue
        if isinstance(addr, ipaddress.IPv6Address) and (addr.ipv4_mapped or addr.sixtofour or addr.teredo):
            continue
        candidates.append(addr)
    if not candidates:
        raise UpstreamError("dns-unavailable")
    address = str(candidates[0])

    pool = urllib3.HTTPSConnectionPool(
        address,
        port=443,
        timeout=urllib3.Timeout(connect=UPDATE_CHECK_TIMEOUT_SECONDS, read=UPDATE_CHECK_TIMEOUT_SECONDS),
        retries=False,
        server_hostname=RAW_HOST,
        assert_hostname=RAW_HOST,
        cert_reqs=ssl.CERT_REQUIRED,
    )
    resp = None
    try:
        resp = pool.urlopen(
            "GET",
            path,
            headers={"Host": RAW_HOST, "Accept": "text/plain"},
            redirect=False,
            retries=False,
            preload_content=False,
        )
        if not 200 <= resp.status < 300:
            raise UpstreamError(f"upstream-http-{resp.status}")
        version = parse_changelog_version(_read_first_line(resp))
        if version is None:
            raise UpstreamError("bad-upstream-changelog")
        log.info("[update-check] upstream version %s (%s @ %s)", version, repo, ref)
        return version
    except UpstreamError:
        raise
    except (OSError, UnicodeError, urllib3.exceptions.HTTPError, urllib3.exceptions.MaxRetryError) as e:
        raise UpstreamError(f"upstream-unreachable:{type(e).__name__}") from e
    finally:
        if resp is not None:
            resp.close()
        pool.close()


def update_status(force: bool = False) -> dict:
    """The admin update-check response (the endpoint shape; semantics in the
    KB): node_version, latest_version, update_available (True/False/None),
    upstream {repo, ref, url}, status, reason, checked_at, cached."""
    current = node_version()
    if not force:
        with _CACHE_LOCK:
            now = time.time()
            ttl = UPDATE_CHECK_TTL_SECONDS if _CACHE["ok"] else UPDATE_CHECK_FAIL_TTL_SECONDS
            if _CACHE["version"] is not None or now - _CACHE["at"] < ttl:
                payload = _cached_payload(current, _CACHE)
                payload["cached"] = True
                log.info("[update-check] served from cache (%s)", _CACHE["version"] or _CACHE["reason"])
                return payload

    try:
        latest = _fetch_upstream_version()
        result = {"ok": True, "version": latest, "reason": None}
    except UpstreamError as e:
        log.warning("[update-check] upstream check failed: %s", e)
        result = {"ok": False, "version": None, "reason": str(e)}
    except Exception:
        # A check must never take the node surface down (same posture as the
        # telemetry beacon: a bad upstream is an 'unavailable' state, not a 500).
        log.exception("[update-check] unexpected failure — reporting unavailable")
        result = {"ok": False, "version": None, "reason": "internal-error"}

    with _CACHE_LOCK:
        _CACHE.update(at=time.time(), **result)
    return _cached_payload(current, _CACHE, cached=False)


def _cached_payload(current: str, cache: dict, cached: bool = True) -> dict:
    repo = str(UPSTREAM_REPO or "")
    ref = str(UPSTREAM_REF or "")
    latest = cache["version"]
    current_version = parse_changelog_version(current)
    if cache["ok"]:
        if current_version:
            status = "update-available" if _compare(current_version, latest) else "up-to-date"
            update_available = status == "update-available"
        else:
            status = "version-unknown"
            update_available = None
    else:
        status = "unavailable"
        update_available = None
    payload = {
        "node_version": current,
        "latest_version": latest,
        "update_available": update_available,
        "upstream": {
            "repo": repo,
            "ref": ref,
            "url": f"https://github.com/{repo}" if repo else None,
        },
        "status": status,
        "reason": cache["reason"],
        "checked_at": None,
        "cached": cached,
    }
    if cache["at"]:
        payload["checked_at"] = _iso(cache["at"])
    return payload


def _iso(ts: float) -> str:
    import datetime

    return datetime.datetime.fromtimestamp(ts, datetime.UTC).isoformat()
