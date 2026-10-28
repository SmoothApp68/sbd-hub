/** @jest-environment node */
//
// 109 — L'OBJECTIF, À L'ESSAI (MOTEUR §9.25, décidé le 16/10/2026). Un squat à la barre, des séances datées, une
// horloge passée en argument (le 16 octobre 2026 à midi). Chaque fixture déclenche le chemin qu'elle nomme : le
// rythme sur un an, le plafond « hors littérature » selon l'ancienneté, moins de 3 records, moins de 8 semaines, un
// rythme nul, plus d'un an, déjà fait, la date figée, l'objectif changé qui garde l'ancien pari, l'observation tenue
// et non tenue, l'exclusion du total des paris, la migration absente.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
require('../../v2/js/bilan.js');
const O = require('../../v2/js/objectif.js');
const M = global.THModele, Mo = global.THMoteur;

const MAINTENANT = new Date(2026, 9, 16, 12, 0, 0);
const BARRE = M.optionsDeRecord({ mesure: 'charge_reps', charge: 'externe', equipement: 'barre' });
let n = 0;
// Une séance du squat : `[charge, reps, type?]` par série, à 18 h le jour dit.
const seance = (jour, series) => {
  const id = 's' + (++n);
  const [a, m, j] = jour.split('-').map(Number);
  return { id, debut: new Date(a, m - 1, j, 18, 0, 0).toISOString(),
    series: series.map(([c, r, t], i) => ({ id: id + '-' + (i + 1), session_id: id, exercise_slug: 'squat', charge_kg: c, reps: r,
      type_serie: t || 'travail', rang: i + 1, validee_a: null })) };
};
// Un an de squat : 130 (sept. 2025) → 132,5 (oct. 2025, le record d'il y a un an) → 137,5 → 140 × 3 → 144 (sept. 2026).
const HISTOIRE = () => [
  seance('2025-09-01', [[100, 5, 'echauffement'], [130, 1]]),
  seance('2025-10-01', [[132.5, 1]]),
  seance('2026-02-01', [[137.5, 1], [120, 5]]),
  seance('2026-06-01', [[140, 3]]),
  seance('2026-09-20', [[144, 1]])
];
const projeter = (o) => O.projection(Object.assign({ seances: HISTOIRE(), charge: 150, reps: 1, maintenant: MAINTENANT,
  anciennete: null, options: BARRE }, o));

