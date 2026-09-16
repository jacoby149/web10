# Repo-root build context (see ubuntu-deployment/docker-compose.ecosystem.yml
# — the social service needs `context: ..`, like the ui service). The context
# must be the repo root because web10-npm is a local `file:../../sdk`
# dependency: bun install needs sdk/ in the context (same pattern as ui/).
# Mirrored to our GHCR namespace (ghcr-mirror.yml) — see e2e/mirror-images.json.
FROM ghcr.io/jacoby149/base-bun:1-alpine AS build
WORKDIR /app

COPY marketing/web10-social/package.json marketing/web10-social/bun.lock* ./
COPY sdk/package.json /sdk/package.json
COPY sdk/dist/ /sdk/dist/
# D73: the shared discover card is a local `file:../shared/discover` dep —
# bun install (run in /app) resolves it to /shared/discover, so COPY
# marketing/shared/ there (same pattern as the sdk/ COPY above).
COPY marketing/shared/ /shared/
RUN bun install --frozen-lockfile || bun install
COPY marketing/web10-social/ .

# Backend origins are baked at build time (vite), passed by
# ubuntu-deployment/docker-compose.ecosystem.yml per environment and
# read in src/lib/origins.ts (prod origins are the fallback).
ARG VITE_API_ORIGIN
ARG VITE_AUTH_ORIGIN
ARG VITE_RTC_ORIGIN
ARG VITE_MARKETING_API
ARG VITE_MARKETING_ORIGIN
ARG VITE_GIT_COMMIT
# D56: full-platform telemetry — GA4 + Hotjar IDs (empty = tracking off).
ARG VITE_GA4_MEASUREMENT_ID
ARG VITE_HOTJAR_SITE_ID
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN \
    VITE_AUTH_ORIGIN=$VITE_AUTH_ORIGIN \
    VITE_RTC_ORIGIN=$VITE_RTC_ORIGIN \
    VITE_MARKETING_API=$VITE_MARKETING_API \
    VITE_MARKETING_ORIGIN=$VITE_MARKETING_ORIGIN \
    VITE_GIT_COMMIT=$VITE_GIT_COMMIT \
    VITE_GA4_MEASUREMENT_ID=$VITE_GA4_MEASUREMENT_ID \
    VITE_HOTJAR_SITE_ID=$VITE_HOTJAR_SITE_ID

RUN bun run build

FROM ghcr.io/jacoby149/base-nginx:alpine
# The link-preview server (the social-specific tail of the generic
# thumbnailing primitive, KB: media/thumbnailing.md) is a small Node process
# that runs alongside nginx in this same container — the social app stays ONE
# service (the card deploys with the app it represents). nginx:alpine has no
# Node runtime, so install it (Alpine's nodejs package).
RUN apk add --no-cache nodejs
COPY --from=build /app/dist /usr/share/nginx/html
# The preview server (the social-specific card logic + the thin HTTP server).
COPY marketing/web10-social/preview/ /app/preview/
# The container entrypoint: starts the preview server, then runs the original
# nginx entrypoint (which envsubs the templates + serves the SPA + proxies
# crawlers to the preview server).
COPY marketing/web10-social/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
# The nginx config is a TEMPLATE (the link-preview edge split): the
# nginx:alpine entrypoint envsubst's /etc/nginx/templates/*.template into
# /etc/nginx/conf.d/ at boot, filling ${PREVIEW_TARGET} from the container
# env (default http://127.0.0.1:3001, the preview server's port). A plain
# conf.d copy would ship the literal ${PREVIEW_TARGET} and the crawler proxy
# would never resolve.
COPY marketing/web10-social/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
