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

The upstream-comparison half (which version is next, and the admin
``POST /admin/update_status`` endpoint) lands in the follow-up on this
stack; the full contract is documented in
``knowledge-base/web10-v3/setup/update-check.md``.
"""

import logging
import re
from pathlib import Path

log = logging.getLogger(__name__)

# Pinned host — the only origin this service ever talks to.
RAW_HOST = "raw.githubusercontent.com"
# The changelog's in-repo path (stable — it is where every version lives).
CHANGELOG_PATH = "knowledge-base/changelogs/CHANGELOG.md"
# House changelog top line: "5.15.1 || 10.11.2026". Only the leading
# version matters to any comparison; the rest of the line is ignored.
_VERSION_LINE = re.compile(r"^(\d+\.\d+\.\d+)")
# Settings-level validation so a misconfigured env fails per request, not silently.
_REPO_NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?/[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
_REF_NAME = re.compile(r"^[a-zA-Z0-9._/-]{1,200}$")
# 4 KiB is 40,000× more first-line than the changelog format needs.
_FIRST_LINE_CAP = 4096
# The image-baked version file (api/Dockerfile writes it from the CHANGELOG
# top line). A module constant so tests can point it elsewhere.
VERSION_FILE = Path(__file__).resolve().parents[2] / "VERSION"


class UpstreamError(Exception):
    """The upstream version could not be determined (network/parse/HTTP)."""


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
