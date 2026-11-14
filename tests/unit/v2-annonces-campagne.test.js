/** @jest-environment node */
//
// « Les mots disent vrai » PR 5a (MOTEUR §9.48, I164) — LA CAMPAGNE DES ANNONCES : 80 pratiquants × 12 semaines synthétiques (graine fixe), 880 séances-exercices.
// Pour chaque fin d'exercice, l'annonce (`constatDuJour`, avec le `testConfirme` que `suiteDExercice` rend) est comparée à la fois suivante RÉELLE : la
// consigne que le moteur calcule, une semaine plus tard, sur l'historique augmenté de la séance du jour — un objet DIFFÉRENT de celui dont l'annonce est
// écrite (c'est la circularité qu'`verifierAnnonce` ne peut pas lever, et que ce test lève). Et la condition de « Il te manque N reps » est REJOUÉE à la main :
// la personne fait exactement le haut de la zone, avec la réserve qu'elle avait notée, et le moteur propose bien le test.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');

const O = { mesure: 'charge_reps', equipement: 'poulie', intention: 'progresser', reglage: 'normal', edition: false };
const esp = (t) => String(t == null ? '' : t).replace(/[\u00a0\u202f]/g, ' ');
let g = 20261114;
const al = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
let n = 0;
const groupes = (slug, seances) => seances.map((s, i) => ({ seance: { id: 'H' + i, debut: s[0], routine_id: 'R' },
  series: s[1].map((x) => ({ id: 'r' + (++n), rang: n, charge_kg: x[0], reps: x[1], rpe: null, ressenti: x[2] || null, type_serie: 'travail', exercise_slug: slug, au_max_reserve: null })) }));
const lg = (c) => (c && c.ligne ? c.ligne.charge + 'x' + c.ligne.vise : '-');

function campagne(reglage) {
  const o = Object.assign({}, O, { reglage: reglage });
  const C = { seances: 0, annonces: 0, silence: 0, meme_cible: 0, verbe: 0, verbe_faux: 0, prochaine: 0, prochaine_fausse: 0, manque: 0, manque_non_tenue: 0, manque_candidates: 0, ligne_des_annonces: [] };
  g = 20261114;
  for (let a = 0; a < 80; a++) {
    const slug = ['rowing_poulie_assis', 'leg_curl_assis', 'elevation_laterale_poulie'][a % 3];
    let cap = 7 + Math.floor(al() * 4);
    const charge = 40 + Math.floor(al() * 20) * 2.5, pFond = 0.2 + al() * 0.5;
    const hist = [];
    for (let s = 0; s < 12; s++) {
      const jour = new Date(Date.UTC(2026, 8, 1 + s * 7, 17)).toISOString();
      const gr = groupes(slug, hist);
      const r = M.consigneDExercice(gr, undefined, jour, o);
      const c = r && r.consigne;
      if (!c || !c.ligne || c.ligne.vise === null || c.ligne.vise === undefined) { hist.push([jour, [[charge, cap], [charge, cap], [charge, cap - 1]]]); continue; }
      const ch = c.ligne.charge, cible = c.ligne.vise;
      if (al() < 0.3) cap++;
      const reps = Math.min(cible, cap);
      const nn = c.n || 3;
      const jr = [jour, Array.from({ length: nn }, (_, i) => [ch, Math.max(1, reps - (i === nn - 1 && al() < 0.3 ? 1 : 0)),
        i === nn - 1 ? (al() < pFond ? 'reste_0' : al() < 0.5 ? 'reste_1' : 'reste_2') : null])];
      const gj = groupes(slug, [jr])[0];
      const su = M.suiteDExercice(gr, gj, undefined, jour.replace('17:00', '20:00'), o);
      C.seances++;
      if (!su) { hist.push(jr); continue; }
      const k = M.constatDuJour(c, su.apres.consigne, reglage, su.cranSuivant,
        { series: gj.series.map((x) => ({ charge_kg: x.charge_kg, reps: x.reps })) }, jour, su.cranSuivantApprochee === true, su.testConfirme === true);
      const ann = k && k.suite ? esp(k.suite) : null;
      // La fois suivante RÉELLE (un objet que l'annonce n'a pas lu), à l'écart d'une semaine.
      const suivante = M.consigneDExercice(gr.concat([gj]), undefined, new Date(Date.parse(jour) + 7 * 864e5).toISOString(), o).consigne;
      if (!ann) { if (k) C.silence++; }
      else {
        C.annonces++;
        if (/Même cible/.test(ann)) C.meme_cible++;
        let m = /^La prochaine fois : (.*)\.$/.exec(ann);
        if (m) {
          C.verbe++;
          // Arithmétique à part : le verbe et la ligne se relisent sur la consigne suivante réelle, jamais sur `su.apres`.
          const plus = suivante.ligne.vise - suivante.niveau;
          const dePlus = /^(une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+) reps? de plus, /.exec(m[1]);
          const reste = /^tu restes à /.test(m[1]), cibleDite = /^ta cible, /.test(m[1]), garde = /^je garde /.test(m[1]);
          const ok = (dePlus ? plus > 0 : reste ? plus === 0 : cibleDite ? plus < 0 : garde ? true : false) &&
            lg(suivante) === lg(su.apres.consigne);
          if (!ok) { C.verbe_faux++; C.ligne_des_annonces.push('VERBE ' + ann + ' | ' + lg(suivante) + ' niveau ' + suivante.niveau); }
        }
        m = /^Prochaine séance : /.exec(ann);
        if (m) {
          C.prochaine++;
          if (lg(suivante) !== lg(su.apres.consigne) && !/ puis /.test(ann)) { C.prochaine_fausse++; C.ligne_des_annonces.push('PROCHAINE ' + ann + ' | ' + lg(suivante)); }
        }
        m = /^Il te manque (?:une rep|\S+ reps) pour tester (?:≈ )?([\d,]+) kg\.$/.exec(ann);
        if (m) {
          C.manque++;
          // La condition REJOUÉE : le haut de la zone, à toutes les séries, avec la réserve notée aujourd'hui sur la dernière.
          const hi = M.zoneParCle(su.apres.consigne.zone).haut;
          const derniere = jr[1][jr[1].length - 1][2];
          const j2 = [new Date(Date.parse(jour) + 7 * 864e5).toISOString(), Array.from({ length: nn }, (_, i) => [su.apres.consigne.ligne.charge, hi, i === nn - 1 ? derniere : null])];
          const g2 = groupes(slug, [j2])[0];
          const nx2 = M.consigneDExercice(gr.concat([gj, g2]), undefined, new Date(Date.parse(jour) + 14 * 864e5).toISOString(), o).consigne;
          const ok = nx2.etat === 'test_propose' && nx2.haut && String(nx2.haut.charge).replace('.', ',') === m[1];
          if (!ok) { C.manque_non_tenue++; C.ligne_des_annonces.push('MANQUE ' + ann + ' → ' + nx2.etat); }
        }
      }
      if (su.testConfirme === null || su.testConfirme === false) {
        // les candidates (la branche existait, le moteur n'a pas confirmé) : la phrase ne se dit jamais.
        const k0 = M.constatDuJour(c, su.apres.consigne, reglage, su.cranSuivant, { series: gj.series.map((x) => ({ charge_kg: x.charge_kg, reps: x.reps })) }, jour, su.cranSuivantApprochee === true, true);
        if (k0 && /^Il te manque/.test(esp(k0.suite))) { C.manque_candidates++; if (ann && /^Il te manque/.test(ann)) C.ligne_des_annonces.push('DITE SANS CONFIRMATION ' + ann); }
      }
      hist.push(jr);
    }
  }
  return C;
}

if (process.env.CAMPAGNE_IMPRIME) { ['normal', 'franc'].forEach((r) => { const C = campagne(r); delete C.ligne_des_annonces; console.log(r, JSON.stringify(C)); }); }
describe('la campagne des annonces : l’annonce dit la fois suivante RÉELLE (PR 5a, I164)', () => {
  ['normal', 'franc'].forEach((reglage) => {
    describe(reglage, () => {
      const C = campagne(reglage);
      test('880 séances-exercices ; « Même cible » n’existe plus', () => {
        expect(C.seances).toBe(880);
        expect(C.meme_cible).toBe(0);
      });
      test('aucune annonce démentie par la consigne suivante (verbe, ligne, « Prochaine séance »)', () => {
        expect(C.ligne_des_annonces).toEqual([]);
        expect([C.verbe_faux, C.prochaine_fausse]).toEqual([0, 0]);
        // Normal : les 283 anciens « Même cible » sont devenus 283 annonces de verbe ; les 520 « Prochaine séance » sont inchangées.
        expect([C.verbe, C.prochaine]).toEqual(reglage === 'normal' ? [283, 520] : [212, 608]);
      });
      test('« Il te manque N reps » : toujours tenue quand la personne fait pile ce qui manque ; les candidates non confirmées se taisent', () => {
        expect(C.manque_non_tenue).toBe(0);
        // Avant la PR : 77 « Il te manque » en Normal, dont 38 démenties ; aujourd'hui 18 dites (toutes tenues) et 59 tues. En Franc : 60 candidates, 30 confirmées, 30 tues.
        expect([C.manque, C.manque_candidates]).toEqual(reglage === 'normal' ? [18, 59] : [30, 30]);
      });
      test('le silence reste rare (C6 : alerte à 15 % des séances-exercices)', () => {
        expect(C.silence / C.seances).toBeLessThan(0.15);
      });
    });
  });
});
