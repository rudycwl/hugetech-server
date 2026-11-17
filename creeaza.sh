#!/usr/bin/env bash
# Creează în Oracle Cloud serverul „hugetech” (bazele de date ERP + eDever), separat de CheiaMea.
# Se rulează în Oracle Cloud Shell (iconița >_ din dreapta sus), unde `oci` e deja conectat la cont:
#   curl -fsSL https://raw.githubusercontent.com/rudycwl/hugetech-server/main/creeaza.sh | bash -s <cod-configurare>
# Poate fi rulat de mai multe ori: refolosește ce există. Dacă Oracle n-are loc („Out of host capacity”), reîncearcă singur.
set -euo pipefail
COD="${1:?lipsește codul de configurare}"
T="${OCI_TENANCY:?nu găsesc contul (rulează comanda în Oracle Cloud Shell)}"
NUME=hugetech
q() { "$@" --raw-output 2>/dev/null | sed 's/^null$//'; }

echo "1/5 Rețeaua..."
VCN=$(q oci network vcn list -c "$T" --display-name $NUME-vcn --lifecycle-state AVAILABLE --query 'data[0].id')
[ -n "$VCN" ] || VCN=$(q oci network vcn create -c "$T" --cidr-block 10.1.0.0/16 --display-name $NUME-vcn --dns-label $NUME --wait-for-state AVAILABLE --query data.id)
IGW=$(q oci network internet-gateway list -c "$T" --vcn-id "$VCN" --query 'data[0].id')
[ -n "$IGW" ] || IGW=$(q oci network internet-gateway create -c "$T" --vcn-id "$VCN" --is-enabled true --display-name $NUME-igw --wait-for-state AVAILABLE --query data.id)
RT=$(q oci network vcn get --vcn-id "$VCN" --query 'data."default-route-table-id"')
SL=$(q oci network vcn get --vcn-id "$VCN" --query 'data."default-security-list-id"')
oci network route-table update --rt-id "$RT" --force \
  --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW\"}]" >/dev/null

echo "2/5 Porturile 22, 80, 443 și 5432 (PostgreSQL, doar cu SSL și parolă)..."
port() { echo "{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":$1,\"max\":$1}}}"; }
oci network security-list update --security-list-id "$SL" --force \
  --ingress-security-rules "[$(port 22),$(port 80),$(port 443),$(port 5432),{\"source\":\"0.0.0.0/0\",\"protocol\":\"1\",\"icmpOptions\":{\"type\":3,\"code\":4}}]" \
  --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all"}]' >/dev/null

SUB=$(q oci network subnet list -c "$T" --vcn-id "$VCN" --lifecycle-state AVAILABLE --query 'data[0].id')
[ -n "$SUB" ] || SUB=$(q oci network subnet create -c "$T" --vcn-id "$VCN" --cidr-block 10.1.0.0/24 --display-name $NUME-subnet --dns-label public --wait-for-state AVAILABLE --query data.id)

echo "3/5 Cheia SSH (rămâne în Cloud Shell, în ~/.ssh/hugetech)..."
[ -f ~/.ssh/hugetech.pub ] || { mkdir -p ~/.ssh && ssh-keygen -q -t rsa -b 4096 -N '' -f ~/.ssh/hugetech; }

cat > /tmp/hugetech-cloud-init.yaml <<CI
#cloud-config
runcmd:
  - curl -fsSL https://raw.githubusercontent.com/rudycwl/hugetech-server/main/instaleaza.sh -o /root/instaleaza.sh
  - bash /root/instaleaza.sh $COD > /var/log/hugetech-instalare.log 2>&1
CI

echo "4/5 Mașina virtuală (ARM, 2 procesoare, 12 GB – partea gratuită rămasă)..."
ID=$(q oci compute instance list -c "$T" --display-name $NUME --lifecycle-state RUNNING --query 'data[0].id')
if [ -z "$ID" ]; then
  ADS=$(oci iam availability-domain list -c "$T" --query 'data[].name' --raw-output | tr -d '[]", ' | grep -v '^$')
  IMG=$(q oci compute image list -c "$T" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
    --shape VM.Standard.A1.Flex --sort-by TIMECREATED --sort-order DESC --limit 1 --query 'data[0].id')
  [ -n "$IMG" ] || { echo "EROARE: nu găsesc imaginea Ubuntu 24.04 pentru ARM"; exit 1; }
  for INCERCARE in $(seq 1 60); do
    for AD in $ADS; do
      echo "   încercarea $INCERCARE în $AD..."
      if ID=$(oci compute instance launch -c "$T" --availability-domain "$AD" --shape VM.Standard.A1.Flex \
        --shape-config '{"ocpus":2,"memoryInGBs":12}' --boot-volume-size-in-gbs 50 \
        --image-id "$IMG" --subnet-id "$SUB" --assign-public-ip true --display-name $NUME \
        --ssh-authorized-keys-file ~/.ssh/hugetech.pub --user-data-file /tmp/hugetech-cloud-init.yaml \
        --wait-for-state RUNNING --query data.id --raw-output 2>>/tmp/hugetech-erori.log) && [ -n "$ID" ]; then break 2; fi
      ID=""
    done
    grep -ho '"message": "[^"]*"' /tmp/hugetech-erori.log | tail -n 1 || true
    echo "   Oracle n-are loc acum; reîncerc peste 60 de secunde (Ctrl+C oprește)."; sleep 60
  done
  [ -n "$ID" ] || { echo "EROARE: mașina nu a pornit după 60 de încercări."; exit 1; }
fi

echo "5/5 Adresa IP..."
IP=$(q oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"')
echo
echo "=============================================="
echo "  GATA. Adresa IP a serverului: $IP"
echo "  Panoul (în ~5 minute): https://${IP//./-}.sslip.io"
echo "=============================================="
