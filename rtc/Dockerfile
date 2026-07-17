FROM oven/bun:1-alpine

RUN mkdir /rtc
WORKDIR /rtc

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json index.ts ./

EXPOSE 80
CMD ["bun", "run", "index.ts"]
