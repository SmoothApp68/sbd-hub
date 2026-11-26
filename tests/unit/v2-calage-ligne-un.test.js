/** @jest-environment node */
// 26/11/2026 (lot 5, n° 6, MOTEUR §9.42 delta) — LA CHARGE TAPÉE EN LIGNE 1 VAUT « PARTIR DE LÀ ».
// Taper une charge dans la ligne 1 puis valider ✓ doit produire EXACTEMENT ce que produit « Partir de là » (`Seance.poserHabituelle`) :
// même plan (mode, habituelle, phrase, proposition, question), et le coach ne parle d'« approches » que s'il en reste une à faire.
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');
const S = require('../../v2/js/seance.js');

const DEBUT = '2026-10-29T10:00:00+01:00';
const CAT = { rowing: { equipement: 'barre', muscles_primaires: ['dorsaux'] } };
const silenceC = { etat: 'silence', raison: 'premiere_fois', fondement: {} };
let n = 0;
const id = () => 'q' + (++n);
const seanceDe = (chauffes) => {
  let se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), 'rowing', id, { series: 3, reps_visees: 8 });
  if (chauffes) se = S.insererChauffes(se, 0, [[null, 5], [null, 5]], id);
  return se;
};
const entree = (se, extra) => Object.assign({ seance: { id: 'S', debut: DEBUT, edition: false, exercices: se.exercices },
  consignes: { rowing: { consigne: silenceC, pas: 5 } }, catalogue: CAT, paris: [], suites: {}, debutant: false }, extra || {});
const planDe = (se) => T.planDeSeance(entree(se, { habituelles: se.habituelles })).exercices[0];
const valider = (se, j, charge, reps, ressenti) => {
  se = S.modifierSerie(se, 0, j, { charge_kg: charge, reps });
  if (ressenti) se = S.definirEffort(se, 0, j, { ressenti });
  return S.valider(se, 0, j, new Date('2026-10-29T10:10:00+01:00'));
};
const calageDe = (x) => ({ mode: x.calage.mode, faites: x.calage.faites, habituelle: x.calage.habituelle, suivante: x.calage.suivante, question: x.calage.question,
  demande: x.calage.demandeHabituelle, libelles: x.calage.libelles, effort: x.effortVise || null, lignes: x.lignes.map((l) => ({ type: l.type, prerempli: l.prerempli, calage: !!l.calage })) });

describe('lot 5 n° 6 — la ✓ de la ligne 1 et « Partir de là » donnent le même plan', () => {
  [[80, 8, null], [80, 8, 'reste_2'], [57.5, 5, 'reste_3_plus'], [80, 0, null]].forEach(([c, r, res]) => {
    test('première série ' + c + ' × ' + r + (res ? ' (' + res + ')' : '') + ' : plan identique', () => {
      const A = valider(S.poserHabituelle(seanceDe(false), 'rowing', c), 0, c, r, res);
      const B = valider(seanceDe(false), 0, c, r, res);
      expect(calageDe(planDe(B))).toEqual(calageDe(planDe(A)));
      // la série écrite : la même, hors identifiant et horodatage
      const nu = (s) => { const q = Object.assign({}, s); delete q.id; delete q.validee_a; return q; };
      expect(nu(B.exercices[0].series[0])).toEqual(nu(A.exercices[0].series[0]));
    });
  });

  test('la phrase du coach est celle de la charge déclarée, jamais « deux séries de chauffe »', () => {
    const x = planDe(valider(seanceDe(false), 0, 80, 8));
    expect(x.calage.mode).toBe('habituelle');
    expect(x.calage.habituelle).toBe(80);
    expect(x.calage.libelles.consigne).toBe('Après chaque série, dis-moi ce qu’il te restait : je te propose la suivante.');
    expect(JSON.stringify(x.calage.libelles)).not.toMatch(/chauffe/);
  });

  test('une charge de 0 ou vide ne vaut pas une charge habituelle', () => {
    const c = M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: false, series: [{ charge: 0, reps: 8, ressenti: null }] });
    expect(c.habituelle).toBeNull();
    expect(c.mode).toBe('approches');
  });

  test('avec des approches (à faire ou faites) : le mode reste « approches », la charge n’est pas devinée', () => {
    const avant = M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: false, prochain: 'chauffe', series: [] });
    expect(avant.mode).toBe('approches');
    expect(M.libellesCalage(avant).consigne).toMatch(/Deux séries de chauffe de 5/);
    const ch = (c) => ({ charge: c, reps: 5, ressenti: null, chauffe: true });
    const fait = M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: false, prochain: 'travail', series: [ch(20), ch(25)] });
    expect(fait.mode).toBe('approches');
    expect(fait.habituelle).toBeNull();
    // les deux approches sont faites : il n'en reste aucune à faire, le coach n'en parle plus
    expect(M.libellesCalage(fait).consigne).not.toMatch(/chauffe/);
  });

  test('un débutant garde son mode : la barre vide, aucune charge habituelle induite', () => {
    const c = M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: true, series: [{ charge: 20, reps: 8, ressenti: null }] });
    expect(c.mode).toBe('debutant');
    expect(c.habituelle).toBeNull();
  });

  test('verifierPlan ne trouve rien sur le plan de la ✓ en ligne 1', () => {
    const B = valider(seanceDe(false), 0, 80, 8);
    const e = entree(B, { habituelles: B.habituelles });
    expect(T.verifierPlan(T.planDeSeance(e), e).erreurs.filter((m) => /^I7[2-5]/.test(m))).toEqual([]);
  });
});