describe('la date, à la pose', () => {
  test('le rythme : le record « au moins 1 rep » d\u2019aujourd\u2019hui (144) contre celui d\u2019il y a un an (132,5), en kg par mois → fin avril', () => {
    const p = projeter({});
    expect(p.etat).toBe('date');
    expect(p.record.charge).toBe(144);
    expect(p.reference).toEqual({ charge: 132.5, le: '2025-10-16' });
    expect(p.rythme_brut).toBeCloseTo(11.5 / (365 / O.JOURS_PAR_MOIS), 3);
    expect(p.rythme).toBe(p.rythme_brut);                       // sous le plafond : la fourchette personnelle décide
    expect(p.echeance).toBe('2027-04-30');
    expect(p.jours).toBe(196);                                  // du 16 octobre 2026 au 30 avril 2027
    expect(p.hausses).toBe(5);
    expect(p.depart).toBe(144);
  });

  test('un maximum estimé ne sert jamais de record : 140 × 3 ne vaut que 140 « pour au moins 1 rep » (pas ≈ 154)', () => {
    const p = projeter({ charge: 145, seances: [seance('2025-09-01', [[130, 1]]), seance('2025-10-01', [[132.5, 1]]),
      seance('2026-02-01', [[137.5, 1]]), seance('2026-06-01', [[140, 3]])] });
    expect(p.record.charge).toBe(140);
    expect(p.etat).toBe('date');
    expect(p.echeance).toBe('2027-06-30');                      // 5 kg à 7,5 kg par an — pas « déjà fait »
  });

  test('le plafond « hors littérature » coupe l\u2019impossible : 3-5 ans, 15 % par an du record d\u2019il y a un an', () => {
    const vite = [seance('2025-09-01', [[100, 1]]), seance('2025-10-01', [[100, 1]]), seance('2026-03-01', [[120, 1]]),
      seance('2026-09-01', [[140, 1]])];
    const p = projeter({ seances: vite, anciennete: '3_a_5_ans' });
    expect(p.rythme_brut).toBeGreaterThan(3);                   // 40 kg en un an
    expect(p.plafond).toBeCloseTo(100 * 0.15 / (365 / O.JOURS_PAR_MOIS), 3);
    expect(p.rythme).toBe(p.plafond);
    expect(p.echeance).toBe('2027-06-30');                      // 10 kg à 1,25 kg par mois
    // Moins d'un an de pratique : 40 % sur 12 semaines — le plafond ne coupe plus, le rythme personnel décide.
    const d = projeter({ seances: vite, anciennete: 'moins_1_an' });
    expect(d.plafond).toBeGreaterThan(d.rythme_brut);
    expect(d.echeance).toBe('2027-01-31');
    // Non renseignée : 15 % par an, comme au-delà de 3 ans ; 1 à 3 ans : 20 %.
    expect(projeter({ seances: vite, anciennete: null }).plafond).toBe(p.plafond);
    expect(O.plafondDe('1_a_3_ans')).toEqual({ part: 0.20, jours: 365 });
    expect(O.plafondDe('plus_5_ans')).toEqual({ part: 0.15, jours: 365 });
  });

  // 120 (D12, décision d'Aurélien du 16/10/2026, audit 01 #12) — « moins d'un an » = « +40 % sur les 12 premières
  // semaines, puis +20 %/an » (au lieu de 40 % / 12 semaines extrapolé à l'année : ≈ 14,5 % par mois, +174 % par an).
  test('⚠️ DISCRIMINANT — moins d’un an : 40 % sur les 12 semaines qui suivent la pose, puis 20 % par an', () => {
    const vite = [seance('2025-09-01', [[100, 1]]), seance('2025-10-01', [[100, 1]]), seance('2026-03-01', [[120, 1]]),
      seance('2026-09-01', [[140, 1]])];
    expect(O.plafondDe('moins_1_an')).toEqual({ part: 0.40, jours: 84, puis: { part: 0.20, jours: 365 } });
    // 140 → 170 (30 kg) au rythme personnel (≈ 3,3 kg par mois) : avant D12, ≈ 9 mois (une date en juillet 2027).
    // Avec D12 : ≈ 9,2 kg pendant les 12 semaines, puis 20 % par an de 100 kg (≈ 1,67 kg par mois) : plus d'un an.
    const d = projeter({ seances: vite, anciennete: 'moins_1_an', charge: 170 });
    expect(d.plafond).toBeCloseTo(100 * 0.40 / (84 / O.JOURS_PAR_MOIS), 3);
    expect(d.plafond_apres).toBeCloseTo(100 * 0.20 / (365 / O.JOURS_PAR_MOIS), 3);
    expect(d.rythme).toBe(d.rythme_brut);                      // les 12 semaines : le rythme personnel, sous 40 %
    expect(d.rythme_apres).toBe(d.plafond_apres);              // ensuite : 20 % par an coupe
    expect(d.etat).toBe('plus_d_un_an');
    // Un objectif atteint dans les 12 semaines ne voit que le premier temps (150 : fin janvier, comme avant D12).
    const court = projeter({ seances: vite, anciennete: 'moins_1_an', charge: 149 });
    expect(court.echeance).toBe('2027-01-31');
    // Au-delà des 12 semaines : le second temps ralentit (155 → fin avril ; avant D12, fin mars).
    const juste = projeter({ seances: vite, anciennete: 'moins_1_an', charge: 155 });
    expect(juste.echeance).toBe('2027-04-30');
    // Le pari porte les deux temps ; les autres tranches gardent leur fondement d'avant.
    const pari = O.pariDe({ exercise_slug: 'squat', charge_kg: 155, reps: 1, pose_le: MAINTENANT.toISOString() }, juste, 'u', 'p1');
    expect([pari.fondement.plafond_apres, pari.fondement.rythme_apres, pari.module_version])
      .toEqual([juste.plafond_apres, juste.rythme_apres, '2']);
    const autre = O.pariDe({ exercise_slug: 'squat', charge_kg: 150, reps: 1, pose_le: MAINTENANT.toISOString() },
      projeter({ seances: vite, anciennete: '1_a_3_ans' }), 'u', 'p2');
    expect(Object.prototype.hasOwnProperty.call(autre.fondement, 'plafond_apres')).toBe(false);
  });

  test('moins de 3 records à au moins N reps : « Pas encore de date. », et aucun pari', () => {
    const p = projeter({ reps: 3 });                            // à 3 reps ou plus : 120 × 5 puis 140 × 3 — deux hausses
    expect(p.hausses).toBe(2);
    expect(p.etat).toBe('pas_encore');
    expect(O.pariDe(O.ligneDe('squat', 150, 3, MAINTENANT.toISOString(), p, 'u'), p, 'u', 'id')).toBeNull();
  });

  test('moins de 8 semaines d\u2019historique sur l\u2019exercice : « Pas encore de date. »', () => {
    const p = projeter({ seances: [seance('2026-09-01', [[130, 1]]), seance('2026-09-15', [[135, 1]]),
      seance('2026-10-01', [[140, 1]])] });
    expect(p.hausses).toBe(3);
    expect(p.etat).toBe('pas_encore');
  });

  test('un rythme nul : « Pas encore de date. »', () => {
    const p = projeter({ seances: [seance('2025-01-01', [[140, 1]]), seance('2025-06-01', [[142, 1]]),
      seance('2025-09-01', [[144, 1]]), seance('2026-09-01', [[140, 1]])] });
    expect(p.etat).toBe('pas_encore');
    expect(p.raison).toBe('rythme_nul');
  });

  test('au-delà de 12 mois : « Au rythme actuel : plus d\u2019un an. », et aucun pari', () => {
    const lent = [seance('2025-01-01', [[138, 1]]), seance('2025-06-01', [[140, 1]]), seance('2026-09-01', [[141, 1]])];
    const p = projeter({ seances: lent });
    expect(p.etat).toBe('plus_d_un_an');
    const ligne = O.ligneDe('squat', 150, 1, MAINTENANT.toISOString(), p, 'u');
    expect(ligne).toMatchObject({ projection: 'plus_d_un_an', echeance: null, pari_id: null });
    expect(O.pariDe(ligne, p, 'u', 'id')).toBeNull();
    expect(O.vue({ objectif: ligne, seances: lent, options: BARRE, maintenant: MAINTENANT }).ligne)
      .toBe('Au rythme actuel\u00a0: plus d\u2019un an.');
  });

  test('un objectif déjà fait est refusé, avec le fait (la série, ses vraies reps)', () => {
    const p = projeter({ charge: 140, reps: 1 });
    expect(p.etat).toBe('deja');
    expect(O.phraseDejaFait(p, MAINTENANT)).toBe('Déjà fait\u00a0: 144\u00a0kg\u00a0×\u00a01, le 20 sept.');
  });

  test('« Juste un carnet » : ni date ni pari', () => {
    const p = projeter({ carnet: true });
    expect(p.etat).toBe('carnet');
    const ligne = O.ligneDe('squat', 150, 1, MAINTENANT.toISOString(), p, 'u');
    expect(O.pariDe(ligne, p, 'u', 'id')).toBeNull();
    const v = O.vue({ objectif: ligne, seances: HISTOIRE(), options: BARRE, maintenant: MAINTENANT, carnet: true });
    expect(v.ligne).toBeNull();
    expect(v.pari).toBeNull();
    expect(v.titre).toBe('150\u00a0kg\u00a0×\u00a01');
  });
});

