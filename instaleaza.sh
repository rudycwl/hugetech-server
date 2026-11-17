#!/usr/bin/env bash
# Pregătește serverul „hugetech” (Ubuntu 24.04 ARM, Oracle Always Free): PostgreSQL 18 pentru ERP și eDever,
# panoul de mutare din Neon (HTTPS, cu cod) și copiile de noapte. Rulează o singură dată, ca root, din cloud-init.
set -euxo pipefail
COD="${1:?lipsește codul de configurare}"
REPO=https://github.com/rudycwl/hugetech-server.git
DIR=/opt/hugetech-server
export DEBIAN_FRONTEND=noninteractive
export HOME="${HOME:-/root}"

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

# Imaginile Ubuntu de la Oracle blochează tot în afară de SSH.
for p in 80 443 5432; do
  iptables -C INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$p" -j ACCEPT
done
netfilter-persistent save || true

# PostgreSQL 18 din depozitul oficial (pg_dump trebuie să fie cel puțin cât versiunea de la Neon).
install -d /usr/share/postgresql-common/pgdg
curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# Node.js 22 (panoul) și Caddy (HTTPS automat pentru panou)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y postgresql-18 nodejs caddy

# Setările bazei: ascultă pe toate adresele, dar intrarea din afară e doar cu SSL, parolă scram și doar pe bazele erp/curieri.
CONF=/etc/postgresql/18/main
cat > $CONF/conf.d/hugetech.conf <<'PG'
listen_addresses = '*'
ssl = on
password_encryption = 'scram-sha-256'
shared_buffers = '1GB'
effective_cache_size = '6GB'
work_mem = '16MB'
maintenance_work_mem = '256MB'
max_connections = 100
log_connections = off
PG
if ! grep -q 'hugetech-server' $CONF/pg_hba.conf; then
  cat >> $CONF/pg_hba.conf <<'HBA'
# hugetech-server: doar ERP-ul și aplicația eDever, doar cu SSL
hostssl erp     erp     0.0.0.0/0 scram-sha-256
hostssl erp     erp     ::/0      scram-sha-256
hostssl curieri curieri 0.0.0.0/0 scram-sha-256
hostssl curieri curieri ::/0      scram-sha-256
host    all     all     0.0.0.0/0 reject
host    all     all     ::/0      reject
HBA
fi
systemctl restart postgresql

umask 077
mkdir -p /etc/hugetech-baza /var/lib/hugetech-baza/lucru /var/backups/hugetech-baza
echo -n "$COD" > /etc/hugetech-baza/cod
for DB in erp curieri; do
  [ -s /etc/hugetech-baza/parola-$DB ] || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40 > /etc/hugetech-baza/parola-$DB
  P=$(cat /etc/hugetech-baza/parola-$DB)
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB') THEN CREATE ROLE $DB LOGIN; END IF;
END \$\$;
ALTER ROLE $DB WITH LOGIN PASSWORD '$P';
SQL
  runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || runuser -u postgres -- createdb -O $DB $DB
done
umask 022

# Adresa publică (pentru panou și adresele de conectare).
IP=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)
echo -n "$IP" > /etc/hugetech-baza/ip

[ -d "$DIR/.git" ] || git clone "$REPO" "$DIR"
bash "$DIR/copiaza-fisiere.sh"
systemctl daemon-reload
systemctl enable --now caddy hugetech-panou.service hugetech-copie.timer hugetech-actualizare.timer
systemctl reload caddy || systemctl restart caddy
echo "hugetech-server: instalare terminată. Panoul: https://${IP//./-}.sslip.io"
