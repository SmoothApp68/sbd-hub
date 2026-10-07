/** @jest-environment node */
//
// 60-1 — « JUSTE UN CARNET » (QUESTIONNAIRE-COACH-V2 §4).
//
// Entretenir, au profil, est le silence entier : `planDeSeance` ne produit
// aucune phrase, proposition, carte ni bandeau du coach — la dégressive
// (§9.15.3), le bandeau de décharge planifiée et la fenêtre de semaine allégée
// comprises, que 60-0 avait trouvés parlants (relevé du 07/10). L'invariant I13
// le garde (`sansCoach`). Ce que le carnet GARDE n'est pas une voix : le
// pré-remplissage des séries, le nombre de séries à l'ajout, la structure.
//
// ⚠️ CHAQUE CAS A SON TÉMOIN. Un test « Entretenir est muet » qui ne prouve pas
// que le même plan, en Progresser, PARLE ne prouve rien : la fixture déclenche
// d'abord le chemin visé (la dégressive, le bandeau), puis on éteint.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const DEBUT = '2026-10-07T10:00:00+00:00';
const CATALOGUE = {
  squat_barre: { equipement: 'barre', muscles_primaires: ['quadriceps'], mesure: 'charge_reps' },
  extension_jambes: { equipement: 'machine', muscles_primaires: ['quadriceps'], mesure: 'charge_reps' }
};

// Un squat (deux chauffes de routine) et une extension de jambes dont la
// dernière série de travail est validée à 40 kg × 10 : la dégressive qui la
// suit a donc une référence, et le plan la remplit.
function seance() {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
  se = S.insererChauffes(se, 0, [[0, 10], [0, 6]], id);
  se = S.ajouterExercice(se, 'extension_jambes', id, { series: 3 });
  se = S.ajouterSerie(se, 1, id);
  const iDeg = se.exercices[1].series.length - 1;
  se = S.changerType(se, 1, iDeg, 'degressive');
  let iTravail = -1;
  se.exercices[1].series.forEach((x, i) => { if (x.type_serie === 'travail') iTravail = i; });
  return S.valider(S.modifierSerie(se, 1, iTravail, { charge_kg: 40, reps: 10 }), 1, iTravail, new Date(DEBUT));
}

const CONSIGNE = { etat: 'progression', zone: 'lourd', palier: 125, niveau: 5, n: 3,
  ligne: { charge: 125, vise: 5 }, haut: null, fondement: {} };

function entrees(intention, extra) {
  const se = seance();
  return Object.assign({
    seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: {
      squat_barre: intention === 'entretien' ? null : { consigne: CONSIGNE, libelles: M.libellesConsigne(CONSIGNE), pas: null },
      extension_jambes: null
    },
    catalogue: CATALOGUE, reglage: 'normal', intention: intention, paris: [], suites: {}
  }, extra || {});
}

const ouvert = (p, slug) => p.exercices.filter((x) => x.slug === slug)[0];
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs;

// Un bloc dont la dernière semaine (la décharge planifiée) contient DEBUT.
const BLOC = { id: 'b1', dossier: 'Force', zone: 'mix', debut: '2026-09-21', semaines: 3, decharge: true,
  exercices: ['squat_barre'], statut: 'en_cours', precedent: null };
const ESCALIER_VIDE = { cartes: [], compteurs: [], marches: [], noms: {}, seriesRoutine: {} };
// Une semaine allégée ACCEPTÉE qui couvre DEBUT (la forme de `cartesDesParis`).
const CARTE_ACCEPTEE = { id: 'c1', seance: 'S0', jour: '2026-10-05', declencheur: 'squat_barre', compteur: 4,
  reponse: 'acceptee', debut: '2026-10-05', fin: '2026-10-11', cites: ['squat_barre'] };

