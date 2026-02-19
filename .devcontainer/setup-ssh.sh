#!/bin/bash

# === SSH Setup for DevContainer ===
# Solves: VS Code Git extension + terminal SSH with passphrase

# Fixed socket path that VS Code can find via remoteEnv
SSH_SOCK="/tmp/ssh-agent-vscode.sock"

# --- Copy SSH keys from host ---
NODE_SSH="/home/node/.ssh"
if [ -d "/tmp/host-ssh" ]; then
    mkdir -p "$NODE_SSH"
    cp /tmp/host-ssh/* "$NODE_SSH/"
    chmod 700 "$NODE_SSH"
    chmod 600 "$NODE_SSH"/id_* 2>/dev/null
    chmod 644 "$NODE_SSH"/*.pub "$NODE_SSH"/known_hosts "$NODE_SSH"/config 2>/dev/null
    echo "✓ SSH keys copied to $NODE_SSH"
else
    echo "✗ /tmp/host-ssh not found — SSH mount missing"
fi

# --- Start ssh-agent with fixed socket ---
# Remove old socket if it exists but the agent is dead
if [ -S "$SSH_SOCK" ]; then
    if ! SSH_AUTH_SOCK="$SSH_SOCK" ssh-add -l &>/dev/null; then
        rm -f "$SSH_SOCK"
    fi
fi

# Start new agent if necessary
if [ ! -S "$SSH_SOCK" ]; then
    eval $(ssh-agent -a "$SSH_SOCK") > /dev/null
    echo "✓ SSH agent started on $SSH_SOCK"
else
    export SSH_AUTH_SOCK="$SSH_SOCK"
    echo "✓ SSH agent already running"
fi

# --- Add to .bashrc for terminals ---
if ! grep -q "SSH_AGENT_VSCODE" ~/.bashrc 2>/dev/null; then
    cat >> ~/.bashrc << 'BASHRC'

# SSH_AGENT_VSCODE
export SSH_AUTH_SOCK="/tmp/ssh-agent-vscode.sock"

# Add key if agent is running but no keys loaded
if [ -S "$SSH_AUTH_SOCK" ]; then
    if ! ssh-add -l &>/dev/null; then
        echo "Run 'ssh-add' to load SSH key"
    fi
fi
BASHRC
    echo "✓ .bashrc updated"
fi

echo ""
echo "==========================================="
echo "SSH SETUP COMPLETE"
echo "==========================================="
echo ""
echo "IMPORTANT: Open a terminal and run:"
echo "  ssh-add ~/.ssh/id_ed25519"
echo ""
echo "You will be asked for your passphrase ONCE."
echo "After that, both terminal AND VS Code Git will work."
echo "==========================================="