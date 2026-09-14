# Mirrored to our GHCR namespace (ghcr-mirror.yml) — see e2e/mirror-images.json.
FROM ghcr.io/jacoby149/base-bun:1-alpine AS builder
WORKDIR /sdk
COPY package.json bun.lock* tsconfig.json vitest.config.ts ./
RUN bun install
COPY . .
RUN bun run build:all && bun run build:browser

FROM ghcr.io/jacoby149/base-static-web-server:latest
WORKDIR /docs
ENV SERVER_DIRECTORY_LISTING true
COPY --from=builder /sdk /docs/public