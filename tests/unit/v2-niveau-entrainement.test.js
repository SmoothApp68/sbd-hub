/** @jest-environment node */
//
// 272 — LE NIVEAU D'ENTRAÎNEMENT MONTE SEUL (« le débutant qui ne vieillit jamais »).
//
//   · `Profil.niveauCalcule` : min(années depuis la 1re séance, séances ÷ 50), la sortie précoce (6 mois, 24 séances, 6 semaines sans
//     record sur les grandes barres faites), le verrou `debutant_fin` ;
//   · `Profil.changementDeNiveau` : jamais vers le bas, le choix de moins de 182 jours prime, rien pendant une décharge, un test ou
//     « J'ai mal » ;
//   · `faits.faitsDuNiveau` : les séances terminées (imports compris) et les records des trois grandes barres, câblés sur la table ;
//   · les phrases des écrans (annonce, « Voir ce qui change », fin d'un import).
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/seance.js');
const Profil = require('../../v2/js/profil.js');
const Faits = require('../../v2/js/faits.js');
require('../../v2/js/generateur.js');

const JOUR = 86400000, AN = 365.25 * JOUR;
const MAINTENANT = new Date('2026-11-08T10:00:00.000Z');
// `n` séances étalées entre `annees` ans avant MAINTENANT et la veille ; la première tombe EXACTEMENT à `annees` ans.
const seances = (n, annees) => Array.from({ length: n }, (_, k) =>
  new Date(MAINTENANT.getTime() - annees * AN + (k * (annees * AN - JOUR)) / Math.max(1, n - 1)).toISOString());
const niveau = (n, annees, extra) => Profil.niveauCalcule(Object.assign({ seances: seances(n, annees), records: [], debutantFin: null, aujourdhui: MAINTENANT }, extra || {}));

describe('272 — niveauCalcule : les années d’entraînement', () => {
  test('40 séances en 3 ans : moins d’un an (le nombre de séances limite)', () => {
    expect(niveau(40, 3).cle).toBe('moins_1_an');
  });
  test('la 50ᵉ séance : 1 à 3 ans, jamais 3 à 5 ans (50 séances = 1 an, même après 3 ans)', () => {
    expect(niveau(50, 3).cle).toBe('1_a_3_ans');
    expect(niveau(149, 3).cle).toBe('1_a_3_ans');
  });
  test('exactement 3,0 ans et 150 séances : 3 à 5 ans ; 5 ans et 250 séances : plus de 5 ans', () => {
    expect(niveau(150, 3).cle).toBe('3_a_5_ans');
    expect(niveau(250, 5).cle).toBe('plus_5_ans');
    expect(niveau(249, 5).cle).toBe('3_a_5_ans');
  });
  test('aucune séance : rien (cle null)', () => {
    expect(Profil.niveauCalcule({ seances: [], records: [], aujourdhui: MAINTENANT }).cle).toBeNull();
    expect(Profil.changementDeNiveau({ anciennete: null }, Profil.niveauCalcule({ seances: [], aujourdhui: MAINTENANT }), MAINTENANT, false)).toBeNull();
  });
  test('un import compte : une séance donnée par son seul instant, ou par { debut }', () => {
    const l = seances(60, 2);
    expect(Profil.niveauCalcule({ seances: l.map((debut) => ({ debut })), aujourdhui: MAINTENANT }).cle).toBe('1_a_3_ans');
  });
  test('le résultat ne porte aucun nombre de séances (jamais l’assiduité)', () => {
    expect(Object.keys(niveau(60, 2)).sort()).toEqual(['barres', 'cle', 'premiere', 'sortiePrecoce']);
  });
  test('les cas réels (pour info) : aurel_br, Léa, Mélody, Alexis, Jordan', () => {
    expect(niveau(630, 3.4).cle).toBe('3_a_5_ans');
    expect(niveau(253, 3.0).cle).toBe('3_a_5_ans');
    expect(niveau(91, 1.8).cle).toBe('1_a_3_ans');
    expect(niveau(180, 1.5).cle).toBe('1_a_3_ans');
    expect(niveau(153, 1.4).cle).toBe('1_a_3_ans');
    // déclaré 3_a_5_ans : aucun changement ; vide : le niveau calculé
    expect(Profil.changementDeNiveau({ anciennete: '3_a_5_ans' }, niveau(630, 3.4), MAINTENANT, false)).toBeNull();
    expect(Profil.changementDeNiveau({ anciennete: null }, niveau(253, 3.0), MAINTENANT, false)).toEqual({ de: null, vers: '3_a_5_ans' });
    expect(Profil.changementDeNiveau({ anciennete: null }, niveau(91, 1.8), MAINTENANT, false)).toEqual({ de: null, vers: '1_a_3_ans' });
  });
});

