#!/usr/bin/env bash
# Runs right after a deploy's `docker compose up`, from the deploy folder that
# holds docker-compose.yml and .env. Waits for the new container, and when it
# never gets healthy puts back the image that ran before.
#
#   roll-back-if-unhealthy.sh <container> <new tag> <previous image id> <previous image ref> <name>
#
# Only the image goes back. The database is never touched: when the old code
# cannot run against the new schema, the manual rollback workflow restores the
# dump the deploy took. Either way the job fails, so a rollback is never quiet.
set -uo pipefail

container="$1"
new_tag="$2"
prev_id="$3"
prev_ref="$4"
name="$5"
# The image compose names as image: <repo>:${APP_TAG}. Set only by the tests.
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/torqvoice/torqvoice}"
here="$(cd "$(dirname "$0")" && pwd)"

bash "$here/wait-healthy.sh" "$container"
code=$?
if [ "$code" = 0 ]; then
  echo "Deployed $new_tag."
  exit 0
fi

echo "--- Last 80 lines from $container"
docker logs "$container" --tail 80 2>&1

case "$code" in
  2)
    echo "::error title=Not rolled back::$new_tag stopped or got stuck before its migrations finished. The previous version waits for the database and migrates the same way at start, so it would stop there too. Read the log above. If a migration failed, resolve it (prisma migrate resolve) before either version can start."
    exit 1
    ;;
  3)
    echo "::error title=Not rolled back::$new_tag is still migrating. It is left running so the migration can finish. Check on it, and roll back by hand afterwards if it still does not get healthy."
    exit 1
    ;;
esac

if [ -z "$prev_id" ]; then
  echo "::error title=Not rolled back::Nothing was running before $new_tag, so there is nothing to put back."
  exit 1
fi
if [ "$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null)" = "$prev_id" ]; then
  echo "::error title=Not rolled back::The version that ran before is this same image."
  exit 1
fi

# Compose names its image by tag. Reuse the old tag while it still points at
# the image that ran; a floating tag such as latest has moved on since, so the
# old image gets a local tag of its own.
prev_tag="${prev_ref##*:}"
prev_name="$prev_ref"
if [ "$(docker image inspect --format '{{.Id}}' "$prev_ref" 2>/dev/null)" != "$prev_id" ]; then
  short_id="${prev_id#sha256:}"
  prev_name="$prev_ref as it was before this deploy (image ${short_id:0:12})"
  prev_tag="rollback-$name"
  docker tag "$prev_id" "$IMAGE_REPO:$prev_tag" || {
    echo "::error title=Not rolled back::The image that ran before ($prev_name) is no longer on this host."
    exit 1
  }
fi

echo "::warning title=Rolling back::$new_tag did not get healthy. Putting back $prev_name."
# Never pull: the image was found on this host above, and a pull could bring
# the failed release back under the same tag (latest, say) instead.
APP_TAG="$prev_tag" docker compose up -d --pull never

if bash "$here/wait-healthy.sh" "$container"; then
  echo "::error title=Rolled back::$new_tag did not get healthy, so $prev_name is running again. The database was not touched."
else
  echo "--- Last 80 lines from $container after the rollback"
  docker logs "$container" --tail 80 2>&1
  echo "::error title=Rollback is not healthy either::$new_tag did not get healthy, and neither did $prev_name after it was put back. If the old code cannot run against the new schema, use the Rollback workflow with restore_database."
fi
exit 1
