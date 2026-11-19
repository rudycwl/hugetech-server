#!/usr/bin/env bash
# Pune la locul lor serviciile systemd și configurația Caddy din depozit. Rulat la instalare și la fiecare actualizare.
set -euo pipefail
DIR=/opt/hugetech-server
IP=$(cat /etc/hugetech-baza/ip)
IPL=${IP//./-}
install -m 644 "$DIR"/systemd/*.service "$DIR"/systemd/*.timer /etc/systemd/system/

# Adresele aplicațiilor: <sub>.<ip>.sslip.io și, opțional, domeniile din /etc/hugetech-aplicatii/domenii
# (un rând pe domeniu: „erp erp.hugetech.ro” sau „curieri app.edever.ro”; se pune după ce există înregistrarea DNS).
adrese() { # $1 = id, $2 = subdomeniu sslip
  local a="$2.$IPL.sslip.io"
  if [ -r /etc/hugetech-aplicatii/domenii ]; then
    while read -r id dom _; do
      if [ "$id" = "$1" ] && [[ "$dom" =~ ^[a-z0-9.-]+$ ]]; then a="$dom, $a"; fi
    done < /etc/hugetech-aplicatii/domenii
  fi
  echo "$a"
}

cat > /etc/caddy/Caddyfile <<CADDY
# Panoul serverului hugetech (doar cu cod). Adresa fără DNS: ${IPL}.sslip.io
${IPL}.sslip.io {
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
		-Server
	}
	reverse_proxy 127.0.0.1:3001
}

# ERP Hugetech (mutat de pe Render)
$(adrese erp erp) {
	encode gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	reverse_proxy 127.0.0.1:3010
}

# Hugetech Operațiuni / edever-curieri (aplicația Shopify; se deschide în adminul Shopify, deci fără X-Frame-Options)
$(adrese curieri app) {
	encode gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	reverse_proxy 127.0.0.1:3020
}
CADDY

# Serviciile aplicațiilor (pornesc singure doar când au variabilele completate) și timerele lor.
systemctl daemon-reload
systemctl enable hugetech-app-erp.service hugetech-app-curieri.service >/dev/null 2>&1 || true
systemctl enable --now hugetech-aplicatii.timer hugetech-ping.timer >/dev/null 2>&1 || true
