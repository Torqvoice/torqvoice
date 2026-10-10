FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl postgresql-client bash ffmpeg

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./prisma.config.ts
# npm ci runs the prepare script, which patches next-ws and then applies our
# own follow-up patch from scripts/. The source tree is not copied until the
# builder stage, so that one file has to come along here.
COPY scripts/patch-next-ws-first-upgrade.mjs ./scripts/
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

# What the container runs beside the server: the Prisma CLI for the migrations
# at start, and tsx with a full Prisma client for the demo seed. Installed in
# a folder of its own, with no package.json beside it. Run inside /app, where
# the standalone build keeps the project's package.json, the same install
# pulled in every production dependency the project has, replaced the patched
# next the build had traced, and made the image well over a gigabyte larger.
FROM base AS tools
WORKDIR /tools
RUN npm install --no-save --no-audit --no-fund \
      prisma@7.6.0 @prisma/client@7.6.0 @prisma/adapter-pg@7.6.0 pg dotenv tsx

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

# Copy generated Prisma client
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# The server runs on the node_modules Next traced for it. That is exactly what
# the build ran with: next carrying the next-ws patch and the first-upgrade fix
# the prepare script applied in the deps stage, and sharp with the binary for
# this image's platform. Nothing is installed over it, so none of that has to
# be patched or resolved a second time here.
#
# The traced node_modules is not a full install, though: several packages are
# a package.json with their entry point pruned away, and a plain Node script
# run in /app dies on a missing module. So what runs beside the server lives
# in /app/tools with its own complete node_modules: the migrations (see
# init-db.sh) and the demo seed (see .github/workflows/deploy-demo.yml), each
# next to the files it reads.
COPY --from=tools --chown=nextjs:nodejs /tools/node_modules ./tools/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./tools/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./tools/prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./tools/src/generated

# Fail the build here rather than at the first live update or certificate
# download. WebSocket routes only work on a next that carries the next-ws
# patch, with next-ws waiting for the lazily loaded route module; a native
# module that cannot be loaded throws while its route is being evaluated,
# which reaches the browser as an empty HTTP 500 with nothing to explain it.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/patch-next-ws-first-upgrade.mjs ./scripts/patch-next-ws-first-upgrade.mjs
RUN grep -qs "next-ws" node_modules/next/dist/server/next-server.js \
      || { echo "the traced next is missing the next-ws patch"; exit 1; }
RUN node scripts/patch-next-ws-first-upgrade.mjs
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
