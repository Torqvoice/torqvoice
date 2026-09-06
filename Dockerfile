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

# Give the install below the lockfile the app was built with. Without it npm
# re-resolves the whole tree against the live registry on every build, so the
# runtime image drifts from what was tested, and a registry change can break
# the build with nothing changed here (npm 10 crashed with "Cannot read
# properties of null (reading 'edgesOut')" resolving vitest's peers this way).
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json

# Remove Next.js standalone's traced stubs for pg/prisma (tracer copies package.json
# but not all files), then install the full runtime packages fresh.
RUN rm -rf \
      /app/node_modules/pg \
      /app/node_modules/pg-types \
      /app/node_modules/pg-pool \
      /app/node_modules/pg-connection-string \
      /app/node_modules/pg-protocol \
      /app/node_modules/pg-int8 \
      /app/node_modules/pg-cloudflare \
      /app/node_modules/pgpass \
      /app/node_modules/postgres-array \
      /app/node_modules/postgres-bytea \
      /app/node_modules/postgres-date \
      /app/node_modules/postgres-interval \
      /app/node_modules/split2 \
      /app/node_modules/prisma \
      /app/node_modules/@prisma \
      /app/node_modules/.prisma \
    && npm install --omit=dev prisma@7.6.0 @prisma/client@7.6.0 @prisma/adapter-pg@7.6.0 pg dotenv tsx sharp

# The npm install above re-resolves the dependency tree and replaces the
# standalone build's PATCHED next package with a fresh unpatched copy from the
# registry, which silently breaks all WebSocket routes (live updates, work
# board sync). Re-apply the next-ws patch so the runtime server can accept
# WebSocket upgrades. next-ws itself is already in the standalone bundle.
#
# sharp is named in that install for the same reason. It is the only native
# module in the tree, its binary lives in a platform-specific optional
# dependency (@img/sharp-linuxmusl-x64 on this image), and re-resolving the
# tree can leave the traced copy without one. Installing it by name makes npm
# resolve the binary against the platform the image will actually run on.
RUN npx next-ws patch --yes

# Fail the build here rather than at the first certificate download: a native
# module that cannot be loaded throws while the route module is being
# evaluated, which reaches the browser as an empty HTTP 500 with nothing in it
# to explain itself.
RUN node -e "require('sharp'); console.log('sharp loads')"

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
