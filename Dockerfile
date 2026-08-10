FROM node:22-bookworm-slim AS deps
# RUN apt-get update && apt-get install
WORKDIR /app

COPY package.json ./
COPY prisma/ ./prisma/
RUN npm install

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app

# Prisma's schema engine (used by `prisma migrate deploy`) is a native binary. Without
# libssl present, Prisma cannot detect the OpenSSL version and guesses openssl-1.1.x --
# both when downloading the engine here and when running it later. Installing openssl in
# both stages keeps that detection correct and consistent.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
	&& rm -rf /var/lib/apt/lists/*

# Production dependencies only, so typescript and the @types packages used to build do
# not ship in the runtime image. `prisma` is a runtime dependency here because the
# entrypoint runs `prisma migrate deploy`.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
	&& rm -rf /var/lib/apt/lists/*

# Temporary environment variable for prisma generate
ENV PRISMA_DB_URL="file:./dev.db"

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/prisma/ ./prisma/
COPY prisma.config.ts ./prisma.config.ts
COPY tsconfig.json ./tsconfig.json
COPY src/ ./src/
COPY templates/ ./templates/
COPY static/ ./static
RUN npm install -g typescript
RUN npx prisma generate
RUN tsc

FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Prisma's schema engine (used by `prisma migrate deploy`) is a native binary. Without
# libssl present, Prisma cannot detect the OpenSSL version and guesses openssl-1.1.x --
# both when downloading the engine here and when running it later. Installing openssl in
# both stages keeps that detection correct and consistent.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
	&& rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=builder /app/build ./build
COPY --from=prod-deps /app/node_modules ./node_modules

# The Prisma client is generated into node_modules/.prisma by `npm run build`, so it
# does not exist in the production install above. @prisma/client re-exports from it.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma/ ./prisma/
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/templates/ ./templates/
COPY --from=builder /app/static/ ./static/

COPY docker-entrypoint.sh ./docker-entrypoint.sh

EXPOSE 4000

# The entrypoint applies the database migrations before starting the application, unless
# NO_INTRA_SYNC is set to true. Any arguments passed to the container (such as --nosync or
# --readonly) are forwarded to the application.
ENTRYPOINT ["./docker-entrypoint.sh"]
