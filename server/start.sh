#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Cleanup old server
pkill -f "mrai_server.py" 2>/dev/null || true
sleep 1

# Start Python server on local port 8080
exec python3 "$DIR/mrai_server.py" 8080
