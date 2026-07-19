FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .

# Backend origins are baked at build time (vite). Passed by
# ubuntu-deployment/docker-compose.ecosystem.yml per environment.
# VITE_MARKETING_API is read today (ReportBug); the API/AUTH/RTC args
# are consumed once the adapter env-read lands (lane D / D12) —
# Web10SocialAdapter.ts still hardcodes its origins until then.
ARG VITE_API_ORIGIN
ARG VITE_AUTH_ORIGIN
ARG VITE_RTC_HOST
ARG VITE_MARKETING_API
ARG VITE_GIT_COMMIT
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN \
    VITE_AUTH_ORIGIN=$VITE_AUTH_ORIGIN \
    VITE_RTC_HOST=$VITE_RTC_HOST \
    VITE_MARKETING_API=$VITE_MARKETING_API \
    VITE_GIT_COMMIT=$VITE_GIT_COMMIT

# `bun run build` runs `tsc -b`, which currently fails on `@/` path
# aliases (vite resolves them itself; the tsconfig fix is lane D's).
RUN bunx vite build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
