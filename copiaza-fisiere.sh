#!/usr/bin/env bash
# Pune la locul lor serviciile systemd și configurația Caddy din depozit. Rulat la instalare și la fiecare actualizare.
set -euo pipefail
DIR=/opt/hugetech-server
IP=$(cat /etc/hugetech-baza/ip)
install -m 644 "$DIR"/systemd/*.service "$DIR"/systemd/*.timer /etc/systemd/system/
cat > /etc/caddy/Caddyfile <<CADDY
# Panoul serverului hugetech (doar cu cod). Adresa fără DNS: ${IP//./-}.sslip.io
${IP//./-}.sslip.io {
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
		-Server
	}
	reverse_proxy 127.0.0.1:3001
}
CADDY
