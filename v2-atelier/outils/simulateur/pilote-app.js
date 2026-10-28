'use strict';
// NIVEAU B — la VRAIE app (v2/, servie par le serveur de pages qui imite Cloudflare) dans Chromium, contre la base en mémoire de base.js.
// Un contexte neuf par séance, horloge décalée à la date de la séance. Le pratiquant ne fait que des gestes d'écran (saisir, cocher,
// noter la réserve, répondre aux cartes, terminer). On LIT le plan que l'app calcule (THPlan.dernier) et on lui applique verifierPlan.
const path = require('path'); const fs = require('fs'); const R = path.resolve(__dirname, '../../..');
const { chromium } = require(R + '/node_modules/playwright-core');
const Garde = require(R + '/tests/banc/garde-reseau.js'); const Verrou = require(R + '/tests/banc/verrou.js'); const Horloge = require(R + '/tests/banc/horloge.js');
const { creer } = require(R + '/v2-atelier/banc/serveur-pages.js');
const A = require('./alea.js'); const P = require('./pratiquant.js'); const Base = require('./base.js'); const { catalogue } = require('./catalogue.js'); const J = require('./journal.js');
const PM = require('./pilote-moteur.js'); const { PROFILS } = require('./profils.js');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const SCRIPT_JETON = () => { const Jt = JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800, token_type: 'bearer', user: { id: 'u-sim', email: 'sim@test' } }); localStorage.setItem('th-v2-auth', Jt); const vs = Storage.prototype.setItem, vr = Storage.prototype.removeItem; Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vr.call(this, c); }; Storage.prototype.setItem = function (c, v) { return vs.call(this, c, c === 'th-v2-auth' ? Jt : v); }; };

// Dans la page : l'extraction du plan courant (JSON simple), la vérification, et les lignes telles qu'affichées.
const DANS_LA_PAGE = {
  etat: () => {
    const d = window.THPlan && window.THPlan.dernier; if (!d) return null;
    let v = { erreurs: ['(pas de verifierPlan)'] };
    try { v = window.THPlan.verifierPlan(d.plan, d.entrees, window.__avant || null); } catch (e) { v = { erreurs: ['[exception verifierPlan] ' + e.message] }; }
    window.__avant = d.plan;
    const dom = (iExo) => Array.from(document.querySelectorAll('.serie[data-iexo="' + iExo + '"]')).map((r) => { const ins = r.querySelectorAll('input'); const val = (e) => (e ? (e.value !== '' ? e.value : (e.placeholder || '')) : ''); return { cochee: !!r.querySelector('.ok-serie.cochee'), charge: ins.length === 2 ? val(ins[0]) : '', reps: val(ins[ins.length - 1]) }; });
    return { erreurs: v.erreurs || [], rapports: v.rapports || [], exos: d.plan.exercices.map((x) => ({ iExo: x.iExo, slug: x.slug, lignes: x.lignes.map((l) => ({ i: l.iSerie, v: l.validee, r: l.role, c: l.charge, q: l.vise, f: l.figee })), jaune: x.entete ? x.entete.jaune : null, gris: x.entete ? x.entete.gris : null, dom: dom(x.iExo), cartes: ['escalier', 'carteReprise', 'carteLest', 'carteMarche', 'proposition', 'degressive', 'leviersGardes', 'cranDeMoins', 'placeSerieDePlus'].filter((k) => !!x[k]) })), carte: !!d.plan.carte, allegee: !!d.plan.allegee };
  },
  planComplet: () => {
    const d = window.THPlan.dernier; const pick = (x) => ({ slug: x.slug, iExo: x.iExo, consigne: x.consigne ? { etat: x.consigne.etat, zone: x.consigne.zone || null, palier: x.consigne.palier === undefined ? null : x.consigne.palier, niveau: x.consigne.niveau === undefined ? null : x.consigne.niveau, ligne: x.consigne.ligne || null, haut: x.consigne.haut || null } : null, compteur: x.compteur ? x.compteur.compteur : null, entete: x.entete ? { jaune: x.entete.jaune, gris: x.entete.gris } : null, lignes: x.lignes.map((l) => ({ role: l.role, charge: l.charge, vise: l.vise })), phrases: (x.phrases || []).map((p) => ({ ou: p.ou, texte: p.texte })), constat: x.constat || null, douleur: !!x.douleur, intention: x.intention });
    return d.plan.exercices.map(pick);
  },
  voix: () => Array.from(document.querySelectorAll('#vue-seance .entete-coach, #vue-seance .reaction-serie, #vue-seance .ce-phrase, #vue-seance .ce-detail, #vue-seance .pc-texte, #vue-seance .pc-detail, #vue-seance .constat-exo, #vue-seance [class*="constat"], #vue-seance [class*="consigne"], #vue-seance [class*="bandeau-allegee"]')).map((e) => e.innerText.trim()).filter(Boolean),
  texteSeance: () => (document.getElementById('vue-seance') || {}).innerText || ''
};

