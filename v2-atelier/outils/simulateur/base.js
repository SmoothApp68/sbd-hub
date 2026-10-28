'use strict';
// NIVEAU B — la base en mémoire (lignes de tables) et un faux PostgREST MINCE. Il est PLUS PERMISSIF que le banc de séance
// (tests/banc/seance-ecran.js:941-2013 : contraintes CHECK, RLS, FK absentes) : ce qu'il ne refuse pas n'est donc pas prouvé valide
// en base. Il modèle : eq/neq/in/gte/lte/gt/lt/is, order, select (projection, ressource imbriquée, `col:fondement->k`), limit,
// count=exact, upsert (merge-duplicates / ignore-duplicates, on_conflict), PATCH, DELETE, et les déclencheurs que le banc imite
// (sets_efface_observation, CASCADE des séances). Toute table inconnue ou requête non comprise est JOURNALISÉE (base.inconnues).
const MOI = 'u-sim';
function creer() {
  const t = { sessions: [], sets: [], predictions: [], zones_exercice: [], modes_exercice: [], blocs: [], routines: [], routine_exercises: [], routine_sets: [], profiles: [], exercises: [], records: [], body_weight_log: [], objectifs: [], semaine_choix: [], exercise_alias: [], alias_exercice: [] };
  return { tables: t, journal: [], inconnues: [], ecritures: [], refus: [], reseau: true };
}
const decouper = (texte) => { const b = []; let p = 0, c = ''; for (const ch of texte) { if (ch === '(') p++; if (ch === ')') p--; if (ch === ',' && p === 0) { b.push(c); c = ''; continue; } c += ch; } if (c.trim()) b.push(c); return b.map((x) => x.trim()).filter(Boolean); };
function projeterUne(ligne, champs) {
  if (champs.indexOf('*') >= 0) return Object.assign({}, ligne);
  const s = {};
  for (const champ of champs) {
    const m = /^([A-Za-z_]\w*)\s*\((.*)\)$/.exec(champ);
    if (m) { const im = ligne[m[1]]; s[m[1]] = Array.isArray(im) ? im.map((x) => projeterUne(x, decouper(m[2]))) : im; continue; }
    const j = /^(\w+):(\w+)->(\w+)$/.exec(champ);
    if (j) { const o = ligne[j[2]]; s[j[1]] = o && Object.prototype.hasOwnProperty.call(o, j[3]) ? o[j[3]] : null; continue; }
    if (Object.prototype.hasOwnProperty.call(ligne, champ)) s[champ] = ligne[champ];
  }
  return s;
}
const valeur = (v) => (v === undefined ? null : v);
function filtre(url, ligne) {
  for (const [k, raw] of url.searchParams.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].indexOf(k) >= 0) continue;
    const m = /^(not\.)?(eq|neq|in|gte|lte|gt|lt|is|like|ilike)\.(.*)$/.exec(raw); if (!m) continue;
    let [, non, op, arg] = m; let v = ligne[k]; if (k === 'session_id' && v === undefined && ligne.fondement) v = ligne.fondement.seance;
    let r;
    if (op === 'eq') r = String(valeur(v)) === arg; else if (op === 'neq') r = String(valeur(v)) !== arg;
    else if (op === 'in') r = arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).indexOf(String(v)) >= 0;
    else if (op === 'is') r = arg === 'null' ? v === null || v === undefined : String(v) === arg;
    else { const a = typeof v === 'number' ? Number(arg) : arg; r = op === 'gte' ? v >= a : op === 'lte' ? v <= a : op === 'gt' ? v > a : v < a; }
    if (non ? r : !r) return false;
  }
  return true;
}
function trier(rows, order) {
  if (!order) return rows; const cles = order.split(',').map((o) => { const [c, d] = o.split('.'); return [c, d === 'desc' ? -1 : 1]; });
  return rows.slice().sort((a, b) => { for (const [c, d] of cles) { if (a[c] === b[c]) continue; if (a[c] === null || a[c] === undefined) return 1; if (b[c] === null || b[c] === undefined) return -1; return (a[c] < b[c] ? -1 : 1) * d; } return 0; });
}
function installerRoutes(ctx, base) {
  return ctx.route((u) => /supabase\.co/.test(u.hostname), async (route) => {
    const req = route.request(); const url = new URL(req.url()); const method = req.method();
    const seg = url.pathname.split('/'); const table = seg[seg.length - 1];
    let corps = null; try { corps = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) { corps = null; }
    const unSeul = /vnd\.pgrst\.object/.test(req.headers().accept || '');
    const prefer = req.headers().prefer || '';
    const rep = (data, status, extra) => route.fulfill({ status: status || 200, contentType: 'application/json', headers: Object.assign({ 'access-control-expose-headers': 'content-range' }, extra || {}), body: JSON.stringify(unSeul && Array.isArray(data) ? (data[0] === undefined ? null : data[0]) : data) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/auth/')) return rep({ error: 'x' }, 400);
    if (!base.reseau) return route.abort('failed');
    if (url.pathname.startsWith('/functions/')) return rep({ erreur: 'indisponible' }, 503);
    if (url.pathname.indexOf('/rpc/') >= 0) { base.inconnues.push('rpc ' + table); return rep([]); }
    const rows = base.tables[table];
    if (!rows) { base.inconnues.push(method + ' ' + table); return method === 'GET' ? rep([]) : rep([], method === 'POST' ? 201 : 200); }
    const sel = url.searchParams.get('select'); const champs = sel ? decouper(sel) : ['*'];
    if (method === 'GET' || method === 'HEAD') {
      let out = rows.filter((l) => filtre(url, l));
      out = trier(out, url.searchParams.get('order'));
      const lim = url.searchParams.get('limit'); if (lim) out = out.slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(lim));
      const total = out.length;
      if (/count=exact/.test(prefer) && method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-' + Math.max(0, total - 1) + '/' + total, 'access-control-expose-headers': 'content-range' }, body: '' });
      if (unSeul && !out.length) return rep({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }, 406);
      return rep(out.map((l) => projeterUne(l, champs)), 200, /count=exact/.test(prefer) ? { 'content-range': '0-' + Math.max(0, total - 1) + '/' + total } : {});
    }
    if (method === 'POST') {
      const lignes = Array.isArray(corps) ? corps : [corps]; const sorties = [];
      const ignorer = /ignore-duplicates/.test(prefer); const fusionner = /merge-duplicates/.test(prefer) || url.searchParams.get('on_conflict');
      lignes.forEach((l) => {
        base.ecritures.push({ table, id: l.id, op: 'POST' });
        const cle = url.searchParams.get('on_conflict') || 'id';
        const i = rows.findIndex((x) => cle.split(',').every((c) => x[c] === l[c]));
        if (i >= 0) { if (ignorer) return; if (fusionner) { rows[i] = Object.assign({}, rows[i], l); sorties.push(rows[i]); return; } base.refus.push('23505 ' + table + ' ' + l.id); return; }
        const n = Object.assign({}, l); if (table === 'predictions') n.session_id = n.fondement && n.fondement.seance; rows.push(n); sorties.push(n);
      });
      if (table === 'routines' || table === 'routine_exercises' || table === 'routine_sets') { /* ids déjà posés par l'app */ }
      return rep(sorties.map((l) => projeterUne(l, champs)), 201);
    }
    if (method === 'PATCH') {
      const touche = rows.filter((l) => filtre(url, l)); touche.forEach((l) => { Object.assign(l, corps); base.ecritures.push({ table, id: l.id, op: 'PATCH' }); });
      return rep(touche.map((l) => projeterUne(l, champs)));
    }
    if (method === 'DELETE') {
      const del = rows.filter((l) => filtre(url, l)); del.forEach((l) => { rows.splice(rows.indexOf(l), 1); base.ecritures.push({ table, id: l.id, op: 'DELETE' });
        if (table === 'sets') base.tables.predictions.forEach((p) => { if (p.set_observe === l.id) { p.set_observe = null; p.valeur_observee = null; p.observee_a = null; } });
        if (table === 'sessions') { base.tables.sets = base.tables.sets.filter((s) => s.session_id !== l.id); } });
      return rep(del.map((l) => projeterUne(l, champs)));
    }
    base.inconnues.push(method + ' ' + table); return rep([]);
  });
}
module.exports = { creer, installerRoutes, MOI };
