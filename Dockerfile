# syntax=docker/dockerfile:1
# Multi-stage build → small runtime image using Next.js "standalone" output.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# "tools" stage: full source + dev deps, used once for schema setup, seeding and re-ingestion.
#   docker compose run --rm setup
FROM builder AS tools
# Indexing (chunking/embeddings) runs afterwards in the Python service: docker compose --profile tools run --rm ai-index
CMD ["sh", "-c", "npm run db:setup && npx tsx --conditions=react-server scripts/seed.ts"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/app/storage
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs \
 && mkdir -p /app/storage && chown nextjs:nodejs /app/storage
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
