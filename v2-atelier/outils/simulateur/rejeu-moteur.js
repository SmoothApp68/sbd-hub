'use strict';
// REJEU NIVEAU N (AUDIT-PLAN §3) : pour chaque exercice et chaque séance k, la consigne que le coach d'AUJOURD'HUI donne sur
// l'historique 0..k-1, comparée à ce que la personne a fait en k. Lecture seule ; les données ne sont jamais copiées dans le dépôt :
// seules des agrégats et des alias (u-rejeu-N) sortent, vers /home/claude/nuit/audit-fil/.
const fs = require('fs'); const path = require('path');
const C = require('./charger.js'); const { Moteur, Palier, Modele } = C;
const fx = (n) => require('../../../tests/unit/fixtures/' + n + '.json');
const cat75 = {}; fx('cas-75-reel').catalogue.forEach((x) => { cat75[x.slug] = x; });
const cat66 = Object.assign({}, fx('cas-66c-generateur').catalogue, fx('cas-66d-generateur').catalogue);

function ficheDe(slug) {
  const f = cat66[slug] || cat75[slug];
  if (f) return { equipement: f.equipement, charge: f.charge || (f.equipement === 'aucun' ? 'aucune' : 'absolue'), muscles_primaires: f.muscles_primaires || [], muscles_secondaires: f.muscles_secondaires || [], muscles_stabilisateurs: f.muscles_stabilisateurs || [] };
  const eq = /barre/.test(slug) ? 'barre' : /haltere/.test(slug) ? 'haltere' : /poulie|cable/.test(slug) ? 'poulie' : /machine|presse|hack/.test(slug) ? 'machine' : 'aucun';
  return { equipement: eq, charge: eq === 'aucun' ? 'aucune' : 'absolue', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [], devine: true };
}
function parserTexte(fichier) {
  const lignes = fs.readFileSync(fichier, 'utf8').split('\n');
  const entete = lignes[0] || ''; const profil = {};
  const m = (re) => { const x = re.exec(entete); return x ? x[1].trim() : null; };
  profil.sexe = m(/sexe ([^;]+)/); profil.rythme = m(/rythme ([^;]+)/) || 'normal'; profil.intention = m(/intention ([^;]+)/) || 'progresser';
  profil.phase = m(/phase ([^;]+)/); profil.objectif = m(/objectif ([^;]+?)(?:;|$)/);
  const seances = [];
  lignes.filter((l) => l && l[0] !== '#').forEach((l, i) => {
    const parts = l.split('|'); const d = parts.shift(); const mm = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(d); if (!mm) return;
    const debut = new Date(+mm[1], +mm[2] - 1, +mm[3], +mm[4], +mm[5]).toISOString();
    const exos = parts.map((p) => {
      const t = p.trim().split(/\s+/); const slug = t.shift();
      const series = t.map((s) => {
        const ratee = s[0] === '!'; const deg = s[0] === 'd'; const s2 = s.replace(/^[!d]/, '');
        const q = /^(-?[\d.]*)x(\d+)(?:@([\d.]+))?$/.exec(s2); if (!q) return null;
        const charge = q[1] === '' || q[1] === '-' ? (q[1] === '-' ? null : null) : Number(q[1]);
        return { charge_kg: s2[0] === '-' && q[1] === '-' ? null : charge, reps: Number(q[2]), rpe: q[3] ? Number(q[3]) : null, ratee, deg };
      }).filter(Boolean);
      return { slug, series };
    });
    seances.push({ id: 'R' + (i + 1), debut, exos });
  });
  return { profil, seances };
}
function rejouer(alias, profil, seances, opts) {
  const reglage = ['prudent', 'normal', 'franc'].indexOf(profil.rythme) >= 0 ? profil.rythme : 'normal';
  const par = {};   // slug -> groupes
  const res = { alias, seances: seances.length, exos: 0, cas: 0, silence: 0, sur: 0, sous: 0, juste: 0, etats: {}, compteur4: 0, cartesPotentielles: 0, bornes: [], exemples: [], voix: [], absurdes: [] };
  let rowId = 0;
  seances.forEach((se, k) => {
    se.exos.forEach((x) => {
      const trav = x.series.filter((s) => !s.deg && (s.reps > 0 || s.charge_kg !== undefined));
      if (!trav.length) return;
      const groupes = par[x.slug] || [];
      const fiche = ficheDe(x.slug);
      const mesure = trav.some((s) => typeof s.charge_kg === 'number') || groupes.some((g) => g.series.some((s) => typeof s.charge_kg === 'number')) ? 'charge_reps' : 'reps';
      if (groupes.length >= 1 && profil.intention !== 'entretien') {
        res.cas++;
        const o = { mesure, equipement: Moteur.equipementEffectif(fiche), intention: profil.intention === 'entretien' ? 'entretien' : 'progresser', reglage, edition: false,
          seancesSousConsigne: groupes.map((g) => g.seance.id), isolation: false, lestPossible: false, depart: null, salle: null };
        let c = null;
        try { c = Moteur.consigneDExercice(groupes, Palier.etatsExercices(groupes.map((g) => ({ slug: x.slug, series: g.series })))[x.slug], se.debut, o); } catch (e) { res.exemples.push({ erreur: e.message, slug: x.slug, seance: k + 1 }); }
        const kc = c && c.consigne;
        if (!kc) { res.silence++; }
        else {
          res.etats[kc.etat] = (res.etats[kc.etat] || 0) + 1;
          if (c.compteur && c.compteur.compteur >= 4) res.compteur4++;
          const l = kc.ligne;
          try { const lib = Moteur.libellesConsigne(kc, se.debut); const t = (lib.gris || '') + ' ' + ((lib.jaune || []).join ? lib.jaune.join(' ') : ''); if (/NaN|undefined|null kg|Infinity|\[object/.test(t)) res.voix.push({ seance: k + 1, slug: x.slug, texte: t.slice(0, 120) }); } catch (e) {}
          if (l && typeof l.charge === 'number') {
            const first = trav[0];
            const fait = typeof first.charge_kg === 'number' ? first.charge_kg : null;
            const maxC = Math.max.apply(null, trav.map((s) => (typeof s.charge_kg === 'number' ? s.charge_kg : -Infinity)));
            if (fait !== null && l.charge > 0) {
              const propMax = kc.haut && typeof kc.haut.charge === 'number' ? Math.max(l.charge, kc.haut.charge) : l.charge; const rap = maxC / propMax;
              const repsFaits = trav.filter((s) => s.charge_kg === maxC).map((s) => s.reps);
              const miss = repsFaits.length && Math.max.apply(null, repsFaits) < l.vise - 1;
              if (maxC < l.charge * 0.97 || (maxC <= propMax * 1.0 && miss)) { res.sur++; if (res.exemples.length < 8) res.exemples.push({ type: 'sur', seance: k + 1, slug: x.slug, etat: kc.etat, propose: l, fait: { max: maxC, reps: repsFaits } }); }
              else if (rap > 1.05) res.sous++; else res.juste++;
              res.bornes.push(rap);
              const histMax = Math.max.apply(null, groupes.map((g) => Math.max.apply(null, g.series.map((s) => (typeof s.charge_kg === 'number' ? s.charge_kg : 0)))));
              if (histMax > 0 && l.charge > histMax * 1.12 && ['bord', 'progression', 'test_propose'].indexOf(kc.etat) < 0 || (histMax > 0 && l.charge > histMax * 1.25)) res.absurdes.push({ seance: k + 1, slug: x.slug, etat: kc.etat, propose: l, histMax });
            }
          }
        }
      }
      const seriesH = trav.map((s) => ({ id: 'q' + (++rowId), rang: 0, charge_kg: s.charge_kg === undefined ? null : s.charge_kg, reps: s.reps, rpe: s.rpe, ressenti: null, type_serie: s.ratee ? 'echec' : 'travail', exercise_slug: x.slug, validee_a: se.debut })).map((s, i) => Object.assign(s, { rang: i + 1 }));
      (par[x.slug] = par[x.slug] || []).push({ seance: { id: se.id, debut: se.debut }, series: seriesH });
    });
  });
  res.exos = Object.keys(par).length;
  return res;
}
function rejeuAurel() {
  const D = fx('cas-74-reel'); const seancesParId = {};
  Object.keys(D.exercices).forEach((cle) => { D.exercices[cle].seances.forEach((g) => { const s = seancesParId[g.id] || (seancesParId[g.id] = { id: g.id, debut: g.debut, exos: [] }); s.exos.push({ slug: cle.split('|')[1], series: g.series.filter((r) => r[1] === 'travail').map((r) => ({ charge_kg: r[2], reps: r[3], rpe: r[4], ressenti: r[5] })) }); }); });
  const seances = Object.values(seancesParId).sort((a, b) => a.debut < b.debut ? -1 : 1);
  return rejouer('u-rejeu-1 (aurel_br, fixtures cas-74-reel)', { rythme: 'franc', intention: 'progresser' }, seances);
}
if (require.main === module) {
  const dossier = '/home/claude/nuit/rejeu'; const sortie = '/home/claude/nuit/audit-fil';
  const out = [rejeuAurel()];
  [2, 3, 4, 5].forEach((n) => { const f = path.join(dossier, 'u-rejeu-' + n + '.txt'); if (!fs.existsSync(f)) return; const { profil, seances } = parserTexte(f); out.push(rejouer('u-rejeu-' + n, profil, seances)); });
  out.forEach((r) => { r.mediane = r.bornes.length ? r.bornes.sort((a, b) => a - b)[Math.floor(r.bornes.length / 2)] : null; delete r.bornes; });
  fs.writeFileSync(path.join(sortie, 'rejeu-N.json'), JSON.stringify(out, null, 1));
  out.forEach((r) => console.log(r.alias, 'séances', r.seances, 'exos', r.exos, 'cas', r.cas, 'silence', r.silence, 'sur', r.sur, 'sous', r.sous, 'juste', r.juste, 'compteur>=4', r.compteur4, 'absurdes', r.absurdes.length, JSON.stringify(r.etats)));
}
module.exports = { parserTexte, rejouer };