describe('60-1 — la dégressive se tait en Entretenir (le témoin d’abord)', () => {
  test('témoin : en Progresser, la dégressive parle (phrase, fantôme, charge sous la série de travail)', () => {
    const p = T.planDeSeance(entrees('progresser'));
    const x = ouvert(p, 'extension_jambes');
    expect(x.degressive).not.toBeNull();
    expect(x.degressive.phrase).toMatch(/^Dégressive : 30/);
    expect(x.phrases.map((q) => q.ou)).toContain('degressive');
    expect(x.lignes.filter((l) => l.type === 'degressive')[0].fantome).toEqual({ charge: 30, reps: null, source: 'degressive' });
  });

  test('Entretenir (profil) : ni dégressive, ni phrase, ni fantôme du coach', () => {
    const p = T.planDeSeance(entrees('entretien'));
    p.exercices.forEach((x) => {
      expect(x.degressive).toBeNull();
      expect(x.phrases).toEqual([]);
      expect(x.chauffes).toBeNull();
      expect(x.proposition).toBeNull();
      expect(x.consigne).toBeNull();
      expect(x.lignes.filter((l) => l.fantome && l.fantome.source)).toEqual([]);
    });
  });

  test('I13 tient sur ce plan, et la garde SAIT lire la dégressive (violation forgée)', () => {
    const e = entrees('entretien');
    const p = T.planDeSeance(e);
    expect(erreurs(p, e)).toEqual([]);
    // Forgée : la dégressive d'un plan Progresser, recopiée dans le plan muet.
    const parle = ouvert(T.planDeSeance(entrees('progresser')), 'extension_jambes');
    const forge = JSON.parse(JSON.stringify(p));
    ouvert(forge, 'extension_jambes').degressive = parle.degressive;
    const err = erreurs(forge, e).filter((r) => /^I13 /.test(r));
    expect(err.length).toBeGreaterThan(0);
    expect(err.join('\n')).toMatch(/dégressive/);
  });

  test('le nombre de séries à l’ajout reste celui de seriesDeDepart (2 en Entretenir, 3 en Progresser) : ce n’est pas une voix', () => {
    // Le nombre de séries proposé à l'ajout reste l'affaire de `seriesDeDepart` :
    // 3 en Progresser, 2 en Entretenir sans historique (plan.js, Spiering 2021).
    expect(T.seriesDeDepart(null, null, 'entretien')).toBe(2);
    expect(T.seriesDeDepart(null, null, 'progresser')).toBe(3);
  });
});

describe('60-1 — Entretenir par exercice (I31) : la même voix éteinte, exercice par exercice', () => {
  test('profil Progresser, extension_jambes en Entretien : elle se tait, le squat parle encore', () => {
    const e = entrees('progresser', { modes: { extension_jambes: 'entretien' } });
    const p = T.planDeSeance(e);
    expect(ouvert(p, 'extension_jambes').degressive).toBeNull();
    expect(ouvert(p, 'extension_jambes').phrases).toEqual([]);
    expect(ouvert(p, 'squat_barre').chauffes).not.toBeNull();
    expect(erreurs(p, e)).toEqual([]);
  });
});

