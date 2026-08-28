FROM oven/bun:1-alpine AS dev

WORKDIR /ui

COPY ui/package.json ui/bun.lock ./
COPY sdk/package.json /sdk/package.json
COPY sdk/dist/ /sdk/dist/
RUN bun install --frozen-lockfile

COPY ui/index.html ui/tsconfig.json ui/vite.config.js ./
COPY ui/public/ public/
COPY ui/src/ src/

EXPOSE 80

FROM dev AS build

# Backend origins baked into the bundle at build time (fixes the
# staging-ships-wrong-API bug — see ubuntu-deployment/AGENT-OPS.md §4.1
# and .context/laneE-ui-build-args.md). Unset ARGs become empty strings,
# which config.ts/env.ts treat as falsy and fall back to the
# api.web10.app/auth.web10.app/rtc.web10.app production defaults, so
# omitting them is safe for a prod build. VITE_* aliases are accepted
# too (vite.config.js envPrefix allows both).
ARG REACT_APP_AUTH_ORIGIN
ARG REACT_APP_API_ORIGIN
ARG REACT_APP_RTC_ORIGIN
ARG REACT_APP_DEFAULT_API
# D56: full-platform telemetry — GA4 + Hotjar IDs (empty = tracking off).
ARG VITE_GA4_MEASUREMENT_ID
ARG VITE_HOTJAR_SITE_ID
ENV REACT_APP_AUTH_ORIGIN=${REACT_APP_AUTH_ORIGIN} \
    REACT_APP_API_ORIGIN=${REACT_APP_API_ORIGIN} \
    REACT_APP_RTC_ORIGIN=${REACT_APP_RTC_ORIGIN} \
    REACT_APP_DEFAULT_API=${REACT_APP_DEFAULT_API} \
    VITE_GA4_MEASUREMENT_ID=${VITE_GA4_MEASUREMENT_ID} \
    VITE_HOTJAR_SITE_ID=${VITE_HOTJAR_SITE_ID}

RUN bun run build

FROM joseluisq/static-web-server:latest

WORKDIR /ui

ENV SERVER_DIRECTORY_LISTING false

COPY --from=build /ui/dist /ui/public

EXPOSE 80
