FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=::
ENV PORT=8080

COPY --from=build /app/build ./build
COPY package.json ./

EXPOSE 8080
CMD ["node", "build"]
