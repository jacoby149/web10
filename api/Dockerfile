# Mirrored to our GHCR namespace (ghcr-mirror.yml) so the build never pulls
# from a third-party registry at runtime — see e2e/mirror-images.json.
FROM ghcr.io/jacoby149/base-uv:python3.12-bookworm-slim

# ffmpeg + ffprobe — the in-process HLS transcode worker (D44) shells out to
# them. --no-install-recommends keeps the image lean.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /web10

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-cache

COPY ./app /web10/app

CMD ["uv", "run", "gunicorn", "-b", "0.0.0.0:80", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app.main:app"]
