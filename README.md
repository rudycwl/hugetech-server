# hugetech-server

Scripturile serverului **hugetech** (Oracle Cloud Always Free, Frankfurt): PostgreSQL 18 pentru bazele
**ERP Hugetech** (`erp`) și **aplicația eDever** (`curieri`), mutate de pe Neon (planul gratuit are limită lunară).
Depozitul nu conține parole, chei sau date: parolele se generează pe server, în `/etc/hugetech-baza` (0600).

## Creare
În Oracle Cloud Shell (contul hugetech):
```
curl -fsSL https://raw.githubusercontent.com/rudycwl/hugetech-server/main/creeaza.sh | bash -s <cod-configurare>
```
Face rețeaua `hugetech-vcn` (porturi 22, 80, 443, 5432), mașina `hugetech` (VM.Standard.A1.Flex, 2 OCPU, 12 GB,
disc 50 GB) și pornește `instaleaza.sh` din cloud-init (jurnal: `/var/log/hugetech-instalare.log`).

## Mutarea unei baze din Neon
Panoul: `https://<ip-cu-liniuțe>.sslip.io` (intrare cu codul de configurare).
1. Lipești adresa Neon (valoarea `DATABASE_URL` din Render) și apeși „Copiază din Neon”: pg_dump → pg_restore → numărare rând cu rând pe fiecare tabel.
   La ERP, parolele căsuțelor de e-mail (`cereri_casute`, criptate cu o cheie din `DATABASE_URL`) se recriptează pentru adresa nouă.
2. Imediat înainte de comutare: încă o dată „Copiază din Neon” (adresa rămâne salvată), apoi în Render înlocuiești `DATABASE_URL` cu „Adresa nouă”.
3. „Am comutat” șterge adresa Neon salvată.

Securitate: PostgreSQL acceptă din afară doar `hostssl`, scram-sha-256, doar utilizatorii `erp`/`curieri` pe baza lor; restul e respins.

## Întreținere
- Copia de noapte: `pg_dump -Fc` la 02:30 UTC în `/var/backups/hugetech-baza`, 14 zile.
- Actualizare: serverul ia singur `main` la 5 minute (`actualizeaza.sh`), fără să întrerupă o copiere.
- Stare publică, fără secrete: `/stare`.
