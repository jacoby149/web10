FROM node:22-alpine AS builder
WORKDIR /sdk
COPY package.json bun.lock* tsconfig.json vitest.config.ts ./
RUN npm install
COPY . .
RUN npm run build:all && npm run build:browser

FROM joseluisq/static-web-server:latest
WORKDIR /docs
ENV SERVER_DIRECTORY_LISTING true
COPY --from=builder /sdk /docs/public