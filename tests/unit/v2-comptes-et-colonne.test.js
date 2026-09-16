//
// Chantier 39 — la colonne « précédent », et ce qu'on appelle une série.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater), et il en faut DEUX :
//
//   · colonne — une séance précédente AVEC des chauffes et une actuelle qui en
//     a MOINS. Même piège qu'au chantier 38 : à nombre égal, aligner par indice
//     et aligner par type donnent la même valeur.
//   · comptes — une séance AVEC des chauffes. Sans elles, « compter les séries
//     de travail » et « compter toutes les lignes » rendent le même nombre, et
//     les cinq écrans se ressemblent.
//
// ⚠️ ET DES CHARGES DISTINCTES. Au chantier 38, `120 · 120 · 120` rendait le
// rang non mesurable. Même piège ici.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node.

const Seance = require('../../v2/js/seance.js');
const Semaine = require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

const p = (charge, reps, type) => ({
  charge_kg: charge, reps: reps, duree_s: null, distance_m: null,
  type_serie: type || 'travail'
});
const prec = (series) => ({ seance: { id: 'p1' }, series: series });

// `40(W) · 70(W) · 120 · 125 · 130` — chauffes des deux côtés, charges distinctes.
const AVANT = () => prec([
  p(40, 10, 'echauffement'), p(70, 5, 'echauffement'),
  p(120, 5), p(125, 5), p(130, 4)
]);

const seanceDe = (types) => {
  let s = Seance.creer({ id: 's1', userId: 'u1', idSerie: uuid });
  s = Seance.ajouterExercice(s, 'squat-barre', uuid);
  for (let k = 1; k < types.length; k++) s = Seance.ajouterSerie(s, 0, uuid);
  types.forEach((t, i) => { s = Seance.changerType(s, 0, i, t); });
  return s;
};

// Ce que la COLONNE affiche : `rendu.js` appelle `correspondant` avec la liste
// des séries de l'exercice. On mesure la même chose, au même endroit.
const colonne = (s, pr) => s.exercices[0].series
  .map((_, i) => {
    const l = Seance.correspondant(s.exercices[0].series, i, pr);
    return l ? l.charge_kg : null;
  });
const fantomes = (s, pr) => s.exercices[0].series
  .map((_, i) => Seance.fantome(s, 0, i, pr).charge_kg);

// ── §1 — LA COLONNE « PRÉCÉDENT » ─────────────────────────────────────────
describe('la colonne « précédent »', () => {
  test('⚠️ sur une ligne de TRAVAIL, elle montre une série de travail', () => {
    const s = seanceDe(['travail', 'travail', 'travail']);
    expect(colonne(s, AVANT())).toEqual([120, 125, 130]);
  });

  test('sur une CHAUFFE, elle montre une chauffe', () => {
    const s = seanceDe(['echauffement', 'travail', 'travail']);
    expect(colonne(s, AVANT())).toEqual([40, 120, 125]);
  });

  // ⚠️ LE DÉFAUT TEL QU'IL SE VOYAIT SUR DEVICE : les deux se contredisaient
  // sur la MÊME ligne. C'est l'assertion qui compte le plus de ce chantier.
  test('⚠️ elle ne contredit plus le fantôme, ligne par ligne', () => {
    const s = seanceDe(['travail', 'travail', 'travail']);
    expect(colonne(s, AVANT())).toEqual(fantomes(s, AVANT()));
  });

  test('pas de correspondant du même type → rien, aucune valeur inventée', () => {
    const s = seanceDe(['travail', 'travail', 'travail', 'travail']);
    expect(colonne(s, AVANT())).toEqual([120, 125, 130, null]);
    const queDesChauffes = prec([p(40, 10, 'echauffement')]);
    expect(colonne(seanceDe(['travail']), queDesChauffes)).toEqual([null]);
    expect(colonne(seanceDe(['travail']), null)).toEqual([null]);
  });

  test('les quatre types, chacun chez soi', () => {
    const QUATRE = prec([p(40, 10, 'echauffement'), p(120, 5, 'travail'),
                         p(90, 8, 'degressive'), p(115, 2, 'echec')]);
    const s = seanceDe(['echec', 'degressive', 'travail', 'echauffement']);
    expect(colonne(s, QUATRE)).toEqual([115, 90, 120, 40]);
  });

  // ⚠️ CE QUI DISTINGUE LA COLONNE DU FANTÔME, ET QUI DOIT LE RESTER.
  test('elle ne lit JAMAIS la saisie en cours — le fantôme, si', () => {
    let s = seanceDe(['travail', 'travail', 'travail']);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 200 });
    expect(colonne(s, AVANT())).toEqual([120, 125, 130]);      // la séance passée
    expect(fantomes(s, AVANT())).toEqual([120, 200, 200]);     // + ce qu'on tape
  });

  test('le témoin : à nombre de chauffes ÉGAL, les deux alignements coïncident', () => {
    const s = seanceDe(['echauffement', 'echauffement', 'travail', 'travail', 'travail']);
    expect(colonne(s, AVANT())).toEqual([40, 70, 120, 125, 130]);
  });
});