describe('60-1 — le bandeau de décharge planifiée et la fenêtre de semaine allégée', () => {
  test('témoin : en Progresser, le bandeau de décharge du programme est là', () => {
    const p = T.planDeSeance(entrees('progresser', { escalier: ESCALIER_VIDE, programme: { blocs: [BLOC], lignes: [] } }));
    expect(p.allegee).not.toBeNull();
    expect(p.allegee.bandeau).toMatch(/^Semaine 3 sur 3/);
  });

  test('Entretenir : ni bandeau de décharge, ni carte', () => {
    const e = entrees('entretien', { escalier: ESCALIER_VIDE, programme: { blocs: [BLOC], lignes: [] } });
    const p = T.planDeSeance(e);
    expect(p.allegee).toBeNull();
    expect(p.carte).toBeNull();
    expect(erreurs(p, e)).toEqual([]);
  });

  test('témoin : une semaine allégée acceptée avant la bascule parle en Progresser, se tait en Entretenir', () => {
    const esc = Object.assign({}, ESCALIER_VIDE, { cartes: [CARTE_ACCEPTEE] });
    expect(T.planDeSeance(entrees('progresser', { escalier: esc })).allegee).not.toBeNull();
    const e = entrees('entretien', { escalier: esc });
    const p = T.planDeSeance(e);
    expect(p.allegee).toBeNull();
    expect(erreurs(p, e)).toEqual([]);
  });

  test('I13 lit le plan : un bandeau forgé dans un plan Entretenir est refusé', () => {
    const e = entrees('entretien', { escalier: ESCALIER_VIDE, programme: { blocs: [BLOC], lignes: [] } });
    const parle = T.planDeSeance(entrees('progresser', { escalier: ESCALIER_VIDE, programme: { blocs: [BLOC], lignes: [] } }));
    const forge = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    forge.allegee = parle.allegee;
    const err = erreurs(forge, e).filter((r) => /^I13 /.test(r));
    expect(err.join('\n')).toMatch(/bandeau/);
  });
});

describe('60-1 — ce que le carnet GARDE : les séries restent pré-remplies', () => {
  test('la charge de la dernière séance, sans aucune consigne', () => {
    const e = entrees('entretien', { precedents: { extension_jambes: { debut: '2026-09-30T10:00:00+00:00', series: [
      { type_serie: 'travail', charge_kg: 45, reps: 8 }, { type_serie: 'travail', charge_kg: 45, reps: 8 },
      { type_serie: 'travail', charge_kg: 45, reps: 8 }] } } });
    // On repart d'une séance sans série validée, pour que rien ne soit « tapé ».
    let se = S.creer({ id: 'S2', userId: 'u', idSerie: (() => { let n = 0; return () => 'q' + (++n); })() });
    se = S.ajouterExercice(se, 'extension_jambes', (() => { let n = 100; return () => 'q' + (++n); })(), { series: 3 });
    e.seance = { id: 'S2', debut: DEBUT, edition: false, exercices: se.exercices };
    e.consignes = { extension_jambes: null };
    const x = ouvert(T.planDeSeance(e), 'extension_jambes');
    expect(x.lignes.map((l) => l.prerempli.charge_kg)).toEqual([45, 45, 45]);
  });
});

describe('60-1 — le profil : « Juste un carnet »', () => {
  test('le libellé du choix, la valeur en base reste « entretien »', () => {
    expect(Profil.INTENTIONS.map((o) => [o.cle, o.libelle])).toEqual([
      ['progresser', 'Progresser'], ['entretien', 'Juste un carnet']]);
  });

  test('l’aide dit ce que fait le carnet, et seulement ça', () => {
    const s = Profil.sectionIntention({ intention: 'entretien' }, () => {});
    expect(s.titre).toBe('POURQUOI');
    expect(s.segment.valeur).toBe('entretien');
    expect(s.note.fort + ' ' + s.note.reste).toBe(
      'Je me tais : aucune proposition, aucune phrase. Tes séries restent pré-remplies avec ta routine et ta dernière séance.');
  });

  test('sans intention, le profil lit « Progresser » ; un choix écrit la colonne', () => {
    const appels = [];
    const s = Profil.sectionIntention({}, (c) => appels.push(c));
    expect(s.segment.valeur).toBe('progresser');
    expect(s.note.reste).toMatch(/Progresser/);
    s.segment.surChoix('entretien');
    expect(appels).toEqual([{ intention: 'entretien' }]);
  });

  test('aucune phrase ne promet encore « le repos et la structure » ni ne nomme Entretenir au profil', () => {
    ['progresser', 'entretien'].forEach((i) => {
      const s = Profil.sectionIntention({ intention: i }, () => {});
      const texte = s.note.fort + ' ' + s.note.reste + ' ' + Profil.INTENTIONS.map((o) => o.libelle).join(' ');
      expect(texte).not.toMatch(/Entretenir|structure/);
    });
  });
});