describe('le pari', () => {
  test('module « objectif », grandeur « jours », valeur prédite = les jours jusqu\u2019à la fin du mois ; sans séance ni exercice en colonne', () => {
    const p = projeter({});
    const pose = MAINTENANT.toISOString();
    const ligne = O.ligneDe('squat', 150, 1, pose, p, 'u', 'pari-1');
    const pari = O.pariDe(ligne, p, 'u', 'pari-1');
    expect(pari).toMatchObject({ id: 'pari-1', module: 'objectif', grandeur: 'jours', valeur_predite: 196, horizon_jours: 196,
      exercise_slug: null, emise_a: pose, valeur_observee: null, set_observe: null });
    expect(pari.module).toBe(Mo.MODULE_OBJECTIF);
    expect(pari.module).not.toBe(Mo.MODULE_CONSIGNE);
    expect(pari.fondement).toMatchObject({ exercice: 'squat', charge: 150, reps: 1, pose_le: pose, echeance: '2027-04-30' });
    expect('seance' in pari.fondement).toBe(false);             // ne dépend d'aucune séance (la cascade ne l'emporte pas)
    expect(ligne).toMatchObject({ projection: 'date', echeance: '2027-04-30', pari_id: 'pari-1', depart_kg: 144 });
  });

  test('l\u2019identifiant : UUID v5 sur objectif|exercice|instant de la pose — deux poses, deux paris ; la même, le même', async () => {
    const a = await Mo.idDObjectif('squat', '2026-10-16T10:00:00.000Z');
    const b = await Mo.idDObjectif('squat', '2026-10-16T10:05:00.000Z');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
    expect(await Mo.idDObjectif('squat', '2026-10-16T10:00:00.000Z')).toBe(a);
    expect(a).not.toBe(await Mo.idDEscalier('squat', null, '2026-10-16T10:00:00.000Z'));
  });
});

