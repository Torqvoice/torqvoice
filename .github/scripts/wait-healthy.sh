#!/usr/bin/env bash
# Waits for a freshly started app container to answer its health check.
#
#   wait-healthy.sh <container>
#
# A container counts as started only once it is "healthy": the server answers
# /api/v1/health and reaches the database. "running" is not enough; a release
# that boots and then crashes, or never reaches the database, is running too.
#
# The exit code tells a deploy whether putting the previous image back helps:
#
#   0  healthy
#   1  the migrations finished but the app never got healthy. The previous
#      image can run against this schema, so rolling back is safe.
#   2  it stopped before the migrations finished, or they failed. The previous
#      image runs the same migrate step at start and would fail the same way,
#      so rolling back does not help.
#   3  still migrating when the wait ran out. Rolling back now would stop a
#      migration halfway, so it is left running.
#
# It follows the lines init-db.sh prints as it goes. Keep the two in step.
set -uo pipefail

container="${1:?usage: wait-healthy.sh <container>}"
DB_TIMEOUT="${DB_TIMEOUT:-120}"           # to reach the database
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-1800}" # for the migrations to finish
APP_TIMEOUT="${APP_TIMEOUT:-180}"         # from migrated to healthy

DB_READY='PostgreSQL is ready!'
MIGRATED='Migrations applied successfully!'

db_ready_at=""
migrated_at=""

fail() {
  echo "::error title=$container is not healthy::$2"
  exit "$1"
}

echo "Waiting for $container to be healthy..."
while :; do
  if ! state=$(docker inspect --format '{{.State.Status}} {{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null); then
    fail 2 "No container named $container."
  fi
  read -r status restarts health <<<"$state"
  logs=$(docker logs "$container" 2>&1)

  if [ -z "$db_ready_at" ] && grep -qF "$DB_READY" <<<"$logs"; then
    db_ready_at=$SECONDS
    echo "Database reachable after ${SECONDS}s, migrating..."
  fi
  if [ -z "$migrated_at" ] && grep -qF "$MIGRATED" <<<"$logs"; then
    migrated_at=$SECONDS
    echo "Migrations done after ${SECONDS}s, starting..."
  fi

  if [ "$health" = "healthy" ]; then
    echo "$container is healthy after ${SECONDS}s."
    exit 0
  fi

  # A compose file written before health checks were added has none. Fall
  # back to what the deploys used to check, with a short wait for a crash.
  if [ "$health" = "none" ] && [ "$status" = "running" ] && [ "$restarts" = "0" ] \
    && [ -n "$migrated_at" ] && [ $((SECONDS - migrated_at)) -ge 15 ]; then
    echo "::warning::$container has no health check; it has been running for 15s since its migrations, which is all that can be checked."
    exit 0
  fi

  problem=""
  if [ "$restarts" != "0" ]; then
    problem="it restarted $restarts time(s)"
  elif [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
    problem="it $status"
  elif [ "$health" = "unhealthy" ]; then
    problem="its health check failed"
  fi
  if [ -n "$problem" ]; then
    if [ -n "$migrated_at" ]; then
      fail 1 "After its migrations finished, $problem."
    fi
    fail 2 "Before its migrations finished, $problem."
  fi

  if [ -n "$migrated_at" ]; then
    if [ $((SECONDS - migrated_at)) -ge "$APP_TIMEOUT" ]; then
      fail 1 "Not healthy ${APP_TIMEOUT}s after its migrations finished."
    fi
  elif [ -n "$db_ready_at" ]; then
    if [ $((SECONDS - db_ready_at)) -ge "$MIGRATE_TIMEOUT" ]; then
      fail 3 "Still migrating after ${MIGRATE_TIMEOUT}s."
    fi
  elif [ "$SECONDS" -ge "$DB_TIMEOUT" ]; then
    fail 2 "Could not reach the database within ${DB_TIMEOUT}s."
  fi

  sleep 3
done
