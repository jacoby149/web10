# Repo-root build context (see ubuntu-deployment/docker-compose.ecosystem.yml
# — the social service needs `context: ..`, like the ui service). The context
# must be the repo root because web10-npm is a local `file:../../sdk`
# dependency: bun install needs sdk/ in the context (same pattern as ui/).
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY marketing/web10-social/package.json marketing/web10-social/bun.lock* ./
COPY sdk/package.json /sdk/package.json
COPY sdk/dist/ /sdk/dist/
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

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY marketing/web10-social/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