describe('la date figée, et ce que la page montre', () => {
  test('la date affichée est celle de la pose : de nouvelles séances ne la bougent pas', () => {
    const p = projeter({});
    const ligne = O.ligneDe('squat', 150, 1, MAINTENANT.toISOString(), p, 'u', 'pari-1');
    const v1 = O.vue({ objectif: ligne, seances: HISTOIRE(), options: BARRE, maintenant: MAINTENANT });
    expect(v1.ligne).toBe('Le pari du coach\u00a0: fin avril.');
    expect(v1.pari).toBe('Pos\u00e9 le 16 oct. On verra s\u2019il tombe juste.');
    const plusTard = new Date(2026, 10, 20, 12);
    const avance = HISTOIRE().concat([seance('2026-11-10', [[147.5, 1]])]);
    expect(projeter({ seances: avance, maintenant: plusTard }).echeance).not.toBe('2027-04-30');   // recalculée, elle bougerait
    const v2 = O.vue({ objectif: ligne, seances: avance, options: BARRE, maintenant: plusTard });
    expect(v2.ligne).toBe(v1.ligne);                            // elle ne bouge pas
    expect(v2.aujourdhui).toBe('Aujourd\u2019hui\u00a0: 147,5\u00a0kg\u00a0×\u00a01');
    expect(v2.jauge).toBeCloseTo(3.5 / 6, 5);                  // depuis le record de la pose (144)
  });

  test('jamais « impossible », jamais une couleur dans la ligne ; « Pas encore de date. » sans projection', () => {
    const p = projeter({ reps: 3 });
    const ligne = O.ligneDe('squat', 150, 3, MAINTENANT.toISOString(), p, 'u');
    const v = O.vue({ objectif: ligne, seances: HISTOIRE(), options: BARRE, maintenant: MAINTENANT });
    expect(v.ligne).toBe('Pas encore de date.');
    [v.ligne, O.PLUS_D_UN_AN, O.PARI].forEach((t) => expect(t).not.toMatch(/impossible/i));
  });

  test('atteint : « Atteint le 12 février. », jauge pleine — même en « Juste un carnet » (un fait)', () => {
    const p = projeter({});
    const ligne = O.ligneDe('squat', 150, 1, MAINTENANT.toISOString(), p, 'u', 'pari-1');
    const s = HISTOIRE().concat([seance('2027-02-12', [[150, 1]])]);
    const v = O.vue({ objectif: ligne, seances: s, options: BARRE, maintenant: new Date(2027, 1, 20), carnet: true });
    expect(v.ligne).toBe('Atteint le 12 février.');
    expect(v.jauge).toBe(1);
    expect(v.atteint).toBe(true);
  });

  test('la feuille : la phrase du record pour les reps tapées, et la saisie bornée', () => {
    expect(O.phraseDeSaisie(HISTOIRE(), '1', MAINTENANT, BARRE, false))
      .toBe('Ton record\u00a0: 144\u00a0kg\u00a0×\u00a01. Je projetterai une date à partir de tes records.');
    expect(O.phraseDeSaisie(HISTOIRE(), '8', MAINTENANT, BARRE, true)).toBe('Pas encore de série à 8 reps ou plus.');
    expect(O.lireSaisie('152,5', '1')).toEqual({ charge: 152.5, reps: 1 });
    expect(O.lireSaisie('0', '1').refus).toBeTruthy();
    expect(O.lireSaisie('150', '1,5').refus).toBeTruthy();
    expect(O.lireSaisie('150', '101').refus).toBeTruthy();
  });

  test('un objectif se pose en charge × reps, à charge positive seulement', () => {
    expect(O.possible({ mesure: 'charge_reps', charge: 'externe', equipement: 'barre' })).toBe(true);
    expect(O.possible({ mesure: 'charge_reps', charge: 'externe', equipement: 'machine' })).toBe(true);
    expect(O.possible({ mesure: 'reps', equipement: 'aucun' })).toBe(false);
    expect(O.possible({ mesure: 'charge_reps', charge: 'ajoutee', equipement: 'aucun' })).toBe(false);
    expect(O.possible({ mesure: 'charge_reps', charge: 'assistance', equipement: 'machine' })).toBe(false);
    expect(O.possible({ mesure: 'duree' })).toBe(false);
  });
});