async function lancerNavigateur() { const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] }); return nav; }

function initialiserBase(profil, routines) {
  const base = Base.creer(); const T = base.tables;
  Object.keys(catalogue).forEach((s) => { T.exercises.push(Object.assign({ slug: s, nom: s.replace(/_/g, ' '), parent: null }, catalogue[s])); });
  T.profiles.push({ id: Base.MOI, username: 'sim', sexe: profil.sexe, anciennete: profil.anciennete, intention: profil.intention, rythme_progression: profil.reglage, materiel: profil.materiel, objectif: profil.objectif, phase: profil.phase, seances_par_semaine: profil.freq, onboarding_completed: true, jeu_actif: false, compte_prive: true, lest_reponse: profil.special.lest || null, questionnaire_fait_le: '2026-01-01T08:00:00.000Z', completer_refus: [], marche_reponses: null, mode_entrainement: 'musculation', unites: 'kg' });
  let g = 0;
  routines.forEach((r, i) => T.routines.push({ id: 'r' + i, nom: r.nom, note: null, archivee_a: null, created_at: '2026-01-01T08:00:00Z', modifiee_a: '2026-01-01T08:00:00Z', routine_exercises: r.exercices.map((e, j) => ({ id: 're' + i + '-' + j, routine_id: 'r' + i, exercise_slug: e.exercise_slug, rang: j, repos_cible_s: 90, groupe_superset: null, note: null, routine_sets: Array.from({ length: e.series }, (_, k) => ({ id: 'rs' + (++g), rang: k + 1, type_serie: 'travail', reps_visees: e.reps, charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null })) })) }));
  return base;
}

async function attendreCalcul(page, avant, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 3000)) { const ch = await page.evaluate((a) => window.THPlan.dernier !== a.ref, { ref: null }).catch(() => false); if (ch) break; await page.waitForTimeout(40); }
}