describe('272 — la sortie précoce du statut débutant', () => {
  // 7 mois, 30 séances : « moins d’un an » par le calcul ; la sortie précoce dépend des records.
  const sept = () => seances(30, 7 / 12);
  const plateau = (extra) => [{ barre: 'squat', fait: true, jourDuRecord: '2026-08-01' }, { barre: 'couche', fait: true, jourDuRecord: null },
    { barre: 'souleve', fait: false, jourDuRecord: null }].map((x, i) => (extra && extra[i]) || x);
  const calc = (o) => Profil.niveauCalcule(Object.assign({ seances: sept(), records: plateau(), debutantFin: null, aujourdhui: MAINTENANT }, o || {}));

  test('6 mois, 24 séances et aucun record depuis 6 semaines : 1 à 3 ans, sortiePrecoce, les barres faites', () => {
    expect(calc()).toMatchObject({ cle: '1_a_3_ans', sortiePrecoce: true, barres: ['squat', 'couche'] });
  });
  test('un record dans les 6 semaines sur une barre faite : reste débutant', () => {
    expect(calc({ records: plateau([{ barre: 'squat', fait: true, jourDuRecord: '2026-10-20' }]) })).toMatchObject({ cle: 'moins_1_an', sortiePrecoce: false });
  });
  test('le record d’une barre NON faite dans les 6 semaines ne compte pas ; aucune barre faite : pas de plateau', () => {
    expect(calc({ records: plateau([null, null, { barre: 'souleve', fait: false, jourDuRecord: '2026-10-30' }]) }).sortiePrecoce).toBe(true);
    expect(calc({ records: [] }).cle).toBe('moins_1_an');
    expect(calc({ records: plateau([{ barre: 'squat', fait: false, jourDuRecord: null }, { barre: 'couche', fait: false, jourDuRecord: null }]) }).cle).toBe('moins_1_an');
  });
  test('moins de 6 mois ou moins de 24 séances : pas de sortie', () => {
    expect(calc({ seances: seances(30, 5 / 12) }).cle).toBe('moins_1_an');
    expect(calc({ seances: seances(23, 7 / 12) }).cle).toBe('moins_1_an');
    expect(calc({ seances: seances(24, 7 / 12) }).sortiePrecoce).toBe(true);
  });
  test('LE VERROU : `debutant_fin` posée, un nouveau record ne ramène jamais en débutant (et ce n’est plus une sortie à constater)', () => {
    const r = calc({ debutantFin: '2026-09-01', records: plateau([{ barre: 'squat', fait: true, jourDuRecord: '2026-11-07' }]) });
    expect(r).toMatchObject({ cle: '1_a_3_ans', sortiePrecoce: false });
    // même avec trop peu de séances ou de mois : le verrou tient
    expect(calc({ debutantFin: '2026-09-01', seances: seances(10, 0.2) }).cle).toBe('1_a_3_ans');
  });
  test('la sortie précoce ne concerne que « moins d’un an » : à 1 an et plus, rien à constater', () => {
    expect(niveau(60, 2, { records: plateau() }).sortiePrecoce).toBe(false);
  });
});

