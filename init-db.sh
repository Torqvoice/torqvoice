#!/bin/bash
set -e

trap 'echo "An error occurred. Exiting..."; exit 1' ERR

cmd="$@"

# Construct DATABASE_URL from environment variables if not already set
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
fi

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -d "$DATABASE_URL" -q; do
  echo "PostgreSQL is unavailable - sleeping 2s..."
  sleep 2
done
echo "PostgreSQL is ready!"

echo "Applying database migrations..."
# Keep stderr rather than discarding it: when the retry below also fails, the
# first error is the one that says why, and swallowing it left the container
# dying with no reason recorded.
migrate_err=$(mktemp)
if ! npx prisma migrate deploy 2>"$migrate_err"; then
  echo "First migrate attempt failed:"
  sed 's/^/  /' "$migrate_err" >&2
  # P3005: existing DB without migration history (from db push).
  # Create empty migration table so migrate deploy can run.
  # 0_init is fully idempotent — safe on any DB state.
  echo "Existing database detected. Creating migration table..."
  npx prisma db execute --stdin <<< 'CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)'
  npx prisma migrate deploy
fi
rm -f "$migrate_err"
echo "Migrations applied successfully!"

# Photo embedding is the one thing here that depends on a native module, and
# sharp's prebuilt binaries need an x86-64-v2 CPU. Some virtualised hosts do not
# advertise one — Proxmox's default kvm64 processor model, for instance, reports
# a baseline x86-64 even on modern hardware. Report it at boot rather than
# leaving it to be found when a certificate comes out without its photos.
# Never fatal: everything else in the app works without it.
if ! sharp_error=$(node -e "require('sharp')" 2>&1); then
  echo "WARNING: sharp could not be loaded. Inspection certificates will render without photos."
  echo "$sharp_error" | sed 's/^/  /'
fi

echo "Starting application..."
exec $cmd
