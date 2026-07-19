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
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MARKETING_API=$VITE_MARKETING_API \
    VITE_GIT_COMMIT=$VITE_GIT_COMMIT

RUN bun run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
