// Aplicațiile mutate de pe Render pe serverul hugetech: ERP Hugetech și Hugetech Operațiuni (edever-curieri).
//   node aplicatii.mjs actualizeaza      – (timer, la 5 minute) ia main din GitHub, construiește într-un dosar nou, comută și repornește
//   node aplicatii.mjs porneste <id>     – (systemd) pornește aplicația ca utilizatorul „aplicatii”, cu variabilele din panou
// Variabilele stau în /etc/hugetech-aplicatii/<id>.json (0600, root); le completează Rudy în panou, pagina „Variabile”.
// Aplicația pornește doar când are variabilele obligatorii (fișierul <id>.gata) și o versiune construită (<id>.construit).
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

export const ETC_APL = '/etc/hugetech-aplicatii';
export const VAR_APL = '/var/lib/hugetech-aplicatii';
const OPT = '/opt/aplicatii';
const UTILIZATOR = 'aplicatii';
const citeste = (f, d = '') => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return d; } };
const IP = () => citeste('/etc/hugetech-baza/ip');

// v: [nume, obligatoriu, ajutor]. Restul variabilelor (de ex. MAIL_*_CERERI_*) se pot adăuga cu „Altă variabilă”.
export const APLICATII = {
  erp: {
    nume: 'ERP Hugetech', render: 'hugetech-erp', repo: 'rudycwl/hugetech-erp', port: 3010, sub: 'erp',
    serviciu: 'hugetech-app-erp',
    construieste: [['npm', 'ci', '--omit=dev', '--no-audit', '--no-fund']],
    inainte: [],
    porneste: ['node', 'src/server.js'],
    v: [
      ['DATABASE_URL', true, 'Exact valoarea din Render (adresa bazei erp de pe acest server). Parolele căsuțelor de e-mail sunt criptate cu ea: nu o schimba.'],
      ['SESSION_SECRET', true, 'Din Render (altfel toți utilizatorii trebuie să se autentifice din nou).'],
      ['ERP_ADMIN_EMAIL', false, ''],
      ['IMPORT_KEY', false, 'Aceeași ca pe NAS / GitHub (ERP_KEY).'], ['ASISTENT_KEY', false, 'Folosită de sarcinile Claude.'],
      ['SOLICITARI_KEY', false, ''], ['CHEIAMEA_ERP_KEY', false, 'Aceeași ca ERP_KEY din cheiamea.ro/configurare.'], ['CHEIAMEA_URL', false, 'implicit https://cheiamea.ro'],
      ['EDEVER_SHOPIFY_STORE', false, ''], ['EDEVER_SHOPIFY_CLIENT_ID', false, ''], ['EDEVER_SHOPIFY_CLIENT_SECRET', false, ''], ['EDEVER_SHOPIFY_TOKEN', false, ''],
      ['MAXBI_SHOPIFY_STORE', false, ''], ['MAXBI_SHOPIFY_CLIENT_ID', false, ''], ['MAXBI_SHOPIFY_CLIENT_SECRET', false, ''], ['MAXBI_SHOPIFY_TOKEN', false, ''],
      ['OBLIO_EMAIL', false, ''], ['OBLIO_SECRET', false, ''], ['OBLIO_CIF', false, ''], ['OBLIO_MOCK', false, ''],
      ['KMW_EMAIL', false, ''], ['KMW_PASSWORD', false, ''], ['KMW_CITIRE_AUTO', false, ''],
      ['MAIL_EDEVER_USER', false, ''], ['MAIL_EDEVER_PASS', false, ''], ['MAIL_EDEVER_HOST', false, ''], ['MAIL_EDEVER_PORT', false, ''], ['MAIL_EDEVER_IMAP_HOST', false, ''], ['MAIL_EDEVER_NUME', false, ''], ['MAIL_EDEVER_BREVO_KEY', false, ''],
      ['MAIL_MAXBI_USER', false, ''], ['MAIL_MAXBI_PASS', false, ''], ['MAIL_MAXBI_HOST', false, ''], ['MAIL_MAXBI_PORT', false, ''], ['MAIL_MAXBI_IMAP_HOST', false, ''], ['MAIL_MAXBI_NUME', false, ''], ['MAIL_MAXBI_BREVO_KEY', false, ''],
      ['MAIL_CHEIAMEA_USER', false, ''], ['MAIL_CHEIAMEA_PASS', false, ''], ['MAIL_CHEIAMEA_HOST', false, ''], ['MAIL_CHEIAMEA_PORT', false, ''], ['MAIL_CHEIAMEA_IMAP_HOST', false, ''], ['MAIL_CHEIAMEA_NUME', false, ''],
      ['MAIL_HUGETECH_USER', false, ''], ['MAIL_HUGETECH_PASS', false, ''], ['MAIL_HUGETECH_NUME', false, ''], ['MAIL_HUGETECH_BREVO_KEY', false, ''],
      ['ROYAL_USER', false, ''], ['ROYAL_PASS', false, ''], ['CATENA_USER', false, ''], ['CATENA_PASS', false, ''],
      ['KOFF_USER', false, ''], ['KOFF_PASS', false, ''], ['DESPEC_USER', false, ''], ['DESPEC_PASS', false, ''],
      ['DB_SCHEMA', false, 'implicit erp'], ['RENDER_EXTERNAL_URL', false, 'Adresa publică a ERP-ului (pusă automat).'], ['TINE_TREAZ', false, ''],
    ],
  },
  curieri: {
    nume: 'Hugetech Operațiuni (edever-curieri)', render: 'edever-curieri', repo: 'rudycwl/edever-curieri', port: 3020, sub: 'app',
    serviciu: 'hugetech-app-curieri',
    construieste: [['npm', 'ci', '--no-audit', '--no-fund'], ['node_modules/.bin/prisma', 'generate'], ['npm', 'run', 'build']],
    inainte: [['node_modules/.bin/prisma', 'migrate', 'deploy']],
    porneste: ['node_modules/.bin/react-router-serve', './build/server/index.js'],
    v: [
      ['DATABASE_URL', true, 'Exact valoarea din Render (baza curieri, deocamdată Neon).'],
      ['SHOPIFY_API_KEY', true, 'client_id al aplicației (847fd96f…).'], ['SHOPIFY_API_SECRET', true, 'Din Render.'],
      ['APP_ENCRYPTION_KEY', true, 'EXACT din Render: cu ea sunt criptate conturile curierilor din bază.'],
      ['SHOPIFY_APP_URL', true, 'Adresa nouă (pusă automat). Trebuie să fie aceeași cu application_url din Shopify.'],
      ['SCOPES', true, 'Din Render (pusă automat lista din shopify.app.toml).'],
      ['CRON_SECRET', false, ''], ['ERP_URL', false, 'Adresa nouă a ERP-ului (pusă automat).'], ['ERP_KEY', false, ''],
      ['SHOP_CUSTOM_DOMAIN', false, ''], ['MAXBI_SHOP', false, ''],
      ['EMAG_SHOP', false, ''], ['EMAG_API_USER', false, ''], ['EMAG_API_PASSWORD', false, ''], ['EMAG_PROXY_URL', false, ''], ['EMAG_APP_SHOP', false, ''],
      ['EMAG_APP_CLIENT_ID', false, ''], ['EMAG_APP_CLIENT_SECRET', false, ''], ['EMAG_SYNC_ACTIVE', false, ''], ['EMAG_ORDERS_ACTIVE', false, ''], ['EMAG_ORDERS_SINCE', false, ''],
      ['EMAG_FINANCIAR_ACTIVE', false, ''], ['EMAG_AWB_TELEFON', false, ''], ['EMAG_AWB_ADRESA_ID', false, ''],
      ['SMTP_HOST', false, ''], ['SMTP_PORT', false, ''], ['SMTP_USER', false, ''], ['SMTP_PASS', false, ''], ['SMTP_FROM', false, ''], ['BREVO_API_KEY', false, ''],
      ['OBLIO_EMAIL', false, ''], ['OBLIO_SECRET', false, ''], ['OBLIO_CIF', false, ''], ['OBLIO_SERIE', false, ''], ['OBLIO_SERIE_PROFORMA', false, ''], ['OBLIO_PROFORMA_AUTO', false, ''], ['OBLIO_AUTO_ACTIVE', false, ''],
      ['FACTURARE_DE_LA', false, ''], ['EMAIL_DOCUMENTE', false, ''], ['EMAIL_COPIE_FACTURI', false, ''], ['ALERTA_EMAIL', false, ''], ['NTFY_TOPIC', false, ''],
      ['TBI_URL', false, ''], ['TBI_AUTO_ACTIVE', false, ''], ['TBI_MAXBI_EMAIL_FROM', false, ''],
      ...['EDEVER', 'MAXBI'].flatMap((m) => ['USERNAME', 'PASSWORD', 'STORE_ID', 'PROVIDER_CODE', 'PRIV', 'PRIV_PASS', 'SFTL_PUB', 'EMAIL_FROM'].map((k) => [`TBI_${m}_${k}`, false, ''])),
      ['GCR_SECRET', false, ''], ['GCR_MERCHANT_ID', false, ''], ['RETRAGERE_SECRET', false, ''], ['RETRAGERE_COPIE_EDEVER', false, ''], ['RETRAGERE_COPIE_MAXBI', false, ''],
      ['FAN_PICKUP_ACTIVE', false, ''], ['LOCKER_LIPSA_ACTIVE', false, ''], ['STOC_LIMITAT_ACTIVE', false, ''], ['CONCURENTA_ACTIVE', false, ''], ['BF_MAXBI_ACTIVE', false, ''],
    ],
  },
};
const SCOPES_TOML = 'read_customers,write_customers,read_orders,write_orders,read_order_edits,write_order_edits,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_fulfillments,write_fulfillments,read_products,write_products,read_inventory,write_inventory,read_publications,write_publications,read_files,write_files,read_reports,read_analytics,read_marketing_events,read_discounts,write_discounts,read_locations,read_shipping,read_content,read_shopify_payments_payouts,read_delivery_customizations,write_delivery_customizations,read_draft_orders,write_draft_orders';
// Nu se iau din Render la import: sunt ale Render-ului sau trebuie să arate spre adresele noi.
export const NU_DIN_RENDER = ['NODE_VERSION', 'PORT', 'HOST', 'NODE_ENV', 'SHOPIFY_APP_URL', 'ERP_URL', 'RENDER_EXTERNAL_URL', 'TINE_TREAZ'];