describe('272 — changementDeNiveau : jamais vers le bas, le choix prime, la décharge attend', () => {
  const calc13 = niveau(60, 2);                          // 1_a_3_ans
  test('la déclaration plus haute reste : plus_5_ans + calcul 1 à 3 ans = aucun changement', () => {
    expect(Profil.changementDeNiveau({ anciennete: 'plus_5_ans' }, calc13, MAINTENANT, false)).toBeNull();
    expect(Profil.changementDeNiveau({ anciennete: '1_a_3_ans' }, calc13, MAINTENANT, false)).toBeNull();
  });
  test('débutant déclaré : monte', () => {
    expect(Profil.changementDeNiveau({ anciennete: 'moins_1_an' }, calc13, MAINTENANT, false)).toEqual({ de: 'moins_1_an', vers: '1_a_3_ans' });
  });
  test('null = le rang le plus bas : « moins d’un an » calculé ne remplace pas un profil vide (il ne le fait pas débutant)', () => {
    expect(Profil.changementDeNiveau({ anciennete: null }, niveau(10, 0.2), MAINTENANT, false)).toBeNull();
  });
  const jourAvant = (n) => new Date(MAINTENANT.getTime() - n * JOUR).toISOString().slice(0, 10);
  test('un choix d’il y a 100 jours : aucun changement ; il y a 200 jours : changement ; 181 / 182 jours : la borne', () => {
    expect(Profil.changementDeNiveau({ anciennete: 'moins_1_an', anciennete_choisie_le: jourAvant(100) }, calc13, MAINTENANT, false)).toBeNull();
    expect(Profil.changementDeNiveau({ anciennete: 'moins_1_an', anciennete_choisie_le: jourAvant(200) }, calc13, MAINTENANT, false)).toEqual({ de: 'moins_1_an', vers: '1_a_3_ans' });
    expect(Profil.changementDeNiveau({ anciennete: 'moins_1_an', anciennete_choisie_le: jourAvant(181) }, calc13, MAINTENANT, false)).toBeNull();
    expect(Profil.changementDeNiveau({ anciennete: 'moins_1_an', anciennete_choisie_le: jourAvant(182) }, calc13, MAINTENANT, false)).not.toBeNull();
  });
  test('décharge, semaine de test, « J’ai mal » (bloque) : aucun changement', () => {
    expect(Profil.changementDeNiveau({ anciennete: 'moins_1_an' }, calc13, MAINTENANT, true)).toBeNull();
  });
});

