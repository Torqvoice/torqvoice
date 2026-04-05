FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl postgresql-client bash ffmpeg

# Install dependencies only when needed
FROM base AS deps
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

# Copy public assets
COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy prisma schema and config for migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Copy generated Prisma client
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# Install runtime packages for Prisma v7
RUN npm install prisma@7.6.0 @prisma/client@7.6.0 @prisma/adapter-pg@7.6.0 pg dotenv tsx

# Copy init script
COPY --chown=nextjs:nodejs init-db.sh ./init-db.sh
RUN chmod +x ./init-db.sh

# Create uploads directories
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./init-db.sh"]
CMD ["node", "server.js"]
