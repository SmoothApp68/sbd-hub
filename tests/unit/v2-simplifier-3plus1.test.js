/** @jest-environment node */
//
// « Simplifier », pilote 3+1 (21/11/2026) — LA TÊTE D'UN EXERCICE EN SÉANCE : trois éléments au plus et une carte de décision ; les formes courtes sont ÉCRITES PAR LE MOTEUR ;
// rien d'annoncé n'est caché ; I269 (le court est un extrait du gris), I270 (la tête, les deux phrases qui partent à la feuille), I271 (une carte à la fois, dans l'ordre).

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const fs = require('fs');
const path = require('path');

const esp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
const BLOC = { id: 'b1', dossier: 'Force', zone: 'lourd', debut: '2026-10-12', semaines: 4, decharge: true, statut: 'en_cours', exercices: ['couche'], precedent: null };
function decor(opts) {
  const o = Object.assign({ debut: '2026-11-03T10:00:00+00:00', vise: 5, series: 4, routine: 4, bloc: true, niveau: null }, opts || {});
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: o.series });
  const K = { etat: 'progression', zone: 'lourd', palier: 125, niveau: o.niveau === null ? o.vise : o.niveau, n: o.series, ligne: { charge: 125, vise: o.vise }, haut: null,
    fondement: { date: '2026-10-26T17:00:00.000Z', reps: [5, 5, 5, 5] } };
  const e = { seance: { id: 'S1', debut: o.debut, edition: false, exercices: se.exercices },
    consignes: { couche: { consigne: K, libelles: M.libellesConsigne(K, o.debut), compteur: { compteur: 0, meilleur: null, blocages: [] }, repli: null } },
    reglage: 'franc', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' }, seriesRoutine: { couche: o.routine }, marches: [] },
    programme: { blocs: o.bloc ? [BLOC] : [], lignes: [] } };
  return { e, p: T.planDeSeance(e) };
}
const erreurs = (p, e, re) => T.verifierPlan(p, e).erreurs.filter((m) => re.test(m));

