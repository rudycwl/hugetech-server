#!/usr/bin/env bash
# Ia ultima versiune a scripturilor de pe GitHub (main) și repornește panoul doar dacă s-a schimbat ceva
# și nu rulează o copiere.
set -euo pipefail
DIR=/opt/hugetech-server
cd "$DIR"
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
[ -e /var/lib/hugetech-baza/ruleaza ] && { echo "copiere în curs; actualizez data viitoare"; exit 0; }
git reset -q --hard origin/main
bash "$DIR/copiaza-fisiere.sh"
systemctl daemon-reload
systemctl reload caddy || true
systemctl restart hugetech-panou.service
echo "actualizat la $(git rev-parse --short HEAD)"