describe('l\u2019observation du pari', () => {
  const pose = MAINTENANT.toISOString();
  const pari = () => {
    const p = projeter({});
    return O.pariDe(O.ligneDe('squat', 150, 1, pose, p, 'u', 'pari-1'), p, 'u', 'pari-1');
  };

  test('tenu : 150 × 1 le 10 mars 2027 — 145 jours mis, rattachés à la série, au plus tard fin avril', () => {
    const s = HISTOIRE().concat([seance('2027-03-10', [[150, 1, 'echauffement'], [140, 3], [150, 1]])]);
    const o = O.observationDe(pari(), s);
    expect(o.valeur_observee).toBe(145);
    expect(o.set_observe).toBe(s[s.length - 1].series[2].id);   // la série de travail, pas la chauffe à 150
    expect(o.session_id).toBe(s[s.length - 1].id);
    expect(O.estTenu(Object.assign(pari(), o), '2027-03-10')).toBe(true);
  });

  test('non tenu : atteint après l\u2019échéance (observé > prédit), ou rien passé l\u2019échéance ; en cours avant', () => {
    const tard = HISTOIRE().concat([seance('2027-05-05', [[150, 1]])]);
    const o = O.observationDe(pari(), tard);
    expect(o.valeur_observee).toBe(201);
    expect(O.estTenu(Object.assign(pari(), o), '2027-05-05')).toBe(false);
    expect(O.estTenu(pari(), '2027-05-01')).toBe(false);
    expect(O.estTenu(pari(), '2027-04-30')).toBeNull();
  });

  test('ne compte pas : une série d\u2019avant la pose, une chauffe, des reps sous N, une charge sous l\u2019objectif', () => {
    const s = HISTOIRE().concat([seance('2026-10-16', [[150, 1]])]);   // le matin de la pose (18 h > midi : compte)
    s[s.length - 1].debut = new Date(2026, 9, 16, 9, 0, 0).toISOString();   // 9 h : avant la pose — ne compte pas
    const r3 = O.atteinte(s.concat([seance('2027-01-05', [[150, 2, 'echauffement'], [147.5, 3]])]),
      { pose_le: pose, charge_kg: 150, reps: 1 });
    expect(r3).toBeNull();
    expect(O.atteinte([seance('2027-01-05', [[155, 2]])], { pose_le: pose, charge_kg: 150, reps: 3 })).toBeNull();
  });

  test('un objectif changé garde l\u2019ancien pari : il s\u2019observe sur SON objectif, pas sur le nouveau', () => {
    const ancien = pari();                                      // 150 × 1
    const s = HISTOIRE().concat([seance('2027-01-20', [[150, 1]])]);
    const nouveau = { pose_le: new Date(2026, 10, 1).toISOString(), charge_kg: 155, reps: 1 };
    expect(O.atteinte(s, nouveau)).toBeNull();                  // 155 n'est pas atteint
    expect(O.observationDe(ancien, s).valeur_observee).toBe(96);   // 150 l'est : l'ancien pari s'observe
  });
});

