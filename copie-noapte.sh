#!/usr/bin/env bash
# Copia de noapte a bazelor erp și curieri (pg_dump -Fc), păstrată 14 zile pe disc.
set -euo pipefail
D=/var/backups/hugetech-baza
ZI=$(date -u +%F)
for DB in erp curieri; do
  runuser -u postgres -- pg_dump -Fc "$DB" > "$D/$DB-$ZI.dump.tmp"
  mv "$D/$DB-$ZI.dump.tmp" "$D/$DB-$ZI.dump"
done
chmod 600 "$D"/*.dump
find "$D" -name '*.dump' -mtime +14 -delete
date -u +%FT%TZ > /var/lib/hugetech-baza/ultima-copie
