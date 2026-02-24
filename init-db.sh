#!/bin/bash
set -e

trap 'echo "An error occurred. Exiting..."; exit 1' ERR

cmd="$@"

echo "Waiting for PostgreSQL to be ready..."
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping 2s..."
  sleep 2
done
echo "PostgreSQL is ready!"

echo "Applying database schema..."
npx prisma db push --accept-data-loss
echo "Schema applied successfully!"

echo "Starting application..."
exec $cmd