describe('les paris d\u2019objectif ne comptent pas dans le total des bilans', () => {
  test('« Sur N paris vérifiés » ne lit que les paris de consigne (`Bilan.compterParis` reçoit `parisDeConsigneConnus`)', () => {
    const fs = require('fs');
    const app = fs.readFileSync(require('path').join(__dirname, '../../v2/js/app.js'), 'utf8');
    const corps = app.slice(app.indexOf('function parisDeConsigneConnus'), app.indexOf('function bilanDe('));
    expect(corps).toMatch(/x\.l\.module === Moteur\.MODULE_CONSIGNE/);
    // et les paris d'objectif ne vivent pas dans `local.predictions` (le circuit des paris de la séance) : leur liste
    // est à part (`local.parisObjectif`), lue par l'observation et rien d'autre.
    const pose = app.slice(app.indexOf('async function poserObjectif'), app.indexOf('async function retirerObjectif'));
    const obs = app.slice(app.indexOf('async function observerObjectifs'), app.indexOf('async function poserChoixDeSemaine'));
    expect(pose + obs).not.toMatch(/local\.predictions/);
  });

  test('le score de guilde n\u2019en tient pas compte (`faits.recordsSansDepasser`)', () => {
    const fs = require('fs');
    const faits = fs.readFileSync(require('path').join(__dirname, '../../v2/js/faits.js'), 'utf8');
    const corps = faits.slice(faits.indexOf('function recordsSansDepasser'), faits.indexOf('function scoresDeGuilde'));
    expect(corps).toMatch(/p\.module === Moteur\.MODULE_OBJECTIF/);
  });
});

describe('la migration absente', () => {
  test('une table que la base ne connaît pas se reconnaît (PostgREST PGRST205, Postgres 42P01) ; le réseau, non', () => {
    global.window = global;
    require('../../v2/js/donnees.js');
    const D = global.THDonnees;
    expect(D.tableAbsente({ code: 'PGRST205' })).toBe(true);
    expect(D.tableAbsente({ code: '42P01' })).toBe(true);
    expect(D.tableAbsente({ code: '' , message: 'Failed to fetch' })).toBe(false);
    expect(D.tableAbsente(null)).toBe(false);
  });
});

describe('audit du 16/10/2026, 01 #3 — l’objectif lit Ma salle (MOTEUR §10 bis) : refusé au-delà de la plus lourde', () => {
  // Le cas réel d'Aurélien : curl EZ, barres de 10 à 30 kg ; record 25 × 10. Avant : 35 × 10 recevait une date et un
  // pari, sur une charge que le coach ne proposera jamais dans cette salle.
  const EZ = { materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] };
  const curl = () => [seance('2026-06-01', [[20, 10]]), seance('2026-08-01', [[22.5, 10]]), seance('2026-10-01', [[25, 10]])];
  const poser = (o) => O.projection(Object.assign({ seances: curl(), charge: 35, reps: 10, maintenant: MAINTENANT,
    anciennete: null, options: BARRE, salle: EZ }, o));
  test('⚠️ DISCRIMINANT — 35 × 10 au curl EZ : refusé, avec le fait « Ta salle va jusqu’à 30 kg en barre EZ. »', () => {
    const p = poser({});
    expect([p.etat, p.salle, p.max]).toEqual(['hors_salle', 'barre_ez', 30]);
    expect(O.phraseHorsSalle(p)).toBe('Ta salle va jusqu’à ' + M.charge(30) + ' en barre EZ.');
    expect(O.pariDe({ exercise_slug: 'curl', charge_kg: 35, reps: 10, pose_le: MAINTENANT.toISOString() }, p, 'u', 'id')).toBeNull();
    expect(poser({ carnet: true }).etat).toBe('hors_salle');           // en carnet aussi : l'objectif est hors d'atteinte
  });
  test('à la plus lourde, ou entre deux barres (27,5 s’atteint à 30) : posé normalement ; sans salle déclarée : rien ne change', () => {
    expect(poser({ charge: 30 }).etat).not.toBe('hors_salle');
    expect(poser({ charge: 27.5 }).etat).not.toBe('hors_salle');
    expect(poser({ salle: null }).etat).not.toBe('hors_salle');
  });
  test('aux haltères, dans l’unité des séries (la paire) : « Ta salle va jusqu’à 2 × 40 kg en haltères. »', () => {
    const H = { materiel: 'halteres', charges: Array.from({ length: 20 }, (_, i) => 4 * (i + 1)) };
    const p = poser({ salle: H, charge: 84 });
    expect(p.etat).toBe('hors_salle');
    expect(O.phraseHorsSalle(p)).toBe('Ta salle va jusqu’à 2 × ' + M.charge(40) + ' en haltères.');
    expect(poser({ salle: H, charge: 80 }).etat).not.toBe('hors_salle');
  });
  test('une barre qu’on charge (record au-delà de la plus lourde barre fixe) : la salle n’en dit rien', () => {
    const droite = { materiel: 'barre_droite', charges: [10, 20, 30] };
    const rowing = [seance('2026-06-01', [[70, 8]]), seance('2026-08-01', [[75, 8]]), seance('2026-10-01', [[80, 8]])];
    expect(poser({ salle: droite, seances: rowing, charge: 90, reps: 8 }).etat).not.toBe('hors_salle');
  });
});

