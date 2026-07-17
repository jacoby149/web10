FROM oven/bun:1-alpine as dev
WORKDIR /auth
COPY auth/package.json /auth/package.json
RUN bun install
COPY sdk /auth/public/sdk
COPY auth/. /auth

FROM dev as deploy
RUN bun run build
CMD PORT=80 bunx serve -s build
