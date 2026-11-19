// Pagina „Variabile” din panou: variabilele de mediu ale aplicațiilor mutate de pe Render (ERP, edever-curieri).
// Valorile se scriu în /etc/hugetech-aplicatii/<id>.json (0600) și nu se mai afișează niciodată întregi: doar ultimele 4 caractere.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { APLICATII, ETC_APL, VAR_APL, NU_DIN_RENDER, valori, implicite, lipsa, salveaza, stareServiciu, construit, ultimaConstruire, adresaPublica, ultimeleCaractere } from './aplicatii.mjs';

const VIZIBILE = new Set(['SHOPIFY_APP_URL', 'ERP_URL', 'RENDER_EXTERNAL_URL', 'SCOPES', 'TINE_TREAZ', 'EDEVER_SHOPIFY_STORE', 'MAXBI_SHOPIFY_STORE', 'NODE_ENV']);
const NUME = /^[A-Z_][A-Z0-9_]{0,99}$/;
const citeste = (f, d = '') => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return d; } };
const coada = (t, n) => String(t || '').trim().split('\n').slice(-n).join('\n');

// „CHEIE=valoare” pe rânduri (ca un fișier .env); ghilimelele de la capete se scot.
function dinEnv(text) {
  const o = {};
  for (const l of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(l);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) v = v.slice(1, -1);
    o[m[1]] = v;
  }
  return o;
}