// Adresa publică: domeniul din /etc/hugetech-aplicatii/domenii („erp erp.hugetech.ro”), altfel <sub>.<ip-cu-liniuțe>.sslip.io
export function domenii(id) {
  const extra = citeste(`${ETC_APL}/domenii`).split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p[0] === id && p[1]).map((p) => p[1]);
  return [...extra, `${APLICATII[id].sub}.${IP().replace(/\./g, '-')}.sslip.io`];
}
export const adresaPublica = (id) => `https://${domenii(id)[0]}`;

// Valori implicite, folosite doar dacă Rudy nu a pus altceva.
export function implicite(id) {
  if (id === 'erp') {
    const p = citeste('/etc/hugetech-baza/parola-erp');
    return { DATABASE_URL: p ? `postgresql://erp:${p}@${IP()}:5432/erp` : '', RENDER_EXTERNAL_URL: adresaPublica('erp'), TINE_TREAZ: '0', EDEVER_SHOPIFY_STORE: 'a2q30i-zx.myshopify.com' };
  }
  return { SHOPIFY_APP_URL: adresaPublica('curieri'), ERP_URL: adresaPublica('erp'), SCOPES: SCOPES_TOML };
}
export const valori = (id) => { try { return JSON.parse(fs.readFileSync(`${ETC_APL}/${id}.json`, 'utf8')); } catch { return {}; } };
export const efective = (id) => ({ ...implicite(id), ...Object.fromEntries(Object.entries(valori(id)).filter(([, x]) => x !== '')) });
export const lipsa = (id) => APLICATII[id].v.filter(([k, ob]) => ob && !efective(id)[k]).map(([k]) => k);