describe('audit du 16/10/2026, 01 #11 — posé en « Juste un carnet », la date se calcule au retour en Progresser, une fois', () => {
  const poseCarnet = '2026-09-01T10:00:00.000Z';
  const carnet = () => O.ligneDe('squat', 150, 1, poseCarnet, projeter({ carnet: true }), 'u', null);
  test('posé en carnet : ni date ni pari ; revenu en Progresser, la page disait « Pas encore de date. »', () => {
    const l = carnet();
    expect([l.projection, l.echeance, l.pari_id]).toEqual(['carnet', null, null]);
    expect(O.vue({ objectif: l, seances: HISTOIRE(), options: BARRE, maintenant: MAINTENANT, carnet: false }).ligne).toBe(O.PAS_ENCORE);
  });
  test('⚠️ DISCRIMINANT — au retour : la date projetée à l’instant du retour, le pari posé alors ; la pose et le départ gardés', () => {
    const l = carnet();
    const pr = projeter({});
    const r = O.ligneAuRetour(l, pr, 'pari-retour');
    expect([r.projection, r.echeance, r.pari_id, r.pose_le, r.depart_kg]).toEqual(['date', '2027-04-30', 'pari-retour', poseCarnet, l.depart_kg]);
    expect(O.vue({ objectif: r, seances: HISTOIRE(), options: BARRE, maintenant: MAINTENANT, carnet: false }).ligne)
      .toBe('Le pari du coach\u00a0: fin avril.');
    const pari = O.pariDe({ exercise_slug: 'squat', charge_kg: 150, reps: 1, pose_le: MAINTENANT.toISOString() }, pr, 'u', 'pari-retour');
    expect([pari.emise_a, pari.fondement.pose_le, pari.valeur_predite]).toEqual([MAINTENANT.toISOString(), MAINTENANT.toISOString(), 196]);
  });
  test('une fois : une ligne qui n’est plus du carnet ne se reprojette pas ; « déjà fait » ne change rien', () => {
    const r = O.ligneAuRetour(carnet(), projeter({}), 'p');
    expect(O.ligneAuRetour(r, projeter({}), 'p2')).toBeNull();
    expect(O.ligneAuRetour(carnet(), projeter({ charge: 140 }), 'p')).toBeNull();
    const pe = O.ligneAuRetour(carnet(), projeter({ seances: HISTOIRE().slice(-2) }), 'p');
    expect([pe.projection, pe.pari_id]).toEqual(['pas_encore', null]);
  });
});


