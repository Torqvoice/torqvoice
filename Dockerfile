FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl postgresql-client
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ARG APP_VERSION=development
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs

# Install runtime dependencies (prisma CLI + driver adapter + pg driver)
# Must run before standalone copy to avoid conflicts with bundled node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
RUN npm install prisma@7.6.0 @prisma/client@7.6.0 @prisma/adapter-pg@7.6.0 pg dotenv && \
    chown -R nextjs:nodejs /app/node_modules

RUN apk add --no-cache bash ffmpeg

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/init-db.sh ./init-db.sh

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create uploads directories
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./init-db.sh"]
CMD ["node", "server.js"]