describe('la forme courte de la Décharge est écrite par le moteur (décision 5, I165)', () => {
  test('« Décharge : 2 séries au lieu de 4. » sans la semaine ; le bandeau la dit ; le moteur écrit les deux', () => {
    const { e, p } = decor();
    const x = p.exercices[0];
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4 : 2 séries au lieu de 4.');
    expect(esp(x.entete.court)).toBe('Décharge : 2 séries au lieu de 4.');
    expect(x.entete.court).toBe(M.grisAllegee(x.consigne, true));
    expect(esp(p.allegee.bandeau)).toMatch(/^Décharge, semaine 4 sur 4/);
    expect(x.tete.ligne).toBe('court');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('les textes fixes de la Décharge portent la forme courte (I165 les balaie)', () => {
    expect(M.textesFixesDeLaDecharge().map(esp)).toContain('Décharge : 2 séries au lieu de 3.');
  });
  test('I165 refuse une tête courte qui dit la semaine', () => {
    const { e, p } = decor();
    p.exercices[0].entete.court = 'Décharge, semaine 4 sur 4 : 2 séries au lieu de 4.';
    expect(erreurs(p, e, /^I165.*tête/).length).toBeGreaterThan(0);
  });
});

describe('I269 — la tête courte est un extrait du gris', () => {
  test('hors décharge : le verbe avec son chiffre, sans le fait daté', () => {
    const { e, p } = decor({ bloc: false, vise: 6, niveau: 5 });
    const x = p.exercices[0];
    expect(esp(x.entete.gris)).toMatch(/^.+ : 125 kg × 5, 5, 5, 5\. Une rep de plus : 125 kg × 6\.$/);
    expect(esp(x.entete.court)).toBe('Une rep de plus : 125 kg × 6.');
    expect(x.entete.court).toBe(M.grisCourt(x.consigne, e.seance.debut));
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('un autre texte, ou un chiffre que le gris ne dit pas, est refusé', () => {
    const { e, p } = decor({ bloc: false, vise: 6, niveau: 5 });
    p.exercices[0].entete.court = 'Une rep de plus : 125 kg × 7.';
    expect(erreurs(p, e, /^I269/).length).toBeGreaterThan(0);
    p.exercices[0].entete.court = 'Tu montes à 130 kg.';
    expect(erreurs(p, e, /^I269/).length).toBeGreaterThan(0);
  });
});

describe('I270 — la tête : trois éléments, deux phrases qui partent à la feuille', () => {
  test('le compteur passe avant « Pendant ce temps » ; jamais plus de trois éléments', () => {
    const { e, p } = decor({ bloc: false, vise: 6, niveau: 5 });
    const x = p.exercices[0];
    x.entete.compteur = 'c'; x.entete.frere = 'f'; x.pourquoi.frere = 'f';
    x.tete.tiers = 'compteur';
    expect(erreurs(p, e, /^I270/)).toEqual([]);
    x.tete.tiers = 'frere';
    expect(erreurs(p, e, /^I270/).length).toBeGreaterThan(0);
    // Le plan lui-même : avec les deux, UN seul troisième élément, le compteur.
    x.tete.tiers = null;
    T.tetesDuPlan(p, e);
    expect(x.tete.tiers).toBe('compteur');
    expect(erreurs(p, e, /^I270/)).toEqual([]);
    delete x.entete.compteur;
    T.tetesDuPlan(p, e);
    expect(x.tete.tiers).toBe('frere');
  });
  test('la phrase du « ≈ » et la raison de la chauffe sont à la feuille, mot pour mot, ou restent où elles étaient', () => {
    const { e, p } = decor({ bloc: false, vise: 6, niveau: 5 });
    const x = p.exercices[0];
    x.approchee = { phrase: '≈ 92,5 kg : vise la barre au-dessus.' };
    x.consigne = Object.assign({}, x.consigne, { etat: 'test_propose' });
    x.entete.jaune = ['Aujourd\u2019hui : 90 kg × 8.', 'Si ça passe, ≈ 92,5 kg × 6.'];
    T.tetesDuPlan(p, e);
    expect(x.tete.approchee).toBe('feuille');
    expect(x.pourquoi.approchee).toBe('≈ 92,5 kg : vise la barre au-dessus.');
    expect(erreurs(p, e, /^I270/)).toEqual([]);
    delete x.pourquoi.approchee;
    expect(erreurs(p, e, /^I270/).length).toBeGreaterThan(0);
  });
});

describe('I271 — une seule carte de décision à la fois, dans l\'ordre', () => {
  test('reprise avant forme, forme avant « un cran dessous », calage, autres, veille, chauffes', () => {
    expect(T.ORDRE_DE_LA_FILE).toEqual(['reprise', 'veille', 'test', 'forme', 'paris', 'calage', 'autre', 'chauffes']);
    const { e, p } = decor({ bloc: false });
    const x = p.exercices[0];
    x.proposition = { phrase: 'Chauffe : 45 kg × 15.', pourquoi: 'raison', lignes: [] };
    x.carteReprise = { titre: 't', phrase: 'p', choix: [] };
    T.tetesDuPlan(p, e);
    expect(x.file.carte).toBe('reprise');
    expect(x.file.enAttente).toEqual(['chauffes']);
    expect(erreurs(p, e, /^I271/)).toEqual([]);
    x.file.carte = 'chauffes'; x.file.enAttente = [];
    expect(erreurs(p, e, /^I271/).length).toBeGreaterThan(0);
  });
  test('la veille de la séance passe avant les chauffes ; les chauffes posées ne sont jamais en file', () => {
    const { e, p } = decor({ bloc: false });
    const x = p.exercices[0];
    x.proposition = { phrase: 'Chauffe : 45 kg × 15.', pourquoi: null, lignes: [] };
    p.veilleActivite = { slug: 'couche' };
    x.chauffesPosees = { texte: 'posées' };
    T.tetesDuPlan(p, e);
    expect(x.file.carte).toBe('veille');
    expect(x.file.enAttente).toEqual(['chauffes']);
    expect(x.file.ordre).not.toContain('posees');
  });
});

describe('l\'écran lit, il ne coupe pas', () => {
  const rendu = fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  test('rendu.js ne retire plus le fait daté : la ligne grise est le texte du moteur, « Pourquoi ? » à son bout', () => {
    expect(rendu).toMatch(/el\('div', 'consigne-dit', lib\.gris\)/);
    expect(rendu).toMatch(/'ligne-gris'/);
    expect(rendu).not.toMatch(/lib\.gris\.(replace|slice|split|substring)/);
  });
  test('app.js lit la forme courte du plan et la file', () => {
    expect(app).toMatch(/gris: x\.entete\.court \|\| x\.entete\.gris/);
    expect(app).toMatch(/carteEnAttente\(i, 'chauffes'\)/);
    // le troisième élément : le compteur OU le frère, jamais les deux (la tête lit `x.tete.tiers`)
    expect(app).toMatch(/compteur: x\.entete\.compteur && \(!tete \|\| tete\.tiers === 'compteur'\)/);
    expect(app).toMatch(/frere: x\.entete\.frere && \(!tete \|\| tete\.tiers === 'frere'\)/);
  });
});


describe('contradicteur du 21/11/2026 : cinq défauts, chacun avec son test discriminant', () => {
  test('1. la veille ne compte que pour SA barre : les chauffes des autres exercices ne l\u2019attendent pas', () => {
    const p = { veilleActivite: { slug: 'squat' }, exercices: [
      { slug: 'couche', entete: {}, proposition: { pourquoi: null, lignes: [] } },
      { slug: 'squat', entete: {}, carteReprise: { titre: 't' } }] };
    T.tetesDuPlan(p, {});
    expect(p.exercices[0].file.carte).toBe('chauffes');
    expect(p.exercices[0].file.enAttente).toEqual([]);
    expect(p.exercices[1].file.carte).toBe('reprise');
    expect(p.exercices[1].file.enAttente).toEqual(['veille']);
    // l\u2019app lit la file de la barre de la veille avant d\u2019afficher la carte
    expect(fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8')).toMatch(/carteEnAttente\(iV, 'veille'\)/);
  });
  test('1 bis. I271 relit la veille par barre, à part', () => {
    const { e, p } = decor({ bloc: false });
    const x = p.exercices[0];
    p.veilleActivite = { slug: 'squat' };            // une autre barre que le couché
    x.proposition = { phrase: 'Chauffe : 45 kg × 15.', pourquoi: null, lignes: [] };
    T.tetesDuPlan(p, e);
    expect(x.file.carte).toBe('chauffes');
    expect(erreurs(p, e, /^I271/)).toEqual([]);
    x.file = { ordre: T.ORDRE_DE_LA_FILE.slice(), carte: 'veille', enAttente: ['chauffes'] };
    expect(erreurs(p, e, /^I271/).length).toBeGreaterThan(0);
  });
  test('2. une ligne approchée HORS test (pas de puce « Si ça passe ») garde sa phrase en tête', () => {
    const K = { etat: 'progression', zone: 'mix', palier: 32.5, niveau: 8, n: 3, ligne: { charge: 32.5, vise: 9, approchee: true }, haut: null,
      fondement: { date: '2026-10-28T17:00:00.000Z', reps: [8, 8, 8], approchee: true } };
    const { e, p } = decor({ bloc: false });
    const x = p.exercices[0];
    x.approchee = { phrase: '≈ 32,5 kg : vise la charge la plus proche.' };
    x.consigne = Object.assign({}, x.consigne, K);
    x.entete.jaune = ['Aujourd\u2019hui : 32,5 kg × 9.'];
    T.tetesDuPlan(p, e);
    expect(x.tete.approchee).toBe('tete');
    expect(x.pourquoi.approchee).toBeUndefined();
    expect(erreurs(p, e, /^I270/)).toEqual([]);
    x.tete.approchee = 'feuille'; x.pourquoi.approchee = x.approchee.phrase;
    expect(erreurs(p, e, /^I270/).length).toBeGreaterThan(0);
  });
  test('3. en Décharge, la tête courte ne remplace jamais la phrase du repli', () => {
    let n = 0; const id = () => 's' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'couche', id, { series: 4 });
    const debut = '2026-11-03T10:00:00+00:00';
    const K0 = { etat: 'progression', zone: 'lourd', palier: 125, niveau: 5, n: 4, ligne: { charge: 125, vise: 5 }, haut: null, fondement: { date: '2026-10-26T17:00:00.000Z', reps: [5, 5, 5, 5] } };
    const K = M.consignePlusLegere(K0, { palier: 120, niveau: 4, debut: '2026-10-01T17:00:00.000Z', reps: [4, 4, 4], ligne: [120, 4] });
    const e = { seance: { id: 'S1', debut, edition: false, exercices: se.exercices },
      consignes: { couche: { consigne: K, libelles: M.libellesConsigne(K, debut), compteur: { compteur: 0, meilleur: null, blocages: [] }, repli: null } },
      reglage: 'franc', paris: [], suites: {}, phase: 'maintien', catalogue: null,
      escalier: { cartes: [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' }, seriesRoutine: { couche: 4 }, marches: [] },
      programme: { blocs: [BLOC], lignes: [] } };
    const p = T.planDeSeance(e); const x = p.exercices[0];
    expect(x.consigne.repli).toBeTruthy();
    expect(x.entete.court).toBeUndefined();
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /^I269/.test(m))).toEqual([]);
  });
  test('5. I271 : une décision appliquée (chauffes posées, silence) n\u2019est jamais une carte de la file', () => {
    const { e, p } = decor({ bloc: false });
    const x = p.exercices[0];
    x.proposition = { phrase: 'Chauffe : 45 kg × 15.', pourquoi: null, lignes: [] };
    x.chauffesPosees = { texte: 'posées' };
    T.tetesDuPlan(p, e);                    // la file retient les chauffes alors qu\u2019elles sont posées
    expect(x.file.carte).toBe('chauffes');
    expect(erreurs(p, e, /^I271.*décision appliquée/).length).toBe(1);
    delete x.chauffesPosees; x.silenceChauffes = { texte: 's', annuler: 'Annuler' };
    expect(erreurs(p, e, /^I271.*décision appliquée/).length).toBe(1);
    delete x.silenceChauffes;
    expect(erreurs(p, e, /^I271/)).toEqual([]);
  });
});