describe('272 — faits.faitsDuNiveau : séances terminées et records des grandes barres', () => {
  const INDEX = {
    squat_barre: { slug: 'squat_barre', nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', mouvement: 'squat' },
    developpe_couche_barre: { slug: 'developpe_couche_barre', nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', mouvement: 'developpe_couche' },
    curl: { slug: 'curl', nom: 'Curl', equipement: 'haltere', mesure: 'charge_reps' }
  };
  const corpusDe = (lignes) => {
    const seancesL = [], series = [];
    lignes.forEach(([jour, slug, charge, statut], i) => {
      const id = 's' + i, debut = jour + 'T09:00:00.000Z';
      seancesL.push({ id, debut, fin: statut === 'en_cours' ? null : jour + 'T10:00:00.000Z', statut: statut || 'terminee' });
      [1, 2, 3].forEach((r) => series.push({ id: id + '-' + r, session_id: id, exercise_slug: slug, type_serie: 'travail', reps: 5, charge_kg: charge, rang: r, validee_a: debut }));
    });
    seancesL.sort((a, b) => (a.debut < b.debut ? 1 : -1));
    return { seances: seancesL, series, exercices: Object.values(INDEX), seriesDe: (id) => series.filter((x) => x.session_id === id), catalogue: () => INDEX, journal: [] };
  };
  const J = '2026-11-08T10:00:00.000Z';
  test('toutes les séances terminées comptent (un import sans fin aussi) ; la séance en cours non', () => {
    const c = corpusDe([['2026-10-01', 'curl', 10], ['2026-10-03', 'curl', 10], ['2026-10-05', 'curl', 10, 'en_cours']]);
    c.seances.find((x) => x.debut.startsWith('2026-10-03')).fin = null;     // un import « sans heure de fin »
    const f = Faits.creer().faitsDuNiveau(c, J);
    expect(f.seances.length).toBe(2);
    expect(Faits.creer().faitsDuNiveau(corpusDe([['2026-10-05', 'curl', 10, 'en_cours']]), J).seances).toEqual([]);
  });
  test('une barre faite dans les 6 semaines : `fait`, et le jour de son dernier record (la table des records)', () => {
    const c = corpusDe([['2026-08-01', 'squat_barre', 100], ['2026-09-01', 'squat_barre', 100], ['2026-10-20', 'squat_barre', 105], ['2026-10-25', 'developpe_couche_barre', 80]]);
    const r = Faits.creer().faitsDuNiveau(c, J).records;
    expect(r.find((x) => x.barre === 'squat')).toEqual({ barre: 'squat', fait: true, jourDuRecord: '2026-10-20' });
    expect(r.find((x) => x.barre === 'couche').fait).toBe(true);
    expect(r.find((x) => x.barre === 'souleve')).toEqual({ barre: 'souleve', fait: false, jourDuRecord: null });
  });
  test('une barre pas faite depuis plus de 6 semaines n’est pas « faite » ; un accessoire n’est jamais une grande barre', () => {
    const c = corpusDe([['2026-08-01', 'squat_barre', 100], ['2026-10-25', 'curl', 15]]);
    const r = Faits.creer().faitsDuNiveau(c, J).records;
    expect(r.every((x) => x.fait === false)).toBe(true);
  });
});

describe('272 — les phrases des écrans', () => {
  test('l’annonce : titre, fait, ligne grise, liens (débutant → 1 à 3 ans)', () => {
    const a = Profil.annonceDeNiveau({ de: 'moins_1_an', vers: '1_a_3_ans', premiere: '2025-11-12T09:00:00.000Z', precoce: false, barres: [] });
    expect(a.surtitre).toBe('Nouveau niveau');
    expect(a.titre).toBe('1 à 3 ans d’entraînement, depuis aujourd’hui.');
    expect(a.fait).toBe('Ta première séance notée date du 12 nov. 2025.');
    expect(a.gris).toBe('Le coach monte maintenant selon ta zone et ta réserve.');
    expect(a.voir).toBe(true);
    expect(a.annule).toBe('Entraînement : Moins d’un an, gardé.');
  });
  test('sortie précoce : les barres faites seulement, accordées', () => {
    const f = (barres) => Profil.annonceDeNiveau({ de: 'moins_1_an', vers: '1_a_3_ans', precoce: true, barres }).fait;
    expect(f(['squat', 'couche', 'souleve'])).toBe('Ton squat, ton couché et ton soulevé n’ont pas monté depuis 6 semaines.');
    expect(f(['squat', 'souleve'])).toBe('Ton squat et ton soulevé n’ont pas monté depuis 6 semaines.');
    expect(f(['couche'])).toBe('Ton couché n’a pas monté depuis 6 semaines.');
  });
  test('1 à 3 → 3 à 5 : la ligne des objectifs ; 3 à 5 → plus de 5 : aucune ligne, pas de lien', () => {
    const b = Profil.annonceDeNiveau({ de: '1_a_3_ans', vers: '3_a_5_ans', premiere: '2023-03-03T09:00:00.000Z' });
    expect(b.titre).toBe('3 à 5 ans d’entraînement, depuis aujourd’hui.');
    expect(b.gris).toBe('Tes objectifs visent maintenant 15 % par an au lieu de 20 %.');
    expect(b.voir).toBe(true);
    const c = Profil.annonceDeNiveau({ de: '3_a_5_ans', vers: 'plus_5_ans', premiere: '2020-03-03T09:00:00.000Z' });
    expect(c.titre).toBe('Plus de 5 ans d’entraînement, depuis aujourd’hui.');
    expect(c.gris).toBeNull();
    expect(c.voir).toBe(false);
  });
  test('« Voir ce qui change » : le tableau du débutant (5 lignes) et la ligne des objectifs', () => {
    expect(Profil.lignesDeCeQuiChange('moins_1_an', '1_a_3_ans').map((l) => l.quoi)).toEqual(['Montée', 'Série ratée', 'Programme', 'Dégressive', 'Tes records']);
    expect(Profil.lignesDeCeQuiChange('1_a_3_ans', '3_a_5_ans')).toEqual([{ quoi: 'Objectifs', avant: '20 % par an', apres: '15 % par an' }]);
    expect(Profil.lignesDeCeQuiChange('3_a_5_ans', 'plus_5_ans')).toEqual([]);
  });
  test('fin d’un import : la carte « Ton niveau » seulement au-dessus de la déclaration ; les choix sont au-dessus du calculé', () => {
    const c = niveau(200, 3.4);
    const carte = Profil.carteDeNiveauImport({ anciennete: '1_a_3_ans' }, c);
    expect(carte.titre).toBe('3 à 5 ans d’entraînement, d’après ton historique.');
    expect(carte.fait).toMatch(/^Ta première séance importée date du \d+ \S+ \d{4}\.$/);
    expect(carte.au_dessus.map((n) => n.cle)).toEqual(['plus_5_ans']);
    expect(Profil.carteDeNiveauImport({ anciennete: '3_a_5_ans' }, c)).toBeNull();
    expect(Profil.carteDeNiveauImport({ anciennete: 'plus_5_ans' }, c)).toBeNull();
  });
  test('les deux colonnes sont lues et écrites', () => {
    expect(Profil.champsEcrits({ debutant_fin: '2026-11-08', anciennete_choisie_le: '2026-11-08' })).toEqual({ debutant_fin: '2026-11-08', anciennete_choisie_le: '2026-11-08' });
  });
});
