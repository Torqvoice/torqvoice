#!/bin/bash
set -e

trap 'echo "An error occurred. Exiting..."; exit 1' ERR

cmd="$@"

echo "Waiting for PostgreSQL to be ready..."
until npx prisma db execute --stdin <<< "SELECT 1" 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping 2s..."
  sleep 2
done
echo "PostgreSQL is ready!"

echo "Applying database migrations..."
if ! npx prisma migrate deploy 2>/dev/null; then
  # P3005: existing DB created with db push, no migration history.
  # Mark idempotent baseline as applied, then run remaining migrations.
  echo "Existing database detected. Baselining..."
  npx prisma migrate resolve --applied 0_init
  npx prisma migrate deploy
fi
echo "Migrations applied successfully!"

echo "Starting application..."
exec $cmd
