#!/usr/bin/env bash
# One-time cutover to the ~/.mrai architecture. Run it as the owner (muhamad), NOT root:
#   bash ~/Claude/work/mrai-next/deploy/cutover.sh
#
# What it does (safe to re-run):
#   1. builds the Next app
#   2. stops the three services (brief downtime)
#   3. snapshots the live DB  MR/mrai/mrai.db -> ~/.mrai/mrai.db  (only if the source is newer; always backed up first)
#   4. renames the code folder  Claude/work/mrai-next -> Claude/work/MRAI
#   5. reinstalls the systemd units (python + edge now run from MRAI, data in ~/.mrai, logs in ~/.mrai/logs)
#   6. starts the services and checks health
set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"      # .../deploy
CODE="$(dirname "$SELF")"                                  # the code repo (mrai-next or MRAI)
PARENT="$(dirname "$CODE")"                                # .../Claude/work
CODE_NEW="$PARENT/MRAI"
DATA="$HOME/.mrai"
OLD_DEPLOY="$HOME/MR/mrai"                                 # the previous deployment location
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
sc() { systemctl --user "$@"; }

echo "==> 1/6 Building the Next app"
( cd "$CODE" && npm run build )

echo "==> 2/6 Stopping services (brief downtime)"
sc stop mrai-edge.service mrai-web.service mrai.service 2>/dev/null || true
# make sure the python port is free
pkill -f "mrai_server.py" 2>/dev/null || true
sleep 1

echo "==> 3/6 Migrating data to $DATA"
mkdir -p "$DATA/workspace/uploads" "$DATA/logs" "$DATA/state"
SRC_DB="$OLD_DEPLOY/mrai.db"
DST_DB="$DATA/mrai.db"
if [ -f "$DST_DB" ]; then cp -a "$DST_DB" "$DST_DB.bak-$(date +%Y%m%d-%H%M%S)"; fi
if [ -f "$SRC_DB" ] && { [ ! -f "$DST_DB" ] || [ "$SRC_DB" -nt "$DST_DB" ]; }; then
  python3 - "$SRC_DB" "$DST_DB" <<'PY'
import sqlite3, sys
s = sqlite3.connect(sys.argv[1]); d = sqlite3.connect(sys.argv[2])
with d: s.backup(d)
s.close(); d.close()
print("   DB snapshot updated from", sys.argv[1])
PY
else
  echo "   DB left as-is (already current in ~/.mrai)"
fi
[ -f "$DATA/token.key" ]  || { [ -f "$OLD_DEPLOY/token.key" ]  && cp -a "$OLD_DEPLOY/token.key"  "$DATA/"; }
[ -f "$DATA/access.key" ] || { [ -f "$OLD_DEPLOY/access.key" ] && cp -a "$OLD_DEPLOY/access.key" "$DATA/"; }
for d in uploads .jobs outputs users; do
  [ -d "$OLD_DEPLOY/workspace/$d" ] && [ ! -e "$DATA/workspace/$d" ] && cp -a "$OLD_DEPLOY/workspace/$d" "$DATA/workspace/" || true
done

echo "==> 4/6 Naming the code folder MRAI"
if [ "$CODE" != "$CODE_NEW" ]; then
  if [ -e "$CODE_NEW" ]; then
    echo "   $CODE_NEW already exists — skipping rename (move it aside if this is wrong)"
  else
    mv "$CODE" "$CODE_NEW"
    echo "   $CODE -> $CODE_NEW"
  fi
fi
cd "$CODE_NEW"

echo "==> 5/6 Installing systemd units"
bash "$CODE_NEW/deploy/install.sh"

echo "==> 6/6 Starting services"
sc start mrai.service
for i in $(seq 1 30); do curl -sf -m 1 http://127.0.0.1:8080/health >/dev/null 2>&1 && break; sleep 1; done
sc start mrai-web.service
for i in $(seq 1 30); do curl -sf -m 1 -o /dev/null http://127.0.0.1:3000/login 2>/dev/null && break; sleep 1; done
sc start mrai-edge.service
sleep 2
echo
echo "Done. Status:"
"$HOME/.local/bin/mrai" status || true
echo
echo "The app now runs from $CODE_NEW with data in $DATA."
echo "Once you confirm it works, $OLD_DEPLOY/{server,src,scripts,start.sh,...} can be removed (keep skills/ and work/)."
