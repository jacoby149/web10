FROM oven/bun:1-alpine AS build

# git is needed so build-status.sh can read the live commit SHA + date at
# build time (a fallback for redeploys that don't surface GIT_COMMIT — e.g.
# Portainer's GitOps poll). Alpine's git is ~5MB; it stays in the build
# stage only and never reaches the runtime image.
RUN apk add --no-cache git

# Repo-root context: source lives under marketing/marketing-ui/, but
# CHANGELOG.md + .git sit at /app so build-status.sh can read them.
WORKDIR /app

# Bake the version/commit source-of-truth into the image first so
# build-status.sh can fall back to them (a GitOps poll rebuilds without
# the GIT_COMMIT / STATUS_VERSION build args). CHANGELOG.md supplies
# STATUS_VERSION; .git supplies the commit SHA + date. The repo-root
# .dockerignore keeps these reasonably small.
COPY CHANGELOG.md /app/CHANGELOG.md
COPY .git /app/.git

# Install deps first for cache reuse on a code-only change.
COPY marketing/marketing-ui/package.json marketing/marketing-ui/bun.lock* ./marketing/marketing-ui/
WORKDIR /app/marketing/marketing-ui
RUN bun install --frozen-lockfile || bun install

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

# Copy the marketing-ui source (only) so the build context — now the
# whole repo — does not leak e2e/api/knowledge/... into /app.
COPY marketing/marketing-ui/ ./
RUN bun run build

# Baked deployment status page — generated from git info + CHANGELOG at
# build time, so every redeploy refreshes it. STATUS_VERSION is passed as
# a build ARG but build-status.sh also falls back to reading the
# top-of-CHANGELOG line when it's absent (e.g. a GitOps poll).
COPY marketing/marketing-ui/build-status.sh /usr/local/bin/build-status.sh
RUN chmod +x /usr/local/bin/build-status.sh && /usr/local/bin/build-status.sh

FROM nginx:alpine
COPY --from=build /app/marketing/marketing-ui/dist /usr/share/nginx/html
COPY marketing/marketing-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]