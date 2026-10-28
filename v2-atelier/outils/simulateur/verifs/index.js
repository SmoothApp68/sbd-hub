'use strict';
// V1-V10 en Node sur le JSONL (V8, V11, V12 : niveau B / DOM, voir le rapport). Chaque vérification : { ok, n, ecarts:[{profil,graine,semaine,seance,exo,detail}] }.
const fs = require('fs'); const path = require('path');
const { PROFILS } = require('../profils.js');
const { catalogue } = require('../catalogue.js');
const Moteur = require('../charger.js').Moteur;

function charger(dossier) {
  const out = [];
  fs.readdirSync(dossier).filter((f) => /\.jsonl$/.test(f)).forEach((f) => {
    const l = fs.readFileSync(path.join(dossier, f), 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
    out.push({ profil: PROFILS.find((p) => p.id === l[0].profil), graine: l[0].graine, seances: l });
  });
  return out;
}
const txt = (x) => [x.entete && x.entete.jaune ? x.entete.jaune.join(' ') : '', x.entete && x.entete.gris || '', (x.phrases || []).map((p) => p.texte).join(' '), x.constat ? x.constat.verdict + ' ' + x.constat.suite : ''].join(' ');
const nbsp = (s) => String(s).replace(/[  ]/g, ' ');
const E = (r, s, x, detail) => ({ profil: r.profil.id, graine: r.graine, semaine: s.semaine, seance: s.seance, exo: x ? x.slug : null, detail });

// V1 — invariants (hors "I10 suite", rapporté à part)
function V1(runs) {
  const ecarts = []; const rap = []; let n = 0;
  runs.forEach((r) => r.seances.forEach((s) => { n += s.plans; s.violations.forEach((v) => { (/^I10 suite/.test(v.msg) ? rap : ecarts).push(E(r, s, null, v.msg)); }); }));
  return { ok: ecarts.length === 0, n, ecarts, rapports: rap };
}
// V2 — jamais bloqué
const ETATS_CHANGE = ['bord_recul', 'bord_vague', 'bord_garde', 'nouvelle_zone', 'salle_max', 'carte_lest', 'reprise_courte', 'reprise_longue'];
function V2(runs) {
  const ecarts = []; let n = 0;
  runs.forEach((r) => {
    if (r.profil.intention === 'entretien') return;
    const parExo = {};
    r.seances.forEach((s) => s.exos.forEach((x) => { if (x.consigne) (parExo[x.slug] = parExo[x.slug] || []).push({ s, x }); }));
    Object.keys(parExo).forEach((slug) => {
      const L = parExo[slug]; n += L.length;
      // Un déclenchement = le compteur franchit 4, 8, 12… pour la première fois ; il appelle une proposition dans la séance ou la suivante.
      let franchi = 0;
      L.forEach(({ s, x }, i) => {
        const c = x.consigne.compteur;
        if (typeof c !== 'number') return;
        if (c < 4) { franchi = 0; return; }
        const seuil = Math.floor(c / 4) * 4;
        if (seuil <= franchi) return;
        franchi = seuil;
        if (seuil > 4) return;   // N ne répond jamais aux cartes : les déclenchements suivants (8, 12…) ne se jugent qu'en B
        const vue = (q) => q.s.cartes.some((k) => k.exo === slug) || ETATS_CHANGE.indexOf(q.x.consigne.etat) >= 0;
        const suiv = L[i + 1];
        if (!vue({ s, x }) && suiv && !vue(suiv)) ecarts.push(E(r, s, x, 'déclenchement ' + seuil + ' (compteur ' + c + ') sans aucune proposition ni changement de consigne (séance et suivante) — état ' + x.consigne.etat));
      });
      // 8 séances coachées consécutives à la même cible sans proposition
      let run = 0, last = null;
      L.forEach(({ s, x }) => {
        const cible = JSON.stringify([x.consigne.ligne, x.consigne.haut]);   // la ligne ET le test : un test qui progresse (8, 9, 10 reps) est un changement
        const prop = s.cartes.some((q) => q.exo === slug) || ETATS_CHANGE.indexOf(x.consigne.etat) >= 0;
        if (cible === last && !prop) run++; else run = prop ? 0 : 1;
        last = cible;
        if (run === 8) ecarts.push(E(r, s, x, '8 séances coachées à la même cible ' + cible + ' sans proposition ni changement (V2 échec)'));
      });
    });
  });
  return { ok: ecarts.length === 0, n, ecarts };
}
// V3 — jamais muet
function V3(runs) {
  const ecarts = []; let n = 0;
  runs.forEach((r) => {
    if (r.profil.intention === 'entretien') {
      r.seances.forEach((s) => s.exos.forEach((x) => { if (x.entete && (x.entete.jaune || []).length) ecarts.push(E(r, s, x, 'entretien : le coach parle (I13) : ' + txt(x).slice(0, 120))); }));
      return;
    }
    r.seances.forEach((s) => s.exos.forEach((x) => {
      n++;
      if (x.douleur) return;
      if (!x.consigne) { ecarts.push(E(r, s, x, 'consigne nulle (silence) hors entretien/douleur')); return; }
      const ei = x.enteteInitial;
      const t = ei ? (ei.jaune || []).join(' ') + ' ' + (ei.gris || '') : '';
      if (!/\d/.test(t)) ecarts.push(E(r, s, x, 'en-tête sans chiffre : « ' + t.trim() + ' » (état ' + x.consigne.etat + ')'));
    }));
    // coach à la traîne : capacité +5 % sans changement de cible pendant 3 semaines
    const par = {};
    r.seances.forEach((s) => s.exos.forEach((x) => { if (x.consigne && x.consigne.ligne) (par[x.slug] = par[x.slug] || []).push({ s, x }); }));
    Object.keys(par).forEach((slug) => {
      const L = par[slug];
      for (let i = 0; i < L.length; i++) {
        let j = i; while (j < L.length && L[j].s.semaine - L[i].s.semaine < 3) j++;
        if (j >= L.length) break;
        const w = L.slice(i, j + 1); const cible0 = JSON.stringify(w[0].x.consigne.ligne);
        if (w.every((q) => JSON.stringify(q.x.consigne.ligne) === cible0) && w[w.length - 1].x.capacite / w[0].x.capacite >= 1.05) { ecarts.push(E(r, L[j].s, L[j].x, 'traîne : capacité ×' + (w[w.length - 1].x.capacite / w[0].x.capacite).toFixed(3) + ' sans changement de cible sur 3 semaines (' + cible0 + ')')); i = j; }
      }
    });
  });
  return { ok: ecarts.length === 0, n, ecarts };
}
// V4 — aucune charge absurde
function V4(runs) {
  const ecarts = []; let n = 0; const ratios = [];
  runs.forEach((r) => {
    const prec = {};
    r.seances.forEach((s) => s.exos.forEach((x) => {
      const fiche = catalogue[x.slug]; const iso = Moteur.estIsolation({ prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [], stab: fiche.muscles_stabilisateurs || [] }) ? 1.15 : 1;
      (x.lignesInitiales || []).forEach((l) => {
        n++;
        if (l.charge !== null && l.charge !== undefined && (!isFinite(l.charge) || l.charge < 0 && x.mesure !== 'reps' && fiche.charge !== 'assistance')) ecarts.push(E(r, s, x, 'charge non finie ou négative : ' + l.charge));
        if (l.vise !== null && l.vise !== undefined && (l.vise < 1 || l.vise > 30)) ecarts.push(E(r, s, x, 'reps visées hors [1;30] : ' + l.vise));
        if (typeof l.charge === 'number' && l.charge > 0 && l.vise && x.mesure === 'charge_reps') {
          const wmax = x.capacite / (1 + l.vise / (30 * iso));
          const rho = l.charge / wmax; ratios.push(rho);
          if (l.charge / x.capacite > 1.05) ecarts.push(E(r, s, x, 'CRITIQUE charge ' + l.charge + ' > 1,05 × capacité vraie ' + x.capacite));
          else if (rho > 1.08) ecarts.push(E(r, s, x, 'charge ' + l.charge + ' × ' + l.vise + ' : au-dessus de ce que la capacité permet (' + wmax.toFixed(1) + ' kg pour ' + l.vise + ' reps), ratio ' + rho.toFixed(2)));
        }
      });
      const t = txt(x); if (/NaN|undefined|null kg|Infinity|\[object/.test(t)) ecarts.push(E(r, s, x, 'texte invalide : ' + t.slice(0, 160)));
      // saut de charge d'une séance à l'autre
      const l0 = x.consigne && x.consigne.ligne; const p = prec[x.slug];
      if (l0 && typeof l0.charge === 'number' && p && p.charge > 0) {
        const rap = l0.charge / p.charge;
        if (rap > 1.1 && l0.charge - p.charge > 5.01 && ['bord_recul', 'bord_vague', 'reprise_courte', 'reprise_longue', 'nouvelle_zone'].indexOf(x.consigne.etat) < 0) ecarts.push(E(r, s, x, 'saut ×' + rap.toFixed(2) + ' (' + p.charge + ' → ' + l0.charge + '), état ' + x.consigne.etat));
        if (rap < 0.9 && ['bord_recul', 'bord_vague', 'reprise_courte', 'reprise_longue', 'nouvelle_zone'].indexOf(x.consigne.etat) < 0) ecarts.push(E(r, s, x, 'baisse ×' + rap.toFixed(2) + ' (' + p.charge + ' → ' + l0.charge + '), état ' + x.consigne.etat));
      }
      if (l0 && typeof l0.charge === 'number') prec[x.slug] = l0;
    }));
  });
  return { ok: ecarts.length === 0, n, ecarts, ratios };
}
// V5 — phrases contradictoires : I26 (V1) ; constat de fin ↔ consigne suivante
function V5(runs) {
  const ecarts = []; let n = 0;
  runs.forEach((r) => {
    const par = {};
    r.seances.forEach((s) => s.exos.forEach((x) => { (par[x.slug] = par[x.slug] || []).push({ s, x }); }));
    Object.keys(par).forEach((slug) => {
      const L = par[slug];
      for (let i = 0; i + 1 < L.length; i++) {
        const a = L[i].x, b = L[i + 1].x; if (!a.constat || !a.constat.suiteLignes || !b.consigne || !b.consigne.ligne) continue;
        n++;
        const cs = a.constat.suiteLignes.ligne; if (!cs) continue;
        // La consigne REÇUE par la séance suivante = sa première ligne du plan initial (le plan final porte les réactions en séance, §9.14).
        const li = (b.lignesInitiales || []).find((q) => q.role === 'ligne') || b.consigne.ligne;
        if (cs.charge !== li.charge || cs.vise !== li.vise) {
          const ecartJours = (Date.parse(L[i + 1].s.date) - Date.parse(L[i].s.date)) / 864e5;
          const ev = ['reprise_courte', 'reprise_longue', 'nouvelle_zone'].indexOf(b.consigne.etat) >= 0 || ecartJours > 14 || !!L[i + 1].s.allegee || !!L[i].s.allegee;
          if (!ev) ecarts.push(E(r, L[i + 1].s, b, 'le constat de fin disait « ' + a.constat.suite + ' » (' + cs.charge + '×' + cs.vise + ') mais la consigne suivante est ' + li.charge + '×' + li.vise + ' (état ' + b.consigne.etat + ')'));
        }
      }
    });
  });
  return { ok: ecarts.length === 0, n, ecarts };
}
// V6 — voix
const REGLES_VOIX = [
  [/palier|le moteur/i, 'mot interne'], [/bravo|f[ée]licit|excellent|g[ée]nial|bien jou[ée]|super\b/i, 'félicitation'],
  [/\bvous\b|\bvotre\b|\bvos\b/i, 'vouvoiement'], [/\d\.\d/, 'point décimal'],
  [/absent|pas venu|depuis \d+ jours|r[ée]gularit[ée]|assidu|manqu[ée]/i, 'assiduité / durée d\'absence'],
  [/tu aurais d[ûu]|il faut\b|\btrop\b/i, 'reproche / injonction'], [/\?/, 'point d\'interrogation'],
  [/(?<![\d,]\s*kg\s)(?<!kg )×/, '× sans kg avant (à contrôler)']
];
function reglesVoix() {
  const fs = require('fs'); const f = '/home/claude/nuit/audit-fil/voix-regles.json';
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8')).interdits.map((r) => ({ re: new RegExp(r.motif, r.drapeaux || ''), nom: r.regle.split(' ;')[0].slice(0, 70), gravite: r.gravite, compter: /cran/.test(r.motif) && /compter/i.test(r.sauf || ''), motif: r.motif }));
}
function V6(runs) {
  const ecarts = []; let n = 0; const REGLES = reglesVoix(); const compte = {};
  runs.forEach((r) => r.seances.forEach((s) => s.exos.forEach((x) => {
    const phrases = []; if (x.enteteInitial) { phrases.push(...(x.enteteInitial.jaune || []), x.enteteInitial.gris || ''); }
    (x.phrases || []).forEach((p) => phrases.push(p.texte)); if (x.constat) phrases.push(x.constat.verdict, x.constat.suite);
    phrases.forEach((p) => {
      if (!p) return; n++; const t = nbsp(p);
      if (REGLES) {
        REGLES.forEach((g) => { if (g.re.test(t)) {
          if (g.compter) { compte[g.motif] = (compte[g.motif] || 0) + 1; return; }
          if (/\\\?/.test(g.motif) && / ou /.test(t)) return;
          const e = E(r, s, x, '[' + g.nom + '] ' + t.slice(0, 160)); e.gravite = g.gravite; ecarts.push(e);
        } });
        return;
      }
      REGLES_VOIX.forEach(([re, nom]) => { if (re.test(t)) {
        if (nom.indexOf('×') === 0) return;
        if (nom === 'point d\'interrogation' && / ou /.test(t)) return;
        ecarts.push(E(r, s, x, '[' + nom + '] ' + t.slice(0, 160)));
      } });
    });
  })));
  const vu = {}; const dedup = ecarts.filter((e) => { const k = e.detail; if (vu[k]) return false; vu[k] = 1; return true; });
  return { ok: dedup.length === 0, n, ecarts: dedup, brut: ecarts.length, cran: compte };
}
// V7 — progrès réaliste (bornes ramenées à 16 semaines ; d'où elles viennent : voir le rapport)
// [bas, haut, hors] à 16 semaines. Source : bornes-verifiees.json (agent C). Débutant : +15 à +30 % à 12 sem (REFERENTIEL §1.2, seconde main), > +40 % hors ;
// ramené à 16 sem par le facteur du modèle (×1,28) = EXTRAPOLATION. Intermédiaire 1re année : Latella 2024 (+7,5 à +12,5 %/an, pro rata 16 sem : 2,3-3,8 %), hors > 7 % ;
// 2e-5e année (3_a_5_ans) : +2 à +6 %/an, pro rata 0,6-1,8 %, hors > 4,6 %. Avancé : +0,3 à +2 %/an, hors > 8 %/an, pro rata 0,1-0,6 / > 2,5 %.
const BORNES = { moins_1_an: [19, 38, 51], '1_a_3_ans': [2.3, 3.8, 7], '3_a_5_ans': [0.6, 1.8, 4.6], plus_5_ans: [0.1, 0.6, 2.5] };
const GRANDS = /^(squat_barre|developpe_couche_barre|developpe_couche_haltere|souleve_de_terre_barre|developpe_militaire_barre|developpe_militaire_haltere|rowing_penche_barre|hip_thrust_barre|presse_a_cuisses)$/;
function V7(runs) {
  const ecarts = []; let n = 0; const courbes = {};
  runs.forEach((r) => {
    const par = {};
    r.seances.forEach((s) => s.exos.forEach((x) => { if (x.consigne && x.consigne.ligne && typeof x.consigne.ligne.charge === 'number' && x.consigne.ligne.charge > 0 && x.mesure === 'charge_reps') (par[x.slug] = par[x.slug] || []).push({ s, x }); }));
    Object.keys(par).forEach((slug) => {
      const L = par[slug]; if (L.length < 8 || !GRANDS.test(slug)) return; n++;
      // charge de travail rapportée à une e1RM implicite (Epley) pour comparer à reps variables
      const e1 = (q) => q.x.consigne.ligne.charge * (1 + q.x.consigne.ligne.vise / 30);
      const prem = L.slice(1, 4), der = L.slice(-3); // on saute la 1re séance (charge de départ inventée)
      const a = prem.reduce((t, q) => t + e1(q), 0) / prem.length, b = der.reduce((t, q) => t + e1(q), 0) / der.length;
      const pct = (b / a - 1) * 100; const B = BORNES[r.profil.anciennete];
      (courbes[r.profil.id + '-g' + r.graine] = courbes[r.profil.id + '-g' + r.graine] || {})[slug] = Math.round(pct * 10) / 10;
      const w = L[L.length - 1].s.semaine - L[1].s.semaine;
      const coef = 16 / Math.max(w, 1);
      const pct16 = pct * coef;
      if (pct16 > B[2]) ecarts.push(E(r, L[L.length - 1].s, L[L.length - 1].x, 'progrès +' + pct16.toFixed(1) + ' % (e1RM de la consigne, ramené à 16 sem.) au-dessus de la borne haute ' + B[2] + ' % pour ' + r.profil.anciennete));
      // coach timide : la charge de la ligne rapportée à ce que la capacité vraie permet pour les reps visées (wmax = C / (1 + reps/30)),
      // sous 0,75 pendant au moins 4 semaines consécutives, sans aucune série ratée sur ces semaines (le seuil 0,65 × C du plan est faux
      // au-delà de 13 reps : 1 / (1 + 16/30) = 0,65). L'écart inclut la charge de départ inventée (0,6 à 0,75 × C) : on l'écarte (1re séance).
      const fich = catalogue[slug]; const isoF = Moteur.estIsolation({ prim: fich.muscles_primaires || [], sec: fich.muscles_secondaires || [], stab: fich.muscles_stabilisateurs || [] }) ? 1.15 : 1;
      const parSem = {};
      L.slice(1).forEach((q) => { if (!q.x.capacite || q.x.consigne.ligne.vise > 30) return; const wm = q.x.capacite / (1 + q.x.consigne.ligne.vise / (30 * isoF)); (parSem[q.s.semaine] = parSem[q.s.semaine] || { rho: [], rat: 0 }); parSem[q.s.semaine].rho.push(q.x.consigne.ligne.charge / wm); parSem[q.s.semaine].rat += q.x.fait.filter((f) => f.ratee).length; });
      const sems = Object.keys(parSem).map(Number).sort((u, v) => u - v);
      let suite = 0, debut = null;
      for (let i = 0; i < sems.length; i++) {
        const w = parSem[sems[i]]; const moy = w.rho.reduce((t, u) => t + u, 0) / w.rho.length;
        if (moy < 0.75 && w.rat === 0 && (i === 0 || sems[i] - sems[i - 1] <= 2)) { suite++; if (suite === 1) debut = sems[i]; } else suite = 0;
        if (suite === 4) { ecarts.push(E(r, L[L.length - 1].s, L[L.length - 1].x, 'timide : la ligne reste sous 0,75 × ce que la capacité permet, 4 semaines sans ratée (dès la semaine ' + debut + ')')); break; }
      }
    });
    // téméraire : > 30 % de séries ratées sur 3 semaines
    const semaines = {};
    r.seances.forEach((s) => s.exos.forEach((x) => { if (!x.consigne) return; (semaines[s.semaine] = semaines[s.semaine] || { f: 0, t: 0 }); x.fait.forEach((f) => { semaines[s.semaine].t++; if (f.ratee) semaines[s.semaine].f++; }); }));
    const ks = Object.keys(semaines).map(Number).sort((a, b) => a - b);
    for (let i = 0; i + 2 < ks.length; i++) { const w = [ks[i], ks[i + 1], ks[i + 2]]; if (w[2] - w[0] > 3) continue; const f = w.reduce((t, k) => t + semaines[k].f, 0), t = w.reduce((q, k) => q + semaines[k].t, 0); if (t >= 30 && f / t > 0.3) { ecarts.push({ profil: r.profil.id, graine: r.graine, semaine: w[2], seance: null, exo: null, detail: 'téméraire : ' + Math.round(100 * f / t) + ' % de séries ratées sur les semaines ' + w.join('-') }); break; } }
  });
  return { ok: ecarts.length === 0, n, ecarts, courbes };
}
// V9 — décharge neutre (X18 + tout bloc planifié)
function V9(runs) {
  const ecarts = []; let n = 0;
  runs.forEach((r) => {
    if (!r.profil.special.cycles) return;
    const par = {};
    r.seances.forEach((s) => s.exos.forEach((x) => { (par[x.slug] = par[x.slug] || []).push({ s, x }); }));
    Object.keys(par).forEach((slug) => par[slug].forEach(({ s, x }, i) => {
      const dech = s.semaine % 4 === 0; if (!dech || !x.consigne) return; n++;
      const prev = par[slug][i - 1]; if (!prev) return;
      const lg = x.lignesInitiales; const c0 = prev.x.consigne && prev.x.consigne.ligne;
      if (c0 && lg.length && lg[0].charge !== c0.charge) ecarts.push(E(r, s, x, 'décharge : la charge change (' + c0.charge + ' → ' + lg[0].charge + ')'));
      if (/baisse|moins que|perdu|r[ée]gress/i.test(txt(x))) ecarts.push(E(r, s, x, 'phrase de perte pendant la décharge : ' + txt(x).slice(0, 140)));
      if (x.consigne.etat === 'bord_recul' || x.consigne.etat === 'bord_vague') ecarts.push(E(r, s, x, 'décharge : ' + x.consigne.etat));
    }));
  });
  return { ok: ecarts.length === 0, n, ecarts };
}
// V10 — l'échec jamais puni
function V10(runs) {
  const ecarts = []; let n = 0;
  runs.forEach((r) => {
    const par = {};
    r.seances.forEach((s) => s.exos.forEach((x) => {
      if (x.contrefactuel) { n++; const c = x.contrefactuel; if (c.etat !== c.etatSans && c.etat !== 'bord_garde') ecarts.push(E(r, s, x, 'réserve 0 change la suite : ' + c.etat + ' vs sans réserve ' + c.etatSans + ' (' + JSON.stringify(c.ligne) + ' / ' + JSON.stringify(c.ligneSans) + ')')); else if (JSON.stringify(c.ligne) !== JSON.stringify(c.ligneSans) && c.etat !== 'bord_garde') ecarts.push(E(r, s, x, 'réserve 0 change la ligne suivante : ' + JSON.stringify(c.ligne) + ' vs ' + JSON.stringify(c.ligneSans))); }
      (par[x.slug] = par[x.slug] || []).push({ s, x });
    }));
    Object.keys(par).forEach((slug) => par[slug].forEach(({ s, x }, i) => {
      if (!x.consigne || x.consigne.etat !== 'bord_recul') return; n++;
      const p = par[slug][i - 1]; if (!p) return;
      const rate = p.x.fait.some((f) => f.ratee);
      if (!rate) ecarts.push(E(r, s, x, 'recul sans barre ratée à la séance d\'avant'));
      const a = p.x.consigne && p.x.consigne.ligne, b = x.consigne.ligne;
      if (a && b && b.charge >= a.charge) ecarts.push(E(r, s, x, 'recul qui ne baisse pas la charge (' + a.charge + ' → ' + b.charge + ')'));
    }));
  });
  return { ok: ecarts.length === 0, n, ecarts };
}
module.exports = { charger, V1, V2, V3, V4, V5, V6, V7, V9, V10 };
if (require.main === module) {
  const dossier = process.argv[2]; const runs = charger(dossier); const out = {};
  [['V1', V1], ['V2', V2], ['V3', V3], ['V4', V4], ['V5', V5], ['V6', V6], ['V7', V7], ['V9', V9], ['V10', V10]].forEach(([k, f]) => { out[k] = f(runs); console.log(k, 'ok=' + out[k].ok, 'n=' + out[k].n, 'écarts=' + out[k].ecarts.length); });
  fs.writeFileSync(path.join(dossier, '..', 'verifs.json'), JSON.stringify(out, (k, v) => (k === 'ratios' ? undefined : v), 1));
}
