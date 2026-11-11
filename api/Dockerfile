# Mirrored to our GHCR namespace (ghcr-mirror.yml) — see e2e/mirror-images.json.
FROM ghcr.io/jacoby149/base-uv:python3.12-bookworm-slim

# ffmpeg + ffprobe — the in-process HLS transcode worker (D44) shells out to
# them. --no-install-recommends keeps the image lean.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /web10

# Repo-root context (mirrors marketing-ui's build): the node's VERSION is
# baked from the top line of the CHANGELOG below, so a Portainer GitOps
# rebuild — which exports no env vars — still ships the right version
# (the same "stuck on unknown" hole marketing-ui's status page used to sit in).
COPY api/pyproject.toml api/uv.lock ./

RUN uv sync --frozen --no-cache

COPY api/app /web10/app

# The release version this image runs: /web10/VERSION (the update-check
# service's node_version() fallback — settings.py's env-override loop and
# the dev/e2e volume mounts are documented in the service header). The
# changelog is re-included by .dockerignore for exactly this COPY.
COPY knowledge-base/changelogs/CHANGELOG.md /web10/.build-changelog
RUN head -1 /web10/.build-changelog | sed 's/[| ].*//' | tr -d '[:space:]' > /web10/VERSION \
    && rm /web10/.build-changelog

CMD ["uv", "run", "gunicorn", "-b", "0.0.0.0:80", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app.main:app"]