describe('150 — le pari figé, et « Au rythme d\u2019aujourd\u2019hui » (second appel de la même projection, rien d\u2019écrit)', () => {
  const pose = () => O.ligneDe('squat', 150, 1, MAINTENANT.toISOString(), projeter({}), 'u', 'pari-1');
  const vue = (o) => O.vue(Object.assign({ objectif: pose(), seances: HISTOIRE(), options: BARRE, maintenant: MAINTENANT }, o));

  test('même mois que le pari : « toujours fin avril » ; le pari porte sa date de pose', () => {
    const v = vue({});
    expect(v.ligne).toBe('Le pari du coach\u00a0: fin avril.');
    expect(v.pari).toBe('Pos\u00e9 le 16 oct. On verra s\u2019il tombe juste.');
    expect(v.rythme).toBe('Au rythme d\u2019aujourd\u2019hui\u00a0: toujours fin avril.');
  });

  test('un record de plus : la ligne change (autre mois), le pari ne bouge pas', () => {
    const plusTard = new Date(2026, 10, 20, 12);
    const avance = HISTOIRE().concat([seance('2026-11-10', [[147.5, 1]])]);
    const attendu = projeter({ seances: avance, maintenant: plusTard }).echeance;
    expect(attendu).not.toBe('2027-04-30');
    const v = vue({ seances: avance, maintenant: plusTard });
    expect(v.ligne).toBe('Le pari du coach\u00a0: fin avril.');
    expect(v.pari).toBe('Pos\u00e9 le 16 oct. On verra s\u2019il tombe juste.');
    expect(v.rythme).toMatch(/^Au rythme d\u2019aujourd\u2019hui\u00a0: fin [a-zéû]+\.$/);
    expect(v.rythme).not.toMatch(/toujours/);
    expect(v.rythme).not.toBe('Au rythme d\u2019aujourd\u2019hui\u00a0: fin avril.');
  });

  test('plus d\u2019un an, pas encore de date', () => {
    const lent = [seance('2025-01-01', [[138, 1]]), seance('2025-06-01', [[140, 1]]), seance('2026-09-01', [[141, 1]]),
      seance('2026-09-20', [[144, 1]])];
    expect(projeter({ seances: lent, maintenant: new Date(2027, 2, 1) }).etat).toBe('plus_d_un_an');
    expect(vue({ seances: lent, maintenant: new Date(2027, 2, 1) }).rythme).toBe('Au rythme d\u2019aujourd\u2019hui\u00a0: plus d\u2019un an.');
    const peu = [seance('2026-09-20', [[144, 1]])];
    expect(projeter({ seances: peu, maintenant: new Date(2027, 2, 1) }).etat).toBe('pas_encore');
    expect(vue({ seances: peu, maintenant: new Date(2027, 2, 1) }).rythme).toBe('Au rythme d\u2019aujourd\u2019hui\u00a0: pas encore de date.');
  });

  test('atteint : « Atteint le … » seul ; carnet : rien ; hors salle : rien ; sans pari : la carte reste comme avant', () => {
    const atteint = HISTOIRE().concat([seance('2027-02-12', [[150, 1]])]);
    const a = vue({ seances: atteint, maintenant: new Date(2027, 1, 20) });
    expect([a.ligne, a.pari, a.rythme]).toEqual(['Atteint le 12 février.', null, null]);
    const c = vue({ carnet: true });
    expect([c.ligne, c.pari, c.rythme]).toEqual([null, null, null]);
    const EZ = { materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] };
    const curl = [seance('2026-06-01', [[20, 10]]), seance('2026-08-01', [[22.5, 10]]), seance('2026-10-01', [[25, 10]])];
    const l35 = Object.assign({}, pose(), { charge_kg: 35, reps: 10 });
    expect(projeter({ seances: curl, charge: 35, reps: 10, salle: EZ }).etat).toBe('hors_salle');   // la fixture déclenche le chemin
    const hs = O.vue({ objectif: l35, seances: curl, options: BARRE, maintenant: MAINTENANT, salle: EZ });
    expect(hs.rythme).toBeNull();
    expect(O.vue({ objectif: l35, seances: curl, options: BARRE, maintenant: MAINTENANT }).rythme).not.toBeNull();   // sans la salle : une ligne
    const lent = [seance('2025-01-01', [[138, 1]]), seance('2025-06-01', [[140, 1]]), seance('2026-09-01', [[141, 1]])];
    const sansPari = O.ligneDe('squat', 150, 1, MAINTENANT.toISOString(), projeter({ seances: lent }), 'u');
    const v = O.vue({ objectif: sansPari, seances: lent, options: BARRE, maintenant: MAINTENANT });
    expect([v.ligne, v.pari, v.rythme]).toEqual(['Au rythme actuel\u00a0: plus d\u2019un an.', null, null]);
  });

  test('l\u2019année de la pose seulement si elle diffère d\u2019aujourd\u2019hui', () => {
    const l = Object.assign({}, pose(), { pose_le: new Date(2026, 9, 16, 12).toISOString() });
    expect(O.vue({ objectif: l, seances: HISTOIRE(), options: BARRE, maintenant: new Date(2027, 0, 5, 12) }).pari)
      .toBe('Pos\u00e9 le 16 oct. 2026. On verra s\u2019il tombe juste.');
  });

  test('rien n\u2019est écrit : l\u2019objet de la ligne et les séances sont intacts après deux rendus', () => {
    const l = pose(), s = HISTOIRE();
    const avant = JSON.stringify([l, s]);
    O.vue({ objectif: l, seances: s, options: BARRE, maintenant: MAINTENANT });
    O.vue({ objectif: l, seances: s, options: BARRE, maintenant: MAINTENANT });
    expect(JSON.stringify([l, s])).toBe(avant);
  });
});
