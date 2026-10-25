#!/usr/bin/env bash
# Installs MR AI on this computer: systemd (user) services + the `mrai` command.
# It does not restart anything and is safe to re-run. In the service files /home/muhamad is replaced with the
# current $HOME (project folders: ~/.mrai for data, ~/Claude/work/MRAI for code — edit the service files if elsewhere).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$UNIT_DIR" "$BIN_DIR" "$HOME/.mrai/logs"

for f in "$HERE"/systemd/*.service; do
  sed "s#/home/muhamad#$HOME#g" "$f" > "$UNIT_DIR/$(basename "$f")"
done
install -m 755 "$HERE/mrai" "$BIN_DIR/mrai"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user daemon-reload
systemctl --user enable mrai.service mrai-web.service mrai-edge.service mrai-ngrok.service

# This computer's previous tunnel (Cloudflare) is no longer used — ngrok is the only tunnel now.
systemctl --user disable --now mrai-tunnel.service 2>/dev/null || true
rm -f "$UNIT_DIR/mrai-tunnel.service"

# Keep the services running after logout / reboot
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  loginctl enable-linger "$USER" || sudo loginctl enable-linger "$USER"
fi

echo "Installed. Check with: mrai status"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "Note: $BIN_DIR is not in PATH — add it." ;; esac