async function jouerSeanceB(nav, serveurBase, ctxS, routine, semaine, rang, date, log) {
  const { profil, graine, base } = ctxS;
  const r = A.creer(profil.id, graine, 'seance', semaine, rang);
  const forme = Math.max(0.8, A.gauss(r, 1, 0.04)) * (profil.special.forme || 1);
  const ctx = await nav.newContext({ viewport: { width: 380, height: 760 }, serviceWorkers: 'block' });
  await ctx.addInitScript(SCRIPT_JETON); await ctx.addInitScript(Horloge.scriptNavigateur(date.getTime() - Date.now()));
  await Base.installerRoutes(ctx, base);
  const page = await ctx.newPage(); const erreursPage = []; page.on('pageerror', (e) => erreursPage.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') erreursPage.push('console: ' + m.text().slice(0, 1500)); });
  const rap = { profil: profil.id, graine, niveau: 'B', semaine: semaine + 1, seance: ctxS.n + 1, rang, date: date.toISOString(), routine: routine.nom, exos: [], violations: [], cartes: [], plans: 0, gestes: [], erreursPage, domOuverture: null, domFin: null, v11: [], voix: [], echecs: [] };
  const geste = (g) => rap.gestes.push(g);
  try {
    await page.goto(ctxS.url + '/saisie', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction((n) => Array.from(document.querySelectorAll('.routine-rangee')).some((x) => (x.querySelector('.routine-nom') || {}).textContent === n), routine.nom, { timeout: 15000 });
    await page.evaluate((n) => { const rr = Array.from(document.querySelectorAll('.routine-rangee')).filter((x) => x.querySelector('.routine-nom').textContent === n)[0]; rr.querySelector('.demarrer').click(); }, routine.nom);
    await page.waitForFunction(() => document.querySelectorAll('#vue-seance .serie').length > 0 && !!window.THPlan && !!window.THPlan.dernier, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const groupes = {};
    let etat = await page.evaluate(DANS_LA_PAGE.etat);
    const maj = async (quoi) => { etat = await page.evaluate(DANS_LA_PAGE.etat); rap.plans++; if (etat) etat.erreurs.forEach((m) => rap[/^I10 suite/.test(m) ? 'rapports' : 'violations'] && rap[/^I10 suite/.test(m) ? 'rapports' : 'violations'].push({ geste: quoi, msg: String(m) })); return etat; };
    rap.rapports = [];
    rap.premier = await page.evaluate(DANS_LA_PAGE.planComplet); rap.domOuverture = await page.evaluate(DANS_LA_PAGE.texteSeance);
    const nExo = rap.premier.length;
    const infos = routine.exercices.map((e) => { const slug = e.exercise_slug; const cap = ctxS.cap[slug] || (ctxS.cap[slug] = P.capaciteInitiale(profil, slug, r)); return { slug, cap, equipement: PM.equipementDe(slug), reps: e.reps, dures: 0, stimul: 0, fait: [], mesure: PM.mesureDe(slug) }; });
    const repondreCartes = async (i) => {
      for (let tour = 0; tour < 6; tour++) {
        const cartes = await page.evaluate((k) => Array.from(document.querySelectorAll('#vue-seance .proposition-exercice[data-iexo="' + k + '"]')).map((c) => ({ classe: c.className, texte: (c.querySelector('.pc-texte') || {}).innerText || '', detail: (c.querySelector('.pc-detail') || {}).innerText || '', boutons: Array.from(c.querySelectorAll('button')).map((b) => b.className + '|' + b.innerText) })), i);
        if (!cartes.length) return;
        const c = cartes[0]; const chauffes = /proposition-chauffes/.test(c.classe);
        let oui;
        if (chauffes) oui = false; else if (profil.cartes === 'accepte') oui = true; else if (profil.cartes === 'refuse') oui = false; else { const u = r(); if (u < 0.1) { rap.cartes.push({ exo: infos[i] && infos[i].slug, type: c.classe, texte: c.texte, reponse: 'ignorée' }); return; } oui = u < 0.55; }
        rap.cartes.push({ exo: infos[i] && infos[i].slug, type: c.classe.replace('proposition-exercice', '').trim(), texte: c.texte, detail: c.detail, boutons: c.boutons, reponse: oui ? 'oui' : 'non' });
        const sel = '#vue-seance .proposition-exercice[data-iexo="' + i + '"] ' + (oui ? '.pc-ajouter' : '.pc-refuser');
        const n0 = await page.locator(sel).count(); if (!n0) return;
        await page.locator(sel).first().click({ timeout: 4000 }).catch((e) => rap.echecs.push('carte: ' + e.message.slice(0, 120)));
        await page.waitForTimeout(500); await maj('carte ' + i);
      }
    };
    const repondreEscalier = async () => {
      const present = await page.locator('#vue-seance .carte-escalier').count(); if (!present) return;
      const texte = await page.evaluate(() => (document.querySelector('#vue-seance .carte-escalier') || {}).innerText || '');
      let oui = profil.cartes === 'accepte' ? true : profil.cartes === 'refuse' ? false : r() < 0.5;
      rap.cartes.push({ exo: null, type: 'escalier', texte, reponse: oui ? 'oui' : 'non' });
      await page.locator('#vue-seance .carte-escalier ' + (oui ? '.ce-alleger' : '.ce-refuser')).first().click({ timeout: 4000 }).catch((e) => rap.echecs.push('escalier: ' + e.message.slice(0, 120)));
      await page.waitForTimeout(600); await maj('escalier');
    };
    await repondreEscalier();
    const mal = profil.special.mal && semaine + 1 === profil.special.mal.semaine && rang === 0;
    for (let i = 0; i < nExo; i++) {
      const ex = infos[i]; const entretien = profil.intention === 'entretien';
      await repondreCartes(i);
      for (let garde = 0; garde < 12; garde++) {
        // la première série pas encore cochée de cet exercice (les cartes acceptées peuvent en ajouter)
        const rangees = await page.evaluate((k) => Array.from(document.querySelectorAll('.serie[data-iexo="' + k + '"]')).map((e) => ({ j: Number(e.dataset.iserie), cochee: !!e.querySelector('.ok-serie.cochee') })), i);
        const j = (rangees.find((q) => !q.cochee) || {}).j; if (j === undefined) break;
        const px = etat && etat.exos.find((q) => q.iExo === i); const planNow = await page.evaluate(([k, jj]) => { const d = window.THPlan.dernier; const x = d && d.plan.exercices.find((q) => q.iExo === k); const l = x && x.lignes[jj]; return l ? { charge: l.charge, vise: l.vise, role: l.role } : null; }, [i, j]);
        const ligne = planNow && typeof planNow.charge === 'number' ? { charge: planNow.charge, vise: planNow.vise } : (planNow && planNow.vise ? { charge: null, vise: planNow.vise } : null);
        let l2 = ligne; if (entretien) l2 = ex.derniere || null;
        const res = PM.faireSerie({ profil, r, forme }, ex, l2 && l2.charge !== null ? l2 : (l2 ? { charge: undefined, vise: l2.vise } : null), j);
        if (entretien) ex.derniere = { charge: res.charge, vise: res.reps };
        const sl = page.locator('.serie[data-iexo="' + i + '"][data-iserie="' + j + '"]').first();
        const ins = sl.locator('input'); const nIn = await ins.count();
        if (nIn >= 2 && res.charge !== null && res.charge !== undefined) { await ins.nth(0).fill(String(res.charge).replace('.', ',')); await ins.nth(1).fill(String(res.reps)); }
        else await ins.nth(nIn - 1).fill(String(res.reps));
        await page.evaluate(() => { window.__d0 = window.THPlan.dernier; });
        await sl.locator('.ok-serie').click({ timeout: 5000 }).catch((e) => rap.echecs.push('ok: ' + e.message.slice(0, 120)));
        await page.waitForFunction(() => window.THPlan.dernier !== window.__d0, null, { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(250);
        if (res.notee) {
          const idx = { reste_3_plus: 0, reste_2: 1, reste_1: 2, reste_0: 3 }[res.notee];
          await sl.locator('.eff-serie').click({ timeout: 3000 }).catch((e) => rap.echecs.push('eff: ' + e.message.slice(0, 100)));
          await page.locator('.grille-rir button').nth(idx).click({ timeout: 3000 }).catch((e) => rap.echecs.push('rir: ' + e.message.slice(0, 100)));
          await page.waitForTimeout(250);
        }
        ex.fait.push({ kg: res.charge, reps: res.reps, vise: res.vise, ratee: res.ratee, reserveVraie: res.reserveVraie, notee: res.notee, role: planNow ? planNow.role : null, rmax: res.rmax });
        const avant = etat; await maj('valider ' + i + '/' + j + ' ' + ex.slug);
        // V11 — aucune série validée ne change de rôle d'un plan au suivant ; l'en-tête ne cite que des lignes visibles
        if (avant && etat) etat.exos.forEach((xn) => { const xa = avant.exos.find((q) => q.iExo === xn.iExo); if (!xa) return; xa.lignes.forEach((la) => { if (!la.v) return; const ln = xn.lignes.find((q) => q.i === la.i); if (ln && (ln.r !== la.r || ln.c !== la.c || ln.q !== la.q)) rap.v11.push({ type: 'role_change', geste: 'valider ' + i + '/' + j, slug: xn.slug, avant: la, apres: ln }); }); });
        if (etat) etat.exos.forEach((xn) => { (xn.jaune || []).forEach((jn) => { const m = /(\d+(?:[.,]\d+)?)\s*kg\s*×\s*(\d+)/.exec(jn.replace(/[  ]/g, ' ')); if (!m) return; const c = Number(m[1].replace(',', '.')), q = Number(m[2]); const vis = xn.dom.some((d) => Number(String(d.charge).replace(',', '.')) === c && Number(d.reps) === q) || xn.lignes.some((l) => l.c === c && l.q === q); if (!vis) rap.v11.push({ type: 'entete_cite_absent', geste: 'valider ' + i + '/' + j, slug: xn.slug, jaune: jn, dom: xn.dom, lignes: xn.lignes }); }); });
        await repondreCartes(i); await repondreEscalier();
      }
      if (mal && i === 0) { /* « J'ai mal » : voir rapport (geste non automatisé en B) */ }
    }
    rap.domFin = await page.evaluate(DANS_LA_PAGE.texteSeance); rap.voix = await page.evaluate(DANS_LA_PAGE.voix);
    rap.final = await page.evaluate(DANS_LA_PAGE.planComplet);
    await page.locator('.bandeau-fin').click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.locator('#feuille-seance button').filter({ hasText: /^terminer$/i }).first().click({ timeout: 5000 }).catch((e) => rap.echecs.push('terminer: ' + e.message.slice(0, 100)));
    await page.waitForFunction(() => { const v = document.getElementById('vue-recap'); return v && !v.hidden; }, null, { timeout: 8000 }).catch(() => rap.echecs.push('pas de récap'));
    rap.recap = await page.evaluate(() => { const v = document.getElementById('vue-recap'); return v && !v.hidden ? v.innerText : null; });
    await page.waitForTimeout(800);
    infos.forEach((x) => { ctxS.stim[x.slug] = (ctxS.stim[x.slug] || 0) + x.stimul; ctxS.derniere[x.slug] = semaine; });
    rap.infos = infos.map((x) => ({ slug: x.slug, fait: x.fait, capacite: Math.round(x.cap.C * 100) / 100, equipement: x.equipement, mesure: x.mesure }));
    const s = base.tables.sessions[base.tables.sessions.length - 1]; rap.statutBase = s ? s.statut : null;
  } catch (e) { rap.echecs.push('exception: ' + e.message.slice(0, 300)); }
  await ctx.close();
  return rap;
}

function enLigneN(rap) {
  // Le même JSONL que le niveau N (les vérifications se relancent sans rejouer).
  const finaux = rap.final || [];
  const exos = finaux.map((x) => { const inf = (rap.infos || []).find((q) => q.slug === x.slug) || {}; const ini = (rap.premier || []).find((q) => q.slug === x.slug) || {};
    return { slug: x.slug, iExo: x.iExo, consigne: x.consigne ? Object.assign({}, x.consigne, { compteur: x.compteur }) : null, entete: x.entete, enteteInitial: ini.entete || null, lignesInitiales: ini.lignes || [], phrases: x.phrases, constat: x.constat, donc: null, suiteConsigne: null, fait: inf.fait || [], capacite: inf.capacite, equipement: inf.equipement, mesure: inf.mesure, douleur: x.douleur, intention: x.intention, plafonne: false }; });
  return { profil: rap.profil, graine: rap.graine, niveau: 'B', semaine: rap.semaine, seance: rap.seance, rang: rap.rang, date: rap.date, routine: rap.routine, exos,
    violations: rap.violations.concat((rap.echecs || []).map((m) => ({ geste: 0, msg: '[geste] ' + m }))), cartes: rap.cartes.map((c) => ({ exo: c.exo, type: c.type })), plans: rap.plans, v11: rap.v11, erreursPage: rap.erreursPage, rapports: rap.rapports, voix: rap.voix, recap: rap.recap };
}

async function jouerProfilB(profil, graine, semaines, opts) {
  const o = opts || {};
  const routines = PM.programmeDe(profil); const base = initialiserBase(profil, routines);
  const serveur = creer({ racine: R + '/v2' }); const port = await Verrou.ecouter(serveur, 0);
  const nav = await lancerNavigateur();
  const ctxS = { profil, graine, base, url: 'http://127.0.0.1:' + port, cap: {}, stim: {}, derniere: {}, n: 0 };
  const sortie = []; const dossier = o.dossier; const t0 = Date.now(); let rang = 0;
  const abs = A.creer(profil.id, graine, 'absences');
  for (let w = 0; w < semaines; w++) {
    const row = base.tables.profiles[0];
    if (profil.special.phaseA && w + 1 >= profil.special.phaseA.semaine) row.phase = profil.special.phaseA.phase === 'seche' ? 'seche' : row.phase;
    if (profil.special.reglageA && w + 1 >= profil.special.reglageA.semaine) row.rythme_progression = profil.special.reglageA.reglage;
    if (profil.special.cycles) {
      if (!base.tables.blocs.length) for (let b = 0; b < 4; b++) { const d = new Date(2026, 0, 5 + b * 28); base.tables.blocs.push({ id: 'B' + b, user_id: Base.MOI, statut: 'a_venir', debut: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), semaines: 4, decharge: true, zone: 'mix', dossier: 'D', exercices: (routines[0].exercices || []).map((e) => e.exercise_slug).slice(0, 4), precedent: null }); }
      base.tables.blocs.forEach((b, bi) => { b.statut = bi === Math.floor(w / 4) ? 'en_cours' : (bi < Math.floor(w / 4) ? 'termine' : 'arrete'); });
    }
    for (let k = 0; k < profil.freq; k++) {
      const absente = profil.special.irregulier ? ([5, 6, 10, 11, 12].includes(w) || abs() < 0.25) : abs() < 0.05;
      const date = PM.dateSeance(w, k, profil.freq); if (absente) continue;
      const routine = routines[rang % routines.length]; rang++;
      const t1 = Date.now(); const rap = await jouerSeanceB(nav, serveur, ctxS, routine, w, k, date); ctxS.n++;
      sortie.push(enLigneN(rap));
      if (o.log) o.log(profil.id + ' S' + (w + 1) + ' #' + ctxS.n + ' ' + (Date.now() - t1) + ' ms viol=' + rap.violations.length + ' v11=' + rap.v11.length + ' echecs=' + rap.echecs.length);
      if (dossier) J.ecrire(dossier, profil, graine, sortie);
    }
    Object.keys(ctxS.cap).forEach((slug) => {
      const c = ctxS.cap[slug]; const vu = w - (ctxS.derniere[slug] === undefined ? -99 : ctxS.derniere[slug]);
      const stim = ctxS.stim[slug] >= 2 ? 1 : ctxS.stim[slug] === 1 ? 0.5 : 0; const bas = P.BAS.test(slug) ? 1 : 0.8; const rr = A.creer(profil.id, graine, 'cap', slug, w);
      let g = P.gHebdo(profil, w) * P.S_PHASE(profil.phase, profil.anciennete) * bas * stim; if (vu > 2 && vu < 90) g = profil.special.irregulier ? -0.015 : -0.007;
      c.C = Math.max(1, c.C * (1 + g) * (1 + A.gauss(rr, 0, 0.005))); ctxS.stim[slug] = 0;
    });
  }
  await nav.close(); serveur.close();
  return { lignes: sortie, base, ms: Date.now() - t0 };
}
module.exports = { jouerProfilB };
if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
  (async () => {
    const rendre = await Verrou.prendre();
    const ids = arg('profils', 'X15').split(','); const sem = Number(arg('semaines', 16)); const graine = Number(arg('graine', 1)); const sortie = arg('sortie', '/home/claude/nuit/audit-fil/simulation-B');
    for (const id of ids) { const p = PROFILS.find((x) => x.id === id); const r = await jouerProfilB(p, graine, sem, { dossier: sortie, log: (m) => console.log(m) }); console.log(id, 'fini', r.lignes.length, 'séances', r.ms, 'ms'); }
    rendre();
  })().catch((e) => { console.error(e); process.exit(1); });
}