// Scrie variabilele (0600) și marcajul „gata”; repornește aplicația dacă e gata.
export function salveaza(id, noi) {
  fs.mkdirSync(ETC_APL, { recursive: true, mode: 0o700 });
  const f = `${ETC_APL}/${id}.json`, tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(noi, null, 1), { mode: 0o600 }); fs.renameSync(tmp, f);
  const gata = `${ETC_APL}/${id}.gata`;
  if (lipsa(id).length) { fs.rmSync(gata, { force: true }); spawnSync('systemctl', ['stop', APLICATII[id].serviciu]); return false; }
  fs.writeFileSync(gata, new Date().toISOString(), { mode: 0o600 });
  spawnSync('systemctl', ['enable', APLICATII[id].serviciu]);
  spawnSync('systemctl', ['restart', APLICATII[id].serviciu]);
  return true;
}

export function stareServiciu(id) {
  const r = spawnSync('systemctl', ['show', APLICATII[id].serviciu, '-p', 'ActiveState,SubState,ActiveEnterTimestamp,NRestarts'], { encoding: 'utf8' });
  return Object.fromEntries((r.stdout || '').trim().split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
}
export const construit = (id) => citeste(`${VAR_APL}/${id}.construit`);
export const ultimaConstruire = (id) => { try { return JSON.parse(fs.readFileSync(`${VAR_APL}/${id}.ultima.json`, 'utf8')); } catch { return {}; } };

// ---------- actualizare ----------
const uidgid = () => {
  const u = Number(spawnSync('id', ['-u', UTILIZATOR], { encoding: 'utf8' }).stdout.trim());
  const g = Number(spawnSync('id', ['-g', UTILIZATOR], { encoding: 'utf8' }).stdout.trim());
  return { uid: u, gid: g };
};
// proxy-ul (dacă serverul ar avea unul) trece mai departe; altfel nimic din mediul root.
const proxy = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(https?_proxy|no_proxy|HTTPS?_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|GIT_SSL_CAINFO)$/.test(k)));
const envBaza = () => ({ PATH: '/usr/local/bin:/usr/bin:/bin', HOME: `${VAR_APL}/acasa`, npm_config_cache: `${VAR_APL}/npm-cache`, LANG: 'C.UTF-8', ...proxy() });
function cmd(c, args, o = {}) {
  const r = spawnSync(c, args, { encoding: 'utf8', maxBuffer: 64e6, ...o });
  if (r.status !== 0) throw new Error(`${c} ${args.join(' ')}: ${(r.stderr || r.stdout || String(r.error || '')).trim().split('\n').slice(-15).join('\n')}`);
  return (r.stdout || '').trim();
}
function git(args, cwd) {
  const t = citeste(`${ETC_APL}/github-token`);
  const extra = t ? ['-c', `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${t}`).toString('base64')}`] : [];
  return cmd('git', [...extra, ...args], { cwd, env: { PATH: '/usr/bin:/bin', HOME: '/root', GIT_TERMINAL_PROMPT: '0', ...proxy() } });
}

function pregateste() {
  if (spawnSync('id', ['-u', UTILIZATOR]).status !== 0) cmd('useradd', ['--system', '--home-dir', `${VAR_APL}/acasa`, '--shell', '/usr/sbin/nologin', UTILIZATOR]);
  fs.mkdirSync(ETC_APL, { recursive: true, mode: 0o700 }); fs.chmodSync(ETC_APL, 0o700);
  const { uid, gid } = uidgid();
  for (const d of [VAR_APL, `${VAR_APL}/acasa`, `${VAR_APL}/npm-cache`, OPT]) { fs.mkdirSync(d, { recursive: true }); }
  for (const d of [`${VAR_APL}/acasa`, `${VAR_APL}/npm-cache`]) fs.chownSync(d, uid, gid);
  // ERP-ul se conectează la baza lui prin IP-ul public (adresa e și cheia de criptare a parolelor); din server, direct local.
  const ip = IP();
  if (ip) {
    const regula = ['-t', 'nat', 'OUTPUT', '-d', `${ip}/32`, '-p', 'tcp', '--dport', '5432', '-j', 'REDIRECT', '--to-ports', '5432'];
    const [t, n, lant, ...rest] = regula;
    if (spawnSync('iptables', [t, n, '-C', lant, ...rest]).status !== 0) { spawnSync('iptables', [t, n, '-A', lant, ...rest]); spawnSync('netfilter-persistent', ['save']); }
  }
}

function actualizeaza(id) {
  const a = APLICATII[id], baza = `${OPT}/${id}`, sursa = `${baza}/sursa`;
  fs.mkdirSync(`${baza}/versiuni`, { recursive: true });
  if (!fs.existsSync(`${sursa}/.git`)) {
    if (!citeste(`${ETC_APL}/github-token`)) return { id, eroare: 'lipsește cheia GitHub (panou → Variabile)' };
    git(['clone', '-q', '--no-checkout', `https://github.com/${a.repo}.git`, sursa]);
  }
  git(['fetch', '-q', 'origin', 'main'], sursa);
  const commit = git(['rev-parse', 'origin/main'], sursa), scurt = commit.slice(0, 7);
  if (construit(id) === commit) return { id, commit: scurt, neschimbat: true };
  const ultima = ultimaConstruire(id);
  if (ultima.commit === commit && ultima.eroare && Date.now() - Date.parse(ultima.la) < 15 * 60e3) return { id, commit: scurt, eroare: 'construirea a eșuat; reîncerc în 15 minute, la un commit nou sau cu „Construiește acum”' };
  const dir = `${baza}/versiuni/${scurt}`;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const jurnal = `${VAR_APL}/${id}-construire.log`;
  const scrieUltima = (o) => fs.writeFileSync(`${VAR_APL}/${id}.ultima.json`, JSON.stringify({ commit, la: new Date().toISOString(), ...o }));
  try {
    cmd('bash', ['-o', 'pipefail', '-c', `git -C "$1" archive "$2" | tar -x -C "$3"`, '_', sursa, commit, dir]);
    const { uid, gid } = uidgid();
    cmd('chown', ['-R', `${uid}:${gid}`, dir]);
    fs.writeFileSync(jurnal, `construire ${id} ${scurt} ${new Date().toISOString()}\n`);
    for (const [c, ...args] of a.construieste) {
      // Construirea Vite/React Router are nevoie de memorie; serverul are 12 GB, dăm până la 4 GB.
      const r = spawnSync(c, args, { cwd: dir, uid, gid, encoding: 'utf8', maxBuffer: 256e6, env: { ...envBaza(), NODE_OPTIONS: '--max-old-space-size=4096', NODE_ENV: c === 'npm' && args[0] === 'ci' ? 'development' : 'production' } });
      fs.appendFileSync(jurnal, `$ ${c} ${args.join(' ')}\n${r.stdout || ''}${r.stderr || ''}\n`);
      if (r.status !== 0) throw new Error(`${c} ${args.join(' ')} a eșuat (jurnal: ${jurnal})`);
    }
    const leg = `${baza}/curent`, tmp = `${leg}.tmp`;
    fs.rmSync(tmp, { force: true }); fs.symlinkSync(dir, tmp); fs.renameSync(tmp, leg);
    fs.writeFileSync(`${VAR_APL}/${id}.construit`, commit);
    scrieUltima({ ok: true });
    // păstrăm versiunea curentă și una anterioară
    const vechi = fs.readdirSync(`${baza}/versiuni`).map((d) => `${baza}/versiuni/${d}`).filter((d) => d !== dir)
      .sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs).slice(1);
    for (const d of vechi) fs.rmSync(d, { recursive: true, force: true });
    if (fs.existsSync(`${ETC_APL}/${id}.gata`)) { spawnSync('systemctl', ['enable', a.serviciu]); spawnSync('systemctl', ['restart', a.serviciu]); }
    return { id, commit: scurt, construit: true };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    scrieUltima({ ok: false, eroare: String(e.message || e).slice(0, 2000) });
    return { id, commit: scurt, eroare: String(e.message || e) };
  }
}