// ── §2 — C1 : UN SEUL COMPTE DE SÉRIES DE TRAVAIL ─────────────────────────
describe('C1 — ce qu’on appelle une série', () => {
  // 4 chauffes + 2 séries de travail, tout validé. Le cas de l'audit.
  const quatreEtDeux = () => {
    let s = seanceDe(['echauffement', 'echauffement', 'echauffement',
                      'echauffement', 'travail', 'travail']);
    for (let i = 0; i < 6; i++) s = Seance.valider(s, 0, i, new Date('2026-09-15T10:00:00Z'));
    return s;
  };

  test('⚠️ `compter` sépare les trois nombres — et `travail` est le bon', () => {
    expect(Seance.compter(quatreEtDeux())).toEqual({ series: 6, validees: 6, travail: 2 });
  });

  test('sans chauffe, les trois coïncident — d’où le piège', () => {
    let s = seanceDe(['travail', 'travail']);
    for (let i = 0; i < 2; i++) s = Seance.valider(s, 0, i, new Date('2026-09-15T10:00:00Z'));
    const c = Seance.compter(s);
    expect(c.validees).toBe(c.travail);
  });

  test('une chauffe validée ne devient jamais une série de travail', () => {
    let s = seanceDe(['echauffement']);
    s = Seance.valider(s, 0, 0, new Date('2026-09-15T10:00:00Z'));
    expect(Seance.compter(s).travail).toBe(0);
    expect(Seance.compter(s).validees).toBe(1);
  });
});

// ── §2 — L'AVERTISSEMENT DE SUPPRESSION PARLE DE LIGNES ───────────────────
//
// La règle n'est pas « tout uniformiser » : un écran qui annonce une suppression
// dit ce qu'il va VRAIMENT effacer. Six lignes partent, il annonce six lignes —
// et il dit pourquoi le nombre ne suit pas la même règle que les autres.
describe('C1 — l’avertissement de suppression', () => {
  const s = () => {
    let x = seanceDe(['echauffement', 'echauffement', 'echauffement',
                      'echauffement', 'travail', 'travail']);
    for (let i = 0; i < 6; i++) x = Seance.valider(x, 0, i, new Date('2026-09-15T10:00:00Z'));
    return x;
  };

  test('⚠️ il compte des LIGNES, chauffes comprises', () => {
    expect(Seance.compterAEffacer(s(), [0])).toEqual({ lignes: 6, chauffes: 4 });
  });

  test('et la phrase le DIT, au lieu d’un nombre nu', () => {
    expect(Rendu().phraseEffacement(6, 4))
      .toBe('6 séries, dont 4 d’échauffement seront effacées');
  });

  test('sans chauffe, aucun détail superflu', () => {
    expect(Rendu().phraseEffacement(2, 0)).toBe('2 séries seront effacées');
    expect(Rendu().phraseEffacement(1, 0)).toBe('1 série sera effacée');
  });

  test('une ligne jamais montée n’est pas annoncée : elle n’a rien à effacer', () => {
    const vierge = seanceDe(['echauffement', 'travail']);
    expect(Seance.compterAEffacer(vierge, [0])).toEqual({ lignes: 0, chauffes: 0 });
  });

  test('sur une tranche vide, ou sans séance, il ne lève pas', () => {
    expect(Seance.compterAEffacer(s(), [])).toEqual({ lignes: 0, chauffes: 0 });
    expect(Seance.compterAEffacer(null, [0])).toEqual({ lignes: 0, chauffes: 0 });
  });
});

