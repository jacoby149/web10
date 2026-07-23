FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY . .

# Backend origins are baked at build time (vite), passed by
# ubuntu-deployment/docker-compose.ecosystem.yml per environment and
# read in src/lib/origins.ts (prod origins are the fallback).
ARG VITE_API_ORIGIN
ARG VITE_AUTH_ORIGIN
ARG VITE_RTC_ORIGIN
ARG VITE_MARKETING_API
ARG VITE_MARKETING_ORIGIN
ARG VITE_GIT_COMMIT
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN \
    VITE_AUTH_ORIGIN=$VITE_AUTH_ORIGIN \
    VITE_RTC_ORIGIN=$VITE_RTC_ORIGIN \
    VITE_MARKETING_API=$VITE_MARKETING_API \
    VITE_MARKETING_ORIGIN=$VITE_MARKETING_ORIGIN \
    VITE_GIT_COMMIT=$VITE_GIT_COMMIT

RUN bun run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