// ---------- pornire (rulat de systemd ca root; aplicația rulează ca „aplicatii”) ----------
async function porneste(id) {
  const a = APLICATII[id];
  if (!a) { console.error('aplicație necunoscută'); process.exit(2); }
  const lip = lipsa(id);
  if (lip.length) { console.error(`aștept variabilele: ${lip.join(', ')}`); process.exit(0); }
  const dir = fs.realpathSync(`${OPT}/${id}/curent`);
  const { uid, gid } = uidgid();
  const env = { ...envBaza(), NODE_ENV: 'production', PORT: String(a.port), RENDER_GIT_COMMIT: citeste(`${VAR_APL}/${id}.construit`), ...efective(id) };
  if (id === 'curieri') { env.HOST = '127.0.0.1'; env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = '1'; }
  delete env.npm_config_cache;
  const ruleaza = (c, args) => new Promise((rez) => {
    const p = spawn(c, args, { cwd: dir, uid, gid, env, stdio: 'inherit' });
    const opreste = (s) => p.kill(s);
    process.on('SIGTERM', opreste); process.on('SIGINT', opreste);
    p.on('exit', (cod, semnal) => { process.off('SIGTERM', opreste); process.off('SIGINT', opreste); rez(cod ?? (semnal ? 1 : 0)); });
  });
  for (const [c, ...args] of a.inainte) { const cod = await ruleaza(c, args); if (cod !== 0) process.exit(cod); }
  const [c, ...args] = a.porneste;
  process.exit(await ruleaza(c, args));
}

if (process.argv[1]?.endsWith('aplicatii.mjs')) {
  const [, , comanda, id] = process.argv;
  if (comanda === 'porneste') porneste(id);
  else if (comanda === 'actualizeaza') {
    const blocat = `${VAR_APL}/actualizare.lock`;
    fs.mkdirSync(VAR_APL, { recursive: true });
    pregateste();
    let fd; try { fd = fs.openSync(blocat, 'wx'); } catch { if (Date.now() - fs.statSync(blocat).mtimeMs < 3 * 3600e3) process.exit(0); fs.rmSync(blocat); fd = fs.openSync(blocat, 'wx'); }
    try { for (const id of (process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(APLICATII))) { let r; try { r = actualizeaza(id); } catch (e) { r = { id, eroare: String(e.message || e).slice(0, 500) }; } console.log(JSON.stringify(r)); } }
    finally { fs.closeSync(fd); fs.rmSync(blocat, { force: true }); }
  } else { console.error('folosire: aplicatii.mjs actualizeaza [id…] | porneste <id>'); process.exit(2); }
}

export const ultimeleCaractere = (x) => { const s = String(x ?? ''); return s ? `…${s.slice(-4)} (${s.length} caractere)` : ''; };
