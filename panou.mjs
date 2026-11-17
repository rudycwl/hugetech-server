// Panoul serverului hugetech: starea bazelor erp/curieri și mutarea lor din Neon (copie completă + verificare rând cu rând).
// Rulează ca root pe 127.0.0.1:3001, în spatele Caddy (HTTPS). Intrarea e cu codul din /etc/hugetech-baza/cod.
// Adresa Neon lipită aici e folosită doar pentru copiere; se păstrează (0600) până apeși „Am comutat”, ca să poți recopia.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const ETC = '/etc/hugetech-baza', VAR = '/var/lib/hugetech-baza', LUCRU = `${VAR}/lucru`;
const STARE = `${VAR}/stare.json`, RULEAZA = `${VAR}/ruleaza`, JURNAL = `${VAR}/jurnal.txt`;
const BAZE = { erp: 'ERP Hugetech', curieri: 'Aplicația eDever (edever-curieri)' };
const citeste = (f, d = '') => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return d; } };
const COD = citeste(`${ETC}/cod`);
const IP = citeste(`${ETC}/ip`);
const stare = () => { try { return JSON.parse(fs.readFileSync(STARE, 'utf8')); } catch { return {}; } };
const scrieStare = (s) => fs.writeFileSync(STARE, JSON.stringify(s, null, 1), { mode: 0o600 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const jurnal = (t) => fs.appendFileSync(JURNAL, `${new Date().toISOString()} ${t}\n`, { mode: 0o600 });

// Adresa nouă de conectare, de pus în Render la DATABASE_URL.
// ERP-ul (pg) cere singur SSL fără verificarea certificatului; Prisma (edever-curieri) are nevoie de parametrii în adresă.
export function adresaNoua(db) {
  const p = citeste(`${ETC}/parola-${db}`);
  const baza = `postgresql://${db}:${p}@${IP}:5432/${db}`;
  return db === 'curieri' ? `${baza}?sslmode=require&sslaccept=accept_invalid_certs` : baza;
}

// ---------- intrarea cu cod ----------
const semn = (exp) => crypto.createHmac('sha256', COD).update(`panou:${exp}`).digest('hex');
const cookie = () => { const exp = Date.now() + 12 * 3600e3; return `hp=${exp}.${semn(exp)}`; };
function autentificat(req) {
  const m = /(?:^|;\s*)hp=(\d+)\.([0-9a-f]{64})/.exec(req.headers.cookie || '');
  if (!m || Number(m[1]) < Date.now()) return false;
  const a = Buffer.from(m[2]), b = Buffer.from(semn(m[1]));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const incercari = [];
function codBun(c) {
  const ora = Date.now() - 3600e3; while (incercari.length && incercari[0] < ora) incercari.shift();
  if (incercari.length >= 10) return false; // prea multe încercări greșite în ultima oră
  const a = crypto.createHash('sha256').update(String(c || '')).digest(), b = crypto.createHash('sha256').update(COD).digest();
  const ok = COD.length >= 16 && crypto.timingSafeEqual(a, b);
  if (!ok) incercari.push(Date.now());
  return ok;
}

// ---------- comenzi ----------
function ruleaza(cmd, args, { env = {}, intrare, fisier } = {}) {
  return new Promise((rez, resp) => {
    const p = spawn(cmd, args, { env: { PATH: process.env.PATH, ...env }, stdio: [intrare ? 'pipe' : 'ignore', fisier ? fs.openSync(fisier, 'w', 0o600) : 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout?.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    if (intrare) p.stdin.end(intrare);
    p.on('error', resp);
    p.on('close', (cod) => rez({ cod, out, err }));
  });
}
const caPostgres = (cmd, args, o) => ruleaza('runuser', ['-u', 'postgres', '--', cmd, ...args], o);
async function sqlLocal(db, sql) {
  const r = await caPostgres('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-AtX', '-F', '\t', '-c', sql]);
  if (r.cod !== 0) throw new Error(r.err.trim());
  return r.out;
}
function envNeon(adresa) {
  const u = new URL(adresa);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('Adresa trebuie să înceapă cu postgresql://');
  return {
    PGHOST: u.hostname.replace('-pooler.', '.'), PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || 'neondb', PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '30',
  };
}
async function sqlNeon(env, sql) {
  const r = await ruleaza('psql', ['-v', 'ON_ERROR_STOP=1', '-AtX', '-F', '\t', '-c', sql], { env });
  if (r.cod !== 0) throw new Error(r.err.trim());
  return r.out;
}
// Numărul de rânduri din fiecare tabel (exact, cu count(*)).
const SQL_RANDURI = `select table_schema||'.'||table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema') order by 1`;
const randuri = (txt) => Object.fromEntries(txt.trim().split('\n').filter(Boolean).map((l) => { const [t, n] = l.split('\t'); return [t, Number(n)]; }));

// ERP: parolele căsuțelor de e-mail (cereri_casute) sunt criptate cu o cheie făcută din DATABASE_URL.
// La mutare le recriptăm cu cheia noii adrese, ca ERP-ul să le poată citi în continuare.
const cheie = (url) => crypto.createHash('sha256').update(`cereri-casute:${url}`).digest();
function recripteaza(t, vechi, nou) {
  const [iv, tag, x] = t.split('.').map((b) => Buffer.from(b, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', vechi, iv); d.setAuthTag(tag);
  const clar = Buffer.concat([d.update(x), d.final()]);
  const iv2 = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', nou, iv2);
  const y = Buffer.concat([c.update(clar), c.final()]);
  return [iv2, c.getAuthTag(), y].map((b) => b.toString('base64')).join('.');
}

async function copiaza(db, adresaNeon) {
  const s = stare(); const rez = { la: new Date().toISOString(), ok: false, etapa: 'pornire' };
  const pas = (e) => { rez.etapa = e; jurnal(`${db}: ${e}`); s[db] = { ...(s[db] || {}), copiere: rez }; scrieStare(s); };
  fs.writeFileSync(RULEAZA, db);
  try {
    const env = envNeon(adresaNeon);
    pas('conectare la Neon');
    rez.neon = (await sqlNeon(env, 'show server_version')).trim();
    pas('copiere din Neon (pg_dump)');
    const dump = `${LUCRU}/${db}.dump`;
    let r = await ruleaza('pg_dump', ['-Fc', '--no-owner', '--no-acl', '-f', dump], { env });
    if (r.cod !== 0) throw new Error(`pg_dump: ${r.err.trim()}`);
    const uid = Number((await ruleaza('id', ['-u', 'postgres'])).out.trim()); fs.chownSync(dump, uid, uid); // citit de postgres la restaurare
    pas('pregătire bază locală');
    await caPostgres('psql', ['-AtX', '-c', `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${db}' and pid <> pg_backend_pid()`]);
    r = await caPostgres('dropdb', ['--if-exists', '--force', db]); if (r.cod !== 0) throw new Error(r.err.trim());
    r = await caPostgres('createdb', ['-O', db, db]); if (r.cod !== 0) throw new Error(r.err.trim());
    pas('restaurare (pg_restore)');
    r = await caPostgres('pg_restore', ['--no-owner', '--no-acl', `--role=${db}`, '-d', db, dump]);
    const erori = r.err.split('\n').filter((l) => /error:/i.test(l) && !/schema "public" already exists|extension "plpgsql"/.test(l));
    fs.rmSync(dump, { force: true });
    if (erori.length) throw new Error(`pg_restore: ${erori.slice(0, 5).join(' | ')}`);
    pas('verificare rânduri');
    const [rn, rl] = [randuri(await sqlNeon(env, SQL_RANDURI)), randuri(await sqlLocal(db, SQL_RANDURI))];
    const dif = [...new Set([...Object.keys(rn), ...Object.keys(rl)])].filter((t) => rn[t] !== rl[t]).map((t) => `${t}: Neon ${rn[t] ?? '–'} / aici ${rl[t] ?? '–'}`);
    rez.tabele = Object.keys(rl).length; rez.randuri = Object.values(rl).reduce((a, b) => a + b, 0); rez.diferente = dif;
    if (db === 'erp' && rl['public.cereri_casute'] > 0) {
      pas('recriptare parole căsuțe e-mail');
      const vechi = cheie(adresaNeon), nou = cheie(adresaNoua(db)); let bune = 0, rele = 0;
      for (const l of (await sqlLocal(db, 'select id, parola from cereri_casute')).trim().split('\n').filter(Boolean)) {
        const [id, parola] = l.split('\t');
        try { const p = recripteaza(parola, vechi, nou); await sqlLocal(db, `update cereri_casute set parola = '${p.replace(/'/g, "''")}' where id = ${Number(id)}`); bune++; } catch { rele++; }
      }
      rez.casute = { recriptate: bune, nereusite: rele };
    }
    rez.ok = dif.length === 0; pas(rez.ok ? 'gata – identic cu Neon' : 'gata, dar cu diferențe');
    return rez;
  } catch (e) {
    rez.ok = false; rez.eroare = String(e.message || e).replace(/postgres(ql)?:\/\/[^\s]+/g, '[adresă]'); pas('eroare');
    return rez;
  } finally { fs.rmSync(RULEAZA, { force: true }); }
}

// ---------- pagini ----------
async function situatie() {
  const s = stare(), linii = [];
  for (const db of Object.keys(BAZE)) {
    let marime = '–', conexiuni = '–';
    try { marime = (await sqlLocal(db, `select pg_size_pretty(pg_database_size('${db}'))`)).trim(); } catch {}
    try { conexiuni = (await sqlLocal(db, `select count(*) from pg_stat_activity where datname = '${db}' and usename = '${db}'`)).trim(); } catch {}
    linii.push({ db, marime, conexiuni, ...s[db], sursaSalvata: fs.existsSync(`${ETC}/neon-${db}`) });
  }
  return linii;
}
const pagina = (corp, reincarca) => `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${reincarca ? '<meta http-equiv="refresh" content="5">' : ''}<title>Server hugetech</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1d2433;background:#f6f7f9}
section{background:#fff;border:1px solid #d9dde3;border-radius:8px;padding:16px 20px;margin:16px 0}h1{font-size:22px}h2{font-size:18px;margin:0 0 8px}
.ok{color:#0a7a32}.rau{color:#b42318}textarea,input[type=password]{width:100%;font:14px monospace;box-sizing:border-box;padding:8px}
button{font:inherit;padding:8px 14px;margin:8px 8px 0 0;cursor:pointer}small{color:#5b6472}code{word-break:break-all}</style></head><body>${corp}</body></html>`;

function sectiune(x) {
  const c = x.copiere || {};
  const st = !c.la ? 'încă nu s-a copiat' : c.etapa === 'eroare' ? `<span class="rau">eroare: ${esc(c.eroare)}</span>`
    : `<span class="${c.ok ? 'ok' : 'rau'}">${esc(c.etapa)}</span> · ${esc(c.tabele ?? '')} tabele, ${esc(c.randuri ?? '')} rânduri · Neon ${esc(c.neon ?? '')}`;
  const dif = (c.diferente || []).length ? `<p class="rau">Diferențe: ${c.diferente.map(esc).join('<br>')}</p>` : '';
  const cas = c.casute ? `<p><small>Căsuțe e-mail ERP: ${c.casute.recriptate} recriptate, ${c.casute.nereusite} nereușite${c.casute.nereusite ? ' (parola se reintroduce în ERP, pagina Solicitări)' : ''}.</small></p>` : '';
  return `<section><h2>${esc(BAZE[x.db])} <small>(baza ${x.db})</small></h2>
<p>Mărime: ${esc(x.marime)} · conexiuni ale aplicației acum: ${esc(x.conexiuni)}${x.comutat ? ` · <b>comutat</b> ${esc(x.comutat)}` : ''}</p>
<p>Ultima copiere: ${c.la ? esc(new Date(c.la).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })) : ''} ${st}</p>${dif}${cas}
<form method="post" action="/copiaza"><input type="hidden" name="db" value="${x.db}">
<label>Adresa Neon actuală (valoarea DATABASE_URL din Render → ${x.db === 'erp' ? 'hugetech-erp' : 'edever-curieri'} → Environment), copiată exact:</label>
<textarea name="neon" rows="2" placeholder="${x.sursaSalvata ? 'salvată – lasă gol ca să recopiezi cu aceeași adresă' : 'postgresql://...'}"></textarea>
<button>Copiază din Neon</button></form>
<p><a href="/adresa/${x.db}">Adresa nouă pentru Render</a> (se deschide doar pentru tine)</p>
<form method="post" action="/comutat"><input type="hidden" name="db" value="${x.db}"><button>Am comutat în Render (șterge adresa Neon salvată)</button></form></section>`;
}

function corpCerere(req) {
  return new Promise((rez) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => rez(Object.fromEntries(new URLSearchParams(d)))); });
}

const server = http.createServer(async (req, res) => {
  const trimite = (cod, html, antete = {}) => { res.writeHead(cod, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...antete }); res.end(html); };
  const inapoi = () => { res.writeHead(303, { Location: '/' }); res.end(); };
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/stare') { // public, fără secrete
      const s = stare(); res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ruleaza: citeste(RULEAZA) || null, ultimaCopieNoapte: citeste(`${VAR}/ultima-copie`) || null,
        baze: Object.fromEntries(Object.keys(BAZE).map((d) => [d, { ok: s[d]?.copiere?.ok ?? null, etapa: s[d]?.copiere?.etapa ?? null, la: s[d]?.copiere?.la ?? null, comutat: s[d]?.comutat ?? null }])) }));
    }
    if (req.method === 'POST' && url.pathname === '/intra') {
      const { cod } = await corpCerere(req);
      if (!codBun(cod)) return trimite(403, pagina('<p class="rau">Cod greșit.</p><p><a href="/">Înapoi</a></p>'));
      res.writeHead(303, { Location: '/', 'Set-Cookie': `${cookie()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200` }); return res.end();
    }
    if (!autentificat(req)) return trimite(200, pagina('<h1>Server hugetech</h1><form method="post" action="/intra"><label>Codul de configurare</label><input type="password" name="cod" autofocus><button>Intră</button></form>'));
    if (req.method === 'POST' && url.pathname === '/copiaza') {
      const { db, neon } = await corpCerere(req);
      if (!BAZE[db]) return inapoi();
      if (fs.existsSync(RULEAZA)) return trimite(409, pagina('<p>Rulează deja o copiere. <a href="/">Înapoi</a></p>'));
      const f = `${ETC}/neon-${db}`;
      if (neon?.trim()) { envNeon(neon.trim()); fs.writeFileSync(f, neon.trim(), { mode: 0o600 }); }
      const adresa = citeste(f);
      if (!adresa) return trimite(400, pagina('<p class="rau">Lipește adresa Neon.</p><p><a href="/">Înapoi</a></p>'));
      copiaza(db, adresa); return inapoi();
    }
    if (req.method === 'POST' && url.pathname === '/comutat') {
      const { db } = await corpCerere(req);
      if (BAZE[db]) { fs.rmSync(`${ETC}/neon-${db}`, { force: true }); const s = stare(); s[db] = { ...(s[db] || {}), comutat: new Date().toISOString() }; scrieStare(s); jurnal(`${db}: comutat`); }
      return inapoi();
    }
    const m = /^\/adresa\/(erp|curieri)$/.exec(url.pathname);
    if (m) return trimite(200, pagina(`<h1>Adresa nouă – ${esc(BAZE[m[1]])}</h1><p>Render → ${m[1] === 'erp' ? 'hugetech-erp' : 'edever-curieri'} → Environment → <b>DATABASE_URL</b> → înlocuiești valoarea cu:</p>
<p><code id="a">${esc(adresaNoua(m[1]))}</code></p><button onclick="navigator.clipboard.writeText(document.getElementById('a').textContent)">Copiază</button>
<p><small>Înainte de a o înlocui, apasă din nou „Copiază din Neon” în panou, ca să fie aduse și ultimele modificări. Apoi „Save, rebuild and deploy”.</small></p><p><a href="/">Înapoi</a></p>`));
    const linii = await situatie();
    const ruleazaAcum = citeste(RULEAZA);
    trimite(200, pagina(`<h1>Server hugetech</h1><p><small>IP ${esc(IP)} · PostgreSQL ${esc((await sqlLocal('postgres', 'show server_version')).trim())} · copia de noapte: ${esc(citeste(`${VAR}/ultima-copie`) || 'încă nu')}${ruleazaAcum ? ` · <b>copiere în curs: ${esc(ruleazaAcum)}</b>` : ''}</small></p>
${linii.map(sectiune).join('')}`, !!ruleazaAcum));
  } catch (e) { trimite(500, pagina(`<p class="rau">${esc(String(e.message || e).replace(/postgres(ql)?:\/\/[^\s]+/g, '[adresă]'))}</p><p><a href="/">Înapoi</a></p>`)); }
});
if (process.argv[1]?.endsWith('panou.mjs')) {
  fs.mkdirSync(LUCRU, { recursive: true }); fs.chmodSync(LUCRU, 0o711); // postgres poate deschide fișierul lui, dar nu listează dosarul
  fs.rmSync(RULEAZA, { force: true }); // o copiere întreruptă de o repornire nu mai rulează
  server.listen(3001, '127.0.0.1', () => console.log('panou pe 127.0.0.1:3001'));
}
