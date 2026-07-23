FROM oven/bun:1-alpine AS dev

WORKDIR /ui

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
# Patch the npm-published web10-npm SDK: defaultAPIProtocol (undefined) ->
# APIProtocol. The fix lives in sdk/src/wapiAuth.js but the npm package
# has not been republished yet. Once web10-npm@>=1.0.9 lands on npm, this
# sed can be removed.
RUN sed -i 's/wapi\.defaultAPIProtocol/wapi.APIProtocol/g' node_modules/web10-npm/dist/node/wapi.js node_modules/web10-npm/dist/node/wapi.modern.js 2>/dev/null || true

COPY index.html tsconfig.json vite.config.js ./
COPY public/ public/
COPY ../CHANGELOG.md public/CHANGELOG.md
COPY src/ src/

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
ENV REACT_APP_AUTH_ORIGIN=${REACT_APP_AUTH_ORIGIN} \
    REACT_APP_API_ORIGIN=${REACT_APP_API_ORIGIN} \
    REACT_APP_RTC_ORIGIN=${REACT_APP_RTC_ORIGIN} \
    REACT_APP_DEFAULT_API=${REACT_APP_DEFAULT_API}

RUN bun run build

FROM joseluisq/static-web-server:latest

WORKDIR /ui

ENV SERVER_DIRECTORY_LISTING false

COPY --from=build /ui/dist /ui/public

EXPOSE 80