async function dinRender(cheie) {
  const h = { Authorization: `Bearer ${cheie}`, Accept: 'application/json' };
  const ia = async (u) => { const r = await fetch(`https://api.render.com/v1${u}`, { headers: h }); if (!r.ok) throw new Error(`Render ${r.status} la ${u.split('?')[0]}`); return r.json(); };
  const rez = {};
  for (const [id, a] of Object.entries(APLICATII)) {
    const s = (await ia(`/services?name=${encodeURIComponent(a.render)}&limit=20`)).map((x) => x.service).find((x) => x?.name === a.render);
    if (!s) { rez[id] = { eroare: `nu găsesc serviciul ${a.render}` }; continue; }
    const noi = {}; let cursor = '';
    for (let i = 0; i < 20; i++) {
      const pag = await ia(`/services/${s.id}/env-vars?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const x of pag) if (x.envVar?.key && !NU_DIN_RENDER.includes(x.envVar.key)) noi[x.envVar.key] = String(x.envVar.value ?? '');
      if (pag.length < 100) break; cursor = pag[pag.length - 1].cursor;
    }
    const tot = { ...valori(id), ...noi };
    rez[id] = { importate: Object.keys(noi).length, gata: salveaza(id, tot) };
  }
  return rez;
}

function sectiune(id, esc) {
  const a = APLICATII[id], v = valori(id), imp = implicite(id), st = stareServiciu(id), u = ultimaConstruire(id), lip = lipsa(id);
  const cunoscute = new Set(a.v.map(([k]) => k));
  const rand = ([k, ob, ajutor]) => {
    const are = v[k] !== undefined && v[k] !== '', impl = !are && imp[k];
    const acum = are ? (VIZIBILE.has(k) ? esc(v[k]) : esc(ultimeleCaractere(v[k])))
      : impl ? `<small>implicit: ${VIZIBILE.has(k) ? esc(imp[k]) : esc(ultimeleCaractere(imp[k]))}</small>` : '<small>necompletat</small>';
    return `<tr><td><code>${k}</code>${ob ? ' <b class="rau">*</b>' : ''}<br><small>${esc(ajutor)}</small></td><td>${acum}</td>
<td><textarea name="v_${k}" rows="1" autocomplete="off" spellcheck="false"></textarea>${are ? `<label><input type="checkbox" name="sterge_${k}"> șterge</label>` : ''}</td></tr>`;
  };
  const altele = Object.keys(v).filter((k) => !cunoscute.has(k)).map((k) => [k, false, '(adăugată)']);
  const stare = st.ActiveState === 'active' ? `<span class="ok">pornită</span> din ${esc(st.ActiveEnterTimestamp)}`
    : `<span class="rau">${esc(st.ActiveState || 'necunoscut')}</span>${lip.length ? ` – lipsesc: ${lip.map(esc).join(', ')}` : ''}`;
  return `<section id="${id}"><h2>${esc(a.nume)}</h2>
<p>Adresa: <a href="${esc(adresaPublica(id))}">${esc(adresaPublica(id))}</a> · port local ${a.port} · stare: ${stare} · repornit de ${esc(st.NRestarts || '0')} ori</p>
<p><small>Versiune construită: ${esc((construit(id) || 'încă nu').slice(0, 7))}${u.eroare ? ` · <span class="rau">ultima construire (${esc(String(u.commit || '').slice(0, 7))}) a eșuat</span>` : ''} · <a href="/variabile/jurnal/${id}">jurnal</a></small></p>
<form method="post" action="/variabile/${id}"><table>${[...a.v, ...altele].map(rand).join('')}
<tr><td>Altă variabilă<br><input name="nou_nume" placeholder="NUME_VARIABILA" autocomplete="off"></td><td></td><td><textarea name="nou_val" rows="1" autocomplete="off"></textarea></td></tr></table>
<label>Sau lipește mai multe deodată, „CHEIE=valoare” pe rânduri (ca un fișier .env):</label><textarea name="env" rows="3" autocomplete="off" spellcheck="false"></textarea>
<p><small>Câmpurile goale nu schimbă nimic. La salvare, aplicația repornește (dacă are toate variabilele marcate cu *).</small></p>
<button>Salvează și repornește</button></form></section>`;
}

export async function variabile(req, res, url, { pagina, esc, corpCerere, trimite }) {
  const inapoi = (ancora = '') => { res.writeHead(303, { Location: `/variabile${ancora}` }); res.end(); return true; };
  if (req.method === 'GET' && url.pathname === '/variabile') {
    const gh = citeste(`${ETC_APL}/github-token`);
    trimite(200, pagina(`<h1>Variabile aplicații</h1><p><a href="/">← Panou</a></p>
<section><h2>1. Cheia GitHub (citire cod)</h2><p>Depozitele hugetech-erp și edever-curieri sunt private. GitHub → Settings → Developer settings → Fine-grained tokens:
doar aceste 2 depozite, permisiunea <b>Contents: Read-only</b>.</p><p>Acum: ${gh ? esc(ultimeleCaractere(gh)) : '<span class="rau">lipsește</span>'}</p>
<form method="post" action="/variabile/github"><input type="password" name="token" autocomplete="off"><button>Salvează</button></form>
<form method="post" action="/variabile/construieste"><button>Construiește acum (altfel singur, la 5 minute)</button></form></section>
<section><h2>2. Ia toate variabilele din Render (cel mai rapid)</h2><p>Render → Account Settings → API Keys → Create API Key; lipești cheia aici.
Se citesc variabilele ambelor servicii și se salvează aici; cheia nu se păstrează. Adresele (SHOPIFY_APP_URL, ERP_URL, RENDER_EXTERNAL_URL) nu se iau: rămân cele noi.</p>
<form method="post" action="/variabile/render"><input type="password" name="cheie" autocomplete="off"><button>Importă din Render</button></form></section>
<section><h2>3. Domenii proprii (după ce există înregistrarea DNS)</h2><p>Un rând pe domeniu: <code>erp erp.hugetech.ro</code> sau <code>curieri app.edever.ro</code>. Adresele sslip.io rămân și ele active.</p>
<form method="post" action="/variabile/domenii"><textarea name="domenii" rows="2">${esc(citeste(`${ETC_APL}/domenii`))}</textarea><button>Salvează domeniile</button></form></section>
${Object.keys(APLICATII).map((id) => sectiune(id, esc)).join('')}
<style>table{border-collapse:collapse;width:100%}td{border-top:1px solid #e3e6ea;padding:6px 4px;vertical-align:top;font-size:14px}td:first-child{width:38%}td:nth-child(2){width:22%;word-break:break-all}textarea{min-height:32px}</style>`));
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/variabile/github') {
    const { token } = await corpCerere(req);
    if (token?.trim() && /^[A-Za-z0-9_]{20,255}$/.test(token.trim())) {
      fs.mkdirSync(ETC_APL, { recursive: true, mode: 0o700 }); fs.writeFileSync(`${ETC_APL}/github-token`, token.trim(), { mode: 0o600 });
      spawnSync('systemctl', ['start', '--no-block', 'hugetech-aplicatii.service']);
    }
    return inapoi();
  }
  if (req.method === 'POST' && url.pathname === '/variabile/construieste') { for (const id of Object.keys(APLICATII)) if (ultimaConstruire(id).eroare) fs.rmSync(`${VAR_APL}/${id}.ultima.json`, { force: true }); spawnSync('systemctl', ['start', '--no-block', 'hugetech-aplicatii.service']); return inapoi(); }
  if (req.method === 'POST' && url.pathname === '/variabile/render') {
    const { cheie } = await corpCerere(req);
    if (!cheie?.trim()) return inapoi();
    try {
      const r = await dinRender(cheie.trim());
      trimite(200, pagina(`<h1>Import din Render</h1>${Object.entries(r).map(([id, x]) => `<p><b>${esc(APLICATII[id].nume)}</b>: ${x.eroare ? `<span class="rau">${esc(x.eroare)}</span>`
        : `${x.importate} variabile; ${x.gata ? '<span class="ok">complet – pornește</span>' : `<span class="rau">lipsesc: ${esc(lipsa(id).join(', '))}</span>`}`}</p>`).join('')}
<p><small>Poți șterge acum cheia API din Render.</small></p><p><a href="/variabile">Înapoi la variabile</a></p>`));
    } catch (e) { trimite(400, pagina(`<p class="rau">${esc(e.message)}</p><p><a href="/variabile">Înapoi</a></p>`)); }
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/variabile/domenii') {
    const { domenii } = await corpCerere(req);
    const linii = String(domenii || '').split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((p) => APLICATII[p[0]] && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(p[1] || '')).map((p) => `${p[0]} ${p[1]}`);
    fs.mkdirSync(ETC_APL, { recursive: true, mode: 0o700 }); fs.writeFileSync(`${ETC_APL}/domenii`, linii.join('\n') + (linii.length ? '\n' : ''), { mode: 0o600 });
    spawnSync('bash', ['/opt/hugetech-server/copiaza-fisiere.sh']); spawnSync('systemctl', ['reload', 'caddy']);
    return inapoi();
  }
  const mj = /^\/variabile\/jurnal\/(\w+)$/.exec(url.pathname);
  if (req.method === 'GET' && mj && APLICATII[mj[1]]) {
    const id = mj[1], j = spawnSync('journalctl', ['-u', APLICATII[id].serviciu, '-n', '120', '--no-pager', '-o', 'short-iso'], { encoding: 'utf8' }).stdout;
    const c = coada(citeste(`${VAR_APL}/${id}-construire.log`), 60), u = ultimaConstruire(id);
    trimite(200, pagina(`<h1>Jurnal – ${esc(APLICATII[id].nume)}</h1><p><a href="/variabile#${id}">← Variabile</a></p>
${u.eroare ? `<p class="rau">${esc(u.eroare)}</p>` : ''}<h2>Rulare</h2><pre style="white-space:pre-wrap;font-size:12px">${esc(coada(j, 120))}</pre>
<h2>Ultima construire</h2><pre style="white-space:pre-wrap;font-size:12px">${esc(c)}</pre>`));
    return true;
  }
  const m = /^\/variabile\/(\w+)$/.exec(url.pathname);
  if (req.method === 'POST' && m && APLICATII[m[1]]) {
    const id = m[1], f = await corpCerere(req), tot = valori(id);
    for (const [k, x] of Object.entries(dinEnv(f.env))) if (!NU_DIN_RENDER.includes(k) || k === 'SHOPIFY_APP_URL' || k === 'ERP_URL' || k === 'RENDER_EXTERNAL_URL') tot[k] = x;
    for (const [c, x] of Object.entries(f)) {
      if (c.startsWith('v_') && NUME.test(c.slice(2)) && x !== '') tot[c.slice(2)] = x.replace(/\r\n/g, '\n').trim();
      if (c.startsWith('sterge_') && NUME.test(c.slice(7))) delete tot[c.slice(7)];
    }
    const nn = String(f.nou_nume || '').trim().toUpperCase();
    if (NUME.test(nn) && f.nou_val) tot[nn] = f.nou_val.replace(/\r\n/g, '\n').trim();
    salveaza(id, tot);
    return inapoi(`#${id}`);
  }
  return false;
}
