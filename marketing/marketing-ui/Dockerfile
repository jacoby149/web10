FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .

# Backend origins are baked at build time (vite). Passed per env by
# ubuntu-deployment/docker-compose.ecosystem.yml; empty args fall
# back to the in-code localhost defaults.
ARG VITE_API_URL
ARG VITE_MARKETING_API
ARG VITE_GIT_COMMIT
ARG VITE_AUTH_URL
ARG VITE_SOCIAL_URL
ARG VITE_MARKETING_URL
ARG STATUS_VERSION
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MARKETING_API=$VITE_MARKETING_API \
    VITE_GIT_COMMIT=$VITE_GIT_COMMIT \
    VITE_AUTH_URL=$VITE_AUTH_URL \
    VITE_SOCIAL_URL=$VITE_SOCIAL_URL \
    VITE_MARKETING_URL=$VITE_MARKETING_URL \
    STATUS_VERSION=$STATUS_VERSION

RUN bun run build

# Baked deployment status page — generated from git info + CHANGELOG
# at build time, so every redeploy refreshes it automatically.
# STATUS_VERSION is passed as a build ARG (compose reads CHANGELOG.md
# and forwards it), so we don't need the repo root in the build context.
COPY ../ubuntu-deployment/scripts/build-status.sh /usr/local/bin/build-status.sh
RUN chmod +x /usr/local/bin/build-status.sh && /usr/local/bin/build-status.sh

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
