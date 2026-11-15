/** @jest-environment node */
//
// « Les mots disent vrai » PR 5b-1 (MOTEUR §9.50, I169) — LA CAMPAGNE DES RÉGIMES : 60 pratiquants × 5 cadences (2, 3,5, 7, 10 et 14 jours, gigue ± 2 jours) × 12 séances,
// des blocs de 4 semaines à décharge qui s'enchaînent (la décharge est la semaine 4). Pour chaque fin d'exercice :
//   · l'annonce est écrite par `constatDuJour` avec le régime que `Moteur.regimeAVenir` rend (l'écart vient de `suiteDExercice`) ;
//   · la fois suivante RÉELLE (la date tirée de la séance d'après, que l'annonce n'a pas lue) est jouée contre `Moteur.dechargeDuJour`, la décision que le plan applique
//     à la consigne du jour : si elle tombe dans une décharge, l'annonce chiffrée était DÉMENTIE.
// Trois comptes, imprimés : la part d'annonces sous régime ; le SUR-SILENCE (une annonce vraie remplacée par la date : non plafonné, c'est le prix de la fenêtre) ;
// le MENSONGE RÉSIDUEL (une annonce chiffrée démentie : la personne arrive hors fenêtre) — plafonné à 2 %.
// Limite déclarée : c'est la décision de décharge qui est jouée (`dechargeDuJour`), pas `planDeSeance` de la séance suivante.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');   // MOTEUR §9.51 ter : le moteur lit `THPeriode` (comme index.html, qui le charge avant lui)
const M = require('../../v2/js/moteur.js');
const Faits = require('../../v2/js/faits.js').creer();

const O = { mesure: 'charge_reps', equipement: 'poulie', intention: 'progresser', reglage: 'normal', edition: false, zonePlan: 'hypertrophie', zonesDeRoutine: { R: 'hypertrophie' } };
const esp = (t) => String(t == null ? '' : t).replace(/[  ]/g, ' ');
const JOUR_MS = 864e5;
const BLOCS = Array.from({ length: 10 }, (_, k) => ({ id: 'B' + k, statut: 'en_cours', semaines: 4, decharge: true, zone: 'hypertrophie', exercices: [],
  debut: new Date(Date.UTC(2026, 8, 7 + 28 * k)).toISOString().slice(0, 10) }));
let g = 20261115;
const al = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
let n = 0;
const groupes = (slug, seances) => seances.map((s, i) => ({ seance: { id: 'H' + i, debut: s[0], routine_id: 'R' },
  series: s[1].map((x) => ({ id: 'r' + (++n), rang: n, charge_kg: x[0], reps: x[1], rpe: null, ressenti: x[2] || null, type_serie: 'travail', exercise_slug: slug, au_max_reserve: null })) }));

