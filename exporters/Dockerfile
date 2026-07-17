FROM oven/bun:1-alpine AS dev

WORKDIR /exporters

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY index.html tsconfig.json vite.config.js ./
COPY src/ src/

EXPOSE 80

FROM dev AS build

RUN bun run build

FROM joseluisq/static-web-server:latest

WORKDIR /exporters

ENV SERVER_DIRECTORY_LISTING false

COPY --from=build /exporters/dist /exporters/public

EXPOSE 80
