#!/bin/sh
# Sends the browser source maps of a finished `next build` to PostHog error
# tracking, then deletes them. The Dockerfile runs it in the build stage, so an
# exception on Torqvoice Cloud shows the file and line it came from instead of
# a minified chunk.
#
# Off unless POSTHOG_SOURCEMAPS=on, which the image workflows set only when they
# hold the upload key. Off, the build made no maps and there is nothing to do.
#
# An upload problem never fails the build. Without a key or a project, on a
# platform with no pinned CLI, or when the upload goes wrong, it says so and the
# image is built as before, only without readable stack traces.
#
# The maps themselves must never reach the image: self-hosted installs run the
# same image, and anything in .next/static is served to whoever asks. If one is
# still there at the end, the build fails.

set -u

STATIC_DIR=.next/static
KEY_FILE=/run/secrets/posthog_cli_api_key
RELEASE_NAME=torqvoice
RELEASE_VERSION=${APP_VERSION:-development}
PROJECT_ID=${POSTHOG_CLI_PROJECT_ID:-}
HOST=${POSTHOG_CLI_HOST:-https://eu.posthog.com}

# The CLI release to download and the SHA-256 of each archive. Bumping the
# version means bumping both sums with it; each archive on the release page has
# a .sha256 file beside it.
CLI_VERSION=0.18.12
CLI_SHA256_X86_64=4799c1e81318511885295dd22599c38aec99430559da570ff8f6c70473c257aa
CLI_SHA256_AARCH64=1c9b8181c0bed920dfa5ce8388ac22e5418951f1a86ca95c10c4819f3feadfd8

WORK_DIR=

log() {
  echo "source maps: $*"
}

has_maps() {
  [ -n "$(find "$STATIC_DIR" -type f -name '*.map' | head -n 1)" ]
}

# Whatever happened above, no map leaves this stage. The comments pointing at
# them go too, so a browser with dev tools open does not ask for missing files.
finish() {
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR"
  if has_maps; then
    find "$STATIC_DIR" -type f -name '*.map' -exec rm -f {} +
    find "$STATIC_DIR" -type f -name '*.js' -exec sed -i '/^\/\/# sourceMappingURL=/d' {} +
    find "$STATIC_DIR" -type f -name '*.css' -exec sed -i 's|/\*# sourceMappingURL=[^*]*\*/||' {} +
  fi
  if has_maps; then
    log "could not delete the maps in $STATIC_DIR; refusing to build an image that serves them"
    exit 1
  fi
  exit 0
}

if [ "${POSTHOG_SOURCEMAPS:-off}" != "on" ]; then
  finish
fi
if [ ! -s "$KEY_FILE" ]; then
  log "no upload key, skipping"
  finish
fi
if [ -z "$PROJECT_ID" ]; then
  log "no PostHog project id (POSTHOG_CLI_PROJECT_ID), skipping"
  finish
fi
if ! has_maps; then
  log "the build made no maps in $STATIC_DIR, skipping"
  finish
fi

case "$(uname -m)" in
  x86_64) ARCH=x86_64 SUM=$CLI_SHA256_X86_64 ;;
  aarch64 | arm64) ARCH=aarch64 SUM=$CLI_SHA256_AARCH64 ;;
  *)
    log "no pinned posthog-cli for $(uname -m), skipping"
    finish
    ;;
esac

WORK_DIR=$(mktemp -d)
ARCHIVE="$WORK_DIR/posthog-cli.tar.gz"
URL="https://github.com/PostHog/posthog/releases/download/posthog-cli/v${CLI_VERSION}/posthog-cli-${ARCH}-unknown-linux-musl.tar.gz"

if ! wget -q -O "$ARCHIVE" "$URL"; then
  log "could not download posthog-cli $CLI_VERSION, skipping"
  finish
fi
# A changed or tampered download is never run
if ! echo "$SUM  $ARCHIVE" | sha256sum -c - >/dev/null 2>&1; then
  log "the posthog-cli download does not match its pinned SHA-256, skipping"
  finish
fi
if ! tar -xzf "$ARCHIVE" -C "$WORK_DIR"; then
  log "could not unpack posthog-cli, skipping"
  finish
fi
CLI="$WORK_DIR/posthog-cli-${ARCH}-unknown-linux-musl/posthog-cli"

# `process` stamps each chunk with the id its map is filed under, uploads the
# maps, and with --delete-after removes them and their comments again. The
# stamped chunks are what the image serves, so the browser reports those ids.
log "uploading for $RELEASE_NAME $RELEASE_VERSION to project $PROJECT_ID"
if POSTHOG_CLI_API_KEY="$(cat "$KEY_FILE")" \
  POSTHOG_CLI_PROJECT_ID="$PROJECT_ID" \
  POSTHOG_CLI_HOST="$HOST" \
  "$CLI" sourcemap process \
  --directory "$STATIC_DIR" \
  --release-name "$RELEASE_NAME" \
  --release-version "$RELEASE_VERSION" \
  --delete-after; then
  log "uploaded"
else
  log "the upload failed; this image's stack traces stay minified"
fi
finish