function campagne() {
  const par = {};
  const C = { annonces: 0, sous_regime: 0, sur_silence: 0, mensonge: 0, chiffre_sous_regime: 0, silence_cree: 0 };
  [2, 3.5, 7, 10, 14].forEach((cad) => {
    const P = par[cad] = { annonces: 0, sous_regime: 0, sur_silence: 0, mensonge: 0 };
    for (let a = 0; a < 60; a++) {
      const slug = ['rowing_poulie_assis', 'leg_curl_assis', 'elevation_laterale_poulie'][a % 3];
      let cap = 7 + Math.floor(al() * 4);
      const charge = 40 + Math.floor(al() * 20) * 2.5, pFond = 0.2 + al() * 0.5;
      const dates = [];
      let t = Date.UTC(2026, 8, 7, 17) + Math.floor(al() * 5) * JOUR_MS;
      for (let s = 0; s < 13; s++) { dates.push(t); t += Math.max(1, Math.round(cad + (al() * 4 - 2))) * JOUR_MS; }
      const hist = [];
      for (let s = 0; s < 12; s++) {
        const jour = new Date(dates[s]).toISOString();
        const suivant = new Date(dates[s + 1]).toISOString();
        const gr = groupes(slug, hist);
        const r = M.consigneDExercice(gr, undefined, jour, O);
        const c = r && r.consigne;
        if (!c || !c.ligne || c.ligne.vise === null || c.ligne.vise === undefined) { hist.push([jour, [[charge, cap], [charge, cap], [charge, cap - 1]]]); continue; }
        const ch = c.ligne.charge, cible = c.ligne.vise;
        if (al() < 0.3) cap++;
        const reps = Math.min(cible, cap), nn = c.n || 3;
        const jr = [jour, Array.from({ length: nn }, (_, i) => [ch, Math.max(1, reps - (i === nn - 1 && al() < 0.3 ? 1 : 0)),
          i === nn - 1 ? (al() < pFond ? 'reste_0' : al() < 0.5 ? 'reste_1' : 'reste_2') : null])];
        const gj = groupes(slug, [jr])[0];
        hist.push(jr);
        // La séance du jour est elle-même une décharge : pas de constat (la consigne est allégée).
        if (M.dechargeDuJour(BLOCS, M.jourCivil(jour), []) !== null) continue;
        const gjApp = Faits.groupeDuJour({ debut: jr[0], routine_id: 'R' }, gj.series);
        const su = M.suiteDExercice(gr, gjApp, undefined, jour.replace('17:00', '20:00'), O);
        if (!su) continue;
        const regime = M.regimeAVenir({ jour: M.jourCivil(jour), ecart: su.ecart, blocs: BLOCS, finsAllegees: [], test: null, slug, famille: null, zone: su.apres.consigne.zone });
        const k = (reg) => M.constatDuJour(c, su.apres.consigne, 'normal', su.cranSuivant, { series: gj.series.map((x) => ({ charge_kg: x.charge_kg, reps: x.reps })) },
          jour, su.cranSuivantApprochee === true, su.testConfirme === true, reg);
        const sans = k(null), avec = k(regime);
        if (!sans || !sans.suite) { if (avec && avec.suite) C.silence_cree++; continue; }
        C.annonces++; P.annonces++;
        const dementi = M.dechargeDuJour(BLOCS, M.jourCivil(suivant), []) !== null;
        if (regime) {
          C.sous_regime++; P.sous_regime++;
          if (/kg|×|\brep/.test(esp(avec.suite))) C.chiffre_sous_regime++;
          if (!dementi) { C.sur_silence++; P.sur_silence++; }
        } else if (dementi) { C.mensonge++; P.mensonge++; }
      }
    }
  });
  return { C, par };
}

describe('la campagne des régimes : l’annonce chiffrée démentie par la décharge', () => {
  const R = campagne();
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0') + ' %';
  test('mesure imprimée : part sous régime, sur-silence, mensonge résiduel (plafond 2 %)', () => {
    const lignes = Object.keys(R.par).map((cad) => 'cadence ' + cad + ' j : ' + R.par[cad].annonces + ' annonces, sous régime ' + pc(R.par[cad].sous_regime, R.par[cad].annonces) +
      ', sur-silence ' + pc(R.par[cad].sur_silence, R.par[cad].annonces) + ', mensonge résiduel ' + pc(R.par[cad].mensonge, R.par[cad].annonces));
    // eslint-disable-next-line no-console
    console.log('CAMPAGNE 5b-1 : ' + R.C.annonces + ' annonces, sous régime ' + pc(R.C.sous_regime, R.C.annonces) + ', sur-silence ' + pc(R.C.sur_silence, R.C.annonces) +
      ', mensonge résiduel ' + pc(R.C.mensonge, R.C.annonces) + '\n' + lignes.join('\n'));
    expect(R.C.annonces).toBeGreaterThan(500);
    expect(R.C.sous_regime).toBeGreaterThan(0);
    expect(R.C.mensonge / R.C.annonces).toBeLessThanOrEqual(0.02);
  });
  test('aucune annonce sous régime ne porte de charge ni de reps ; le régime ne crée jamais d’annonce', () => {
    expect(R.C.chiffre_sous_regime).toBe(0);
    expect(R.C.silence_cree).toBe(0);
  });
});
