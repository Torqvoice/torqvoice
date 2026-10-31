FROM node:22.23.4-bookworm

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# restic, for the scheduled backups a workshop sends to its own storage. The
# same pinned release as the production Dockerfile, checked against its
# SHA-256 so a changed download fails the build. Bump both files together.
ARG RESTIC_VERSION=0.19.1
RUN set -e; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) sum=f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c ;; \
      arm64) sum=a5f64aaab53d51e311fa3829124c5b703f2d14cf187d8640b6be3b2b49376465 ;; \
      *) echo "no pinned restic checksum for architecture '${arch}'"; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/restic.bz2 \
      "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_${arch}.bz2"; \
    echo "$sum  /tmp/restic.bz2" | sha256sum -c -; \
    bunzip2 /tmp/restic.bz2; \
    install -m 755 /tmp/restic /usr/local/bin/restic; \
    rm -f /tmp/restic; \
    restic version

# Set up non-root user
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Create the user if it doesn't exist
RUN if [ "$USER_GID" != "1000" ] || [ "$USER_UID" != "1000" ]; then \
        groupmod --gid $USER_GID $USERNAME \
        && usermod --uid $USER_UID --gid $USER_GID $USERNAME; \
    fi

# Set up workspace
WORKDIR /workspace
RUN chown $USERNAME:$USERNAME /workspace

COPY . .

EXPOSE 3000

USER $USERNAME
