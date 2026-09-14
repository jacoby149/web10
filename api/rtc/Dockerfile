# Mirrored to our GHCR namespace (ghcr-mirror.yml) — see e2e/mirror-images.json.
FROM ghcr.io/jacoby149/base-bun:1-alpine

RUN mkdir /rtc
WORKDIR /rtc

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json index.ts ./

EXPOSE 80
CMD ["bun", "run", "index.ts"]