// ── §3 — C2 : UNE SORTIE N'A PAS DE SÉRIES DE TRAVAIL ─────────────────────
describe('C2 — les sorties', () => {
  // ⚠️ LE CATALOGUE DISCRIMINANT. Mesuré sur la base : `estExerciceSortie`
  // couvre 19 exercices, dont SIX portent un muscle primaire — poirier, gainage,
  // l-sit et les trois planches. Le critère juste est « porte du volume ».
  const EXOS = [
    { slug: 'dc-barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
    { slug: 'tapis_roulant', charge: 'aucune', mesure: 'distance_temps',
      muscles_primaires: [], muscles_secondaires: [] },
    { slug: 'planche', charge: 'aucune', mesure: 'temps',
      muscles_primaires: ['abdominaux'], muscles_secondaires: [] }
  ];
  const t = (slug) => ({ session_id: 'x', exercise_slug: slug, type_serie: 'travail' });
  const bilan = (series) => Semaine.bilanSemaine([{ id: 'x' }], series, EXOS).nbSeriesTravail;

  test('⚠️ une sortie ne compte aucune série de travail', () => {
    expect(bilan([t('tapis_roulant'), t('tapis_roulant')])).toBe(0);
  });

  test('une séance mixte ne compte que la musculation', () => {
    expect(bilan([t('dc-barre'), t('dc-barre'), t('tapis_roulant')])).toBe(2);
  });

  // ⚠️ ET LA PLANCHE RESTE. Elle est « sortie » au sens de `estExerciceSortie`
  // (charge `aucune`, mesure `temps`) mais elle travaille un muscle : l'exclure
  // afficherait « 0 série de travail » sur une séance de gainage.
  test('⚠️ un gainage COMPTE — il porte du volume, contrairement au tapis', () => {
    expect(bilan([t('planche'), t('planche'), t('tapis_roulant')])).toBe(2);
    expect(Semaine.porteDuVolume(EXOS[2])).toBe(true);
    expect(Semaine.porteDuVolume(EXOS[1])).toBe(false);
  });

  test('les chauffes ne comptent pas non plus, sortie ou pas', () => {
    expect(bilan([Object.assign(t('dc-barre'), { type_serie: 'echauffement' })])).toBe(0);
  });

  // Absence de catalogue n'est pas absence de muscle.
  test('un exercice INCONNU compte encore — on ne retranche que ce qu’on sait', () => {
    expect(bilan([t('exercice-jamais-vu')])).toBe(1);
    expect(Semaine.bilanSemaine([{ id: 'x' }], [t('dc-barre')], []).nbSeriesTravail).toBe(1);
    expect(Semaine.bilanSemaine([{ id: 'x' }], [t('dc-barre')]).nbSeriesTravail).toBe(1);
  });

  test('une série d’une autre semaine n’entre pas dans le bilan', () => {
    const ailleurs = { session_id: 'z', exercise_slug: 'dc-barre', type_serie: 'travail' };
    expect(bilan([t('dc-barre'), ailleurs])).toBe(1);
  });

  test('`porteDuVolume` ne lève pas sur l’absence', () => {
    expect(Semaine.porteDuVolume(null)).toBe(false);
    expect(Semaine.porteDuVolume({})).toBe(false);
  });
});

// ── LE MÊME COMPTE POUR TOUS LES LECTEURS (chantier 40, §1) ───────────────
//
// CONFIGURATION DISCRIMINANTE : une séance MIXTE — musculation ET tapis. Sans
// sortie dedans, « filtre appliqué » et « filtre absent » donnent le même
// nombre, et c'est ce qui a laissé la carte diverger de la barre après le
// chantier 39.
describe('⚠️ la carte et la barre ne peuvent plus diverger', () => {
  const EXOS = [
    { slug: 'dc-barre', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
    { slug: 'tapis_roulant', charge: 'aucune', mesure: 'distance_temps',
      muscles_primaires: [], muscles_secondaires: [] },
    { slug: 'planche', charge: 'aucune', mesure: 'temps',
      muscles_primaires: ['abdominaux'], muscles_secondaires: [] }
  ];
  const t = (slug, rang) => ({
    id: 's' + rang, session_id: 'x', exercise_slug: slug, type_serie: 'travail',
    rang: rang, charge_kg: 60, reps: 8, duree_s: null, distance_m: null
  });
  const MIXTE = [t('dc-barre', 1), t('dc-barre', 2), t('dc-barre', 3),
                 t('tapis_roulant', 4), t('tapis_roulant', 5)];

  const carte = (series) =>
    Modele.resumerSeance({ id: 'x', titre: 'Quads tous terrains' }, series, EXOS).nbSeriesTravail;
  const barre = (series) =>
    Semaine.bilanSemaine([{ id: 'x' }], series, EXOS).nbSeriesTravail;

  test('sur une séance MIXTE, les deux disent le même nombre', () => {
    expect(carte(MIXTE)).toBe(3);
    expect(barre(MIXTE)).toBe(3);
    expect(carte(MIXTE)).toBe(barre(MIXTE));
  });

  test('le tapis est exclu des DEUX, pas d’un seul', () => {
    const sansTapis = MIXTE.filter((s) => s.exercise_slug !== 'tapis_roulant');
    expect(carte(MIXTE)).toBe(carte(sansTapis));
    expect(barre(MIXTE)).toBe(barre(sansTapis));
  });

  test('une planche COMPTE dans les deux — elle porte un muscle', () => {
    const avecPlanche = MIXTE.concat([t('planche', 6), t('planche', 7)]);
    expect(carte(avecPlanche)).toBe(5);
    expect(barre(avecPlanche)).toBe(5);
  });

  test('les chauffes sortent des deux', () => {
    const avecChauffe = MIXTE.concat([
      Object.assign(t('dc-barre', 8), { type_serie: 'echauffement' })]);
    expect(carte(avecChauffe)).toBe(3);
    expect(barre(avecChauffe)).toBe(3);
  });

  // Le témoin : sans sortie, les deux implémentations coïncident — d'où le piège.
  test('sans sortie dedans, filtrer ou non donne le même nombre', () => {
    const pure = [t('dc-barre', 1), t('dc-barre', 2)];
    expect(carte(pure)).toBe(2);
    expect(barre(pure)).toBe(2);
  });
});
