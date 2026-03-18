FROM node:22-bullseye as deps
# RUN apt-get update && apt-get install
WORKDIR /app

COPY package.json ./
COPY prisma/ ./prisma/
RUN npm install

FROM node:22-bullseye as builder
WORKDIR /app

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

FROM node:22-bullseye as runner
WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma/ ./prisma/
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/templates/ ./templates/
COPY --from=builder /app/static/ ./static/

EXPOSE 4000

CMD ["npm", "run", "start"]
