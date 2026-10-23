#!/usr/bin/env bash
# MR AI ni shu kompyuterga o'rnatadi: systemd (user) servislari + `mrai` buyrug'i.
# Qayta ishga tushirmaydi, qayta ishlatish xavfsiz. Servis fayllaridagi /home/muhamad joriy $HOME ga almashtiriladi
# (loyiha papkalari: ~/MR/mrai va ~/Claude/work/mrai-next — boshqa joyda bo'lsa, servis fayllarini tahrirlang).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$UNIT_DIR" "$BIN_DIR"

for f in "$HERE"/systemd/*.service; do
  sed "s#/home/muhamad#$HOME#g" "$f" > "$UNIT_DIR/$(basename "$f")"
done
install -m 755 "$HERE/mrai" "$BIN_DIR/mrai"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user daemon-reload
systemctl --user enable mrai.service mrai-web.service mrai-edge.service

# Kirmasdan ham (reboot'dan keyin) servislar yonishi uchun
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  loginctl enable-linger "$USER" || sudo loginctl enable-linger "$USER"
fi

echo "O'rnatildi. Tekshirish: mrai status"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "Eslatma: $BIN_DIR PATH da yo'q — qo'shing." ;; esac
