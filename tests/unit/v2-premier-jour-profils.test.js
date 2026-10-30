/** @jest-environment node */
// 187 — LES 11 PROFILS DE LA PASSE 2 (bêta simulé du 29/10/2026), du questionnaire jusqu'à la première séance.
//
// Pour chacun : les réponses passent par les écrans (`appliquerChoix`, `champsDeLEcran`) comme au téléphone, le profil
// écrit est relu, puis la PREMIÈRE séance sur une barre est calée par le moteur (`calagePremiereFois`). Invariant du
// chantier : la première séance n'a jamais un exercice sans charge ni méthode ; et le récapitulatif dit vrai.
process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/poids.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
const Q = require('../../v2/js/questionnaire.js');
const M = require('../../v2/js/moteur.js');

const MAINTENANT = new Date(2026, 9, 29, 10, 0);

// Joue le questionnaire : `reponses` = [[cle, valeur], …] ; `contexte` = ce que l'app sait (séances en base, routines).
function jouer(reponses, contexte, profilDepart) {
  const ctx = Object.assign({ aDesSeances: false, aDesRoutines: true }, contexte || {});
  let rep = Q.reponsesInitiales(profilDepart || {}, {});
  reponses.forEach(([c, v]) => { rep = /^rec_/.test(c) ? Object.assign({}, rep, { [c]: v }) : Q.appliquerChoix(rep, c, v); });   // une série récente se tape (champ)
  const profil = Object.assign({}, profilDepart || {});
  const ecrans = Q.ecransVisibles(Object.assign({}, ctx, { historique: rep.historique, programme: rep.programme, depuis: rep.depuis }));
  ecrans.forEach((id) => {
    const r = Q.champsDeLEcran(id, rep, profil, { pesees: [], jour: '2026-10-29', maintenant: MAINTENANT });
    Object.assign(profil, r.champs);
  });
  return { rep, profil, ecrans, ctx };
}
const recap = (j) => Q.vueDe('recap', { rep: j.rep, aDesSeances: j.ctx.aDesSeances, faits: null,
  visibles: j.ecrans }).voix;

// La première séance sur une barre, sans charge de départ : ce que le moteur propose.
const calage = (profil, extra) => M.calagePremiereFois(Object.assign({
  equipement: 'barre', reps: 8, debutant: Profil.estDebutant(profil), series: [] }, extra || {}));

const PROFILS = [
  ['P1 débutant, aucune séance', [['depuis', 'commence']], {}, (j, c) => {
    expect(j.profil.anciennete).toBe('moins_1_an');
    expect(c.mode).toBe('debutant');
    expect(c.suivante.charge).toBe(20);
    expect(j.ecrans).not.toContain('recente');
  }],
  ['P2 débutant déclaré avec séances en base', [['depuis', 'commence']], { aDesSeances: true }, (j, c) => {
    expect(j.profil.historique_declare).toBe('debutant');
    expect(j.ecrans).not.toContain('sait');
    expect(c.mode).toBe('debutant');
  }],
  ['P3 moins d’un an, ni noté ni importé', [['depuis', 'moins_1_an'], ['notees', 'non']], {}, (j, c) => {
    expect(j.profil.anciennete).toBe('moins_1_an');
    expect(c.mode).toBe('debutant');
    expect(j.ecrans).not.toContain('recente');
  }],
  ['P4 1 à 3 ans, rien noté : « Une série récente ? » est proposée', [['depuis', '1_a_3_ans'], ['notees', 'non']], {}, (j, c) => {
    expect(j.ecrans).toContain('recente');
    expect(c.mode).toBe('approches');
    expect(c.suivante).toMatchObject({ charge: 20, reps: 5 });
  }],
  ['P5 3 à 5 ans avec une série récente de squat : charge de départ donnée, pas de devinette',
    [['depuis', '3_a_5_ans'], ['notees', 'non'], ['rec_sq_kg', 100], ['rec_sq_reps', 5]], {}, (j) => {
      const s = Q.seriesRecentes(j.rep);
      expect(s).toHaveLength(1);
      expect(s[0].slug).toBe('squat_barre');
      expect(s[0].depart).toBeGreaterThan(0);
      expect(s[0].depart).toBeLessThanOrEqual(100);
      expect(recap(j)).toMatch(/je te propose tes charges|trouve/);
    }],
  ['P6 plus de 5 ans, rien noté, sans série récente : la charge habituelle puis les approches', [['depuis', 'plus_5_ans'], ['notees', 'non']], {}, (j, c) => {
    expect(c.mode).toBe('approches');
    const h = calage(j.profil, { habituelle: 140 });
    expect(h.mode).toBe('habituelle');
    expect(h.suivante.charge).toBe(140);
  }],
  ['P7 plus de 5 ans, séances en base (import) : le coach ordinaire lit l’historique', [['depuis', 'plus_5_ans'], ['notees', 'non']], { aDesSeances: true }, (j) => {
    expect(j.ecrans).toContain('sait');
    expect(j.ecrans).not.toContain('recente');
    expect(recap(j)).toBe('À ta première séance, je te propose tes charges. Tu peux toujours taper autre chose.');
  }],
  ['P8 genou à ménager, débutant : la zone est écrite pour tout le monde', [['depuis', 'commence'], ['zone', 'genou']], {}, (j) => {
    expect(j.profil.zones_a_menager).toEqual(['genou']);
  }],
  ['P9 épaule et dos, 3 à 5 ans', [['depuis', '3_a_5_ans'], ['notees', 'non'], ['zone', 'epaule'], ['zone', 'dos']], {}, (j) => {
    expect(j.profil.zones_a_menager).toEqual(['epaule', 'dos']);
  }],
  ['P10 « Me ménager » : le rythme garde sa valeur de base (prudent)', [['depuis', '1_a_3_ans'], ['notees', 'non'], ['coach', 'prudent']], {}, (j) => {
    expect(j.profil.rythme_progression).toBe('prudent');
    expect(Profil.RYTHMES.filter((r) => r.cle === 'prudent')[0].libelle).toBe('Me ménager');
  }],
  ['P11 « Juste un carnet » : aucun calage ne se pose (le coach se tait)', [['depuis', '1_a_3_ans'], ['notees', 'non'], ['coach', 'carnet']], {}, (j) => {
    expect(j.profil.intention).toBe('entretien');
  }]
];

describe('187 — les 11 profils de la passe 2, du questionnaire à la première séance', () => {
  PROFILS.forEach(([nom, reponses, ctx, verif]) => {
    test(nom, () => {
      const j = jouer(reponses, ctx);
      const c = calage(j.profil);
      verif(j, c);
      // L'invariant du chantier : la première séance a une méthode — une charge au plus petit cran, jamais vide.
      expect(c).not.toBeNull();
      expect(c.suivante === null || c.suivante.charge >= c.plancher).toBe(true);
    });
  });

  test('onze profils, comme la passe 2', () => { expect(PROFILS).toHaveLength(11); });

  test('« tes données » : « Je commence » ne pose jamais la question des séances notées', () => {
    const j = jouer([['depuis', 'commence']]);
    expect(j.rep.notees).toBeNull();
    expect(j.profil.historique_declare).toBe('debutant');
  });

  test('sans série récente ni historique, le récapitulatif dit « on trouve ta charge ensemble »', () => {
    const j = jouer([['depuis', '1_a_3_ans'], ['notees', 'non'], ['coach', 'normal']]);
    expect(recap(j)).toBe('À ta première séance, on trouve ta charge ensemble. Tu peux toujours taper autre chose.');
  });
});