describe('lot 5 n° 6 — où se tape la réponse (écart 3) : la ligne 1 seulement si c’est une série de travail', () => {
  const verif = (se) => { const e = entree(se, { habituelles: se.habituelles }); return T.verifierPlan(T.planDeSeance(e), e).erreurs.filter((m) => /^I7[2-5]/.test(m)); };
  test('ligne 1 = série de travail : la carte demande, la ligne 1 sert de réponse, aucune proposition', () => {
    const se = seanceDe(false);
    const x = planDe(se);
    expect(x.calage.demandeHabituelle).toBe(true);
    expect(x.calage.saisieEnLigne).toBe(true);
    expect(x.lignes.map((l) => !!l.reponseCalage)).toEqual([true, false, false]);
    expect(x.lignes.some((l) => l.calage)).toBe(false);
    expect(x.calage.libelles.question).toBe('Ta charge habituelle ?');
    expect(x.calage.libelles.passer).toBe('Je ne sais pas : on la trouve ensemble');
    expect(verif(se)).toEqual([]);
  });
  test('ligne 1 = chauffe : la carte garde son champ (pas de réponse en ligne), rien n’est marqué', () => {
    const se = seanceDe(true);
    const x = planDe(se);
    expect(x.lignes[0].type).toBe('echauffement');
    expect(x.calage.demandeHabituelle).toBe(true);
    expect(x.calage.saisieEnLigne).toBe(false);
    expect(x.lignes.some((l) => l.reponseCalage)).toBe(false);
    expect(verif(se)).toEqual([]);
  });
  test('la question répondue (Partir de là), passée (Je ne sais pas) ou la 1re série validée : plus de réponse en ligne', () => {
    [S.poserHabituelle(seanceDe(false), 'rowing', 80), S.poserHabituelle(seanceDe(false), 'rowing', 0), valider(seanceDe(false), 0, 80, 8)].forEach((se) => {
      const x = planDe(se);
      expect(x.calage.saisieEnLigne).toBe(false);
      expect(x.lignes.some((l) => l.reponseCalage)).toBe(false);
      expect(verif(se)).toEqual([]);
    });
  });
  test('un plan truqué est refusé : réponse sur une chauffe, ou réponse avec une proposition', () => {
    const se = seanceDe(false), e = entree(se);
    const p = T.planDeSeance(e);
    p.exercices[0].lignes[1].reponseCalage = true;
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /^I74/.test(m)).length).toBeGreaterThan(0);
  });
});
