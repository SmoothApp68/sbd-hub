/** @jest-environment node */
//
// 21/11/2026 — QUATRE DÉFAUTS DE TEXTE notés par la revue à froid (aucun calcul du coach ne change : seulement ce qui s'affiche).
//   1. « Tes séries y ont fait . » : la phrase vide du « Pourquoi » d'une consigne `zero_rep`.
//   2. « en gardant N » / « en en gardant N » : le vocabulaire de VOIX-DU-COACH-V1.md est « avec N en réserve » (0 : « jusqu’au bout »).
//   3. En semaine de mesure, la phrase des chauffes ne contredit plus les lignes posées par « Ajouter ces lignes ».
//   4. Le repos conseillé d'une série de mesure ne parle pas d'« essais » ; un exercice non mesuré non plus.

process.env.TZ = 'Europe/Paris';
global.self = global;
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Modele = global.THModele;
const sp = (t) => String(t == null ? '' : t).replace(/[\u00a0\u202f]/g, ' ');

const g = (kg, reps, t) => ({ charge_kg: kg, reps, type_serie: t || 'travail', rpe: null });
const jour = (i) => new Date(Date.UTC(2026, 10, 8 + i * 4, 18)).toISOString();
const seance = (i, series) => ({ seance: { id: 'H' + i, debut: jour(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + '_' + j, rang: j, ressenti: null, exercise_slug: 'squat' }, s)) });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const consigneDe = (liste) => M.consigneDExercice(liste.map((s, i) => seance(i, s)), undefined,
  new Date(Date.parse(jour(liste.length - 1)) + 4 * 864e5).toISOString(), OPT).consigne;

describe('1. « Tes séries y ont fait . » : la phrase se tait quand il n\'y a rien à dire', () => {
  const bonnes = () => [g(140, 3), g(140, 3), g(140, 3)];
  const zeros = () => [g(140, 0, 'echec'), g(140, 0, 'echec'), g(140, 0, 'echec')];
  test('une consigne zero_rep : « validée à 3 reps. » et rien derrière', () => {
    const k = consigneDe([bonnes(), zeros()]);
    expect(k.etat).toBe('zero_rep');
    const p = sp(M.pourquoiConsigne(k).palier);
    expect(p).toBe('Ta charge de travail : 140 kg, validée à 3 reps.');
    expect(p).not.toMatch(/y ont fait/);
  });
  test('une consigne qui a des séries les dit toujours (« Tes séries y ont fait 3, 3, 3. »)', () => {
    const k = consigneDe([bonnes(), bonnes(), bonnes()]);
    const p = sp(M.pourquoiConsigne(k).palier);
    expect(p).toMatch(/Tes séries y ont fait [\d, ]+\.$/);
    expect(p).not.toMatch(/fait \./);
  });
});

describe('2. « avec N en réserve » (VOIX), plus « en gardant N »', () => {
  test('le recul calé sur le max du jour', () => {
    const t = sp(M.pourquoiReculMaxDuJour({ grosse: 132.5, grosseReps: 4, marge: 1, max: 154, reps: 8, pct: 74, charge: 112.5, correction: 0, pas: [] }));
    expect(t).toMatch(/^Ta grosse série, 132,5 kg × 4 avec 1 en réserve, dit que ton max aujourd’hui est d’environ 154 kg\. Pour 8 reps avec 2 en réserve, c’est 74 % : 112,5 kg\./);
    const zero = sp(M.pourquoiReculMaxDuJour({ grosse: 132.5, grosseReps: 4, marge: 0, max: 154, reps: 8, pct: 74, charge: 112.5, correction: 0, pas: [] }));
    expect(zero).toMatch(/× 4 sans marge, dit que/);
  });
  test('le recul, premier écart tiré de la table', () => {
    const t = sp(M.pourquoiRecul({ grosse: 132.5, charge: 112.5, ecart: 0.15, depart: true, deduit: true, grosseReps: 4, marge: 1, vise: 8 }));
    expect(t).toMatch(/ta grosse série à 4 reps avec 1 en réserve, tes reculs à 8 avec 2 en réserve ; jamais moins de 5 %/);
  });
  test('l\'essai d\'une marche', () => {
    expect(sp(M.phraseEssaiDeMarche({ nom: 'Tractions', n: 3, faites: 0, nomDepart: 'Tractions (Élastique)' })))
      .toMatch(/^C.est fait : Tractions, 3 séries, autant de reps que tu peux, avec 2 en réserve\. La prochaine fois/);
  });
  test('les essais de la semaine de mesure', () => {
    expect(sp(M.testConsigneEssai({ etat: 'propose', rang: 1, charge: 142.5, reps: 1, reserve: 2, surLesSecurites: true })))
      .toBe('Essai 1 : 142,5 kg × 1, avec 2 en réserve, sur les sécurités ou avec un pareur.');
    expect(sp(M.testConsigneSerie({ charge: 122.5, visee: [6, 6], reserve: 1, plafond: 6 }))).toMatch(/visée 6 reps, avec 1 en réserve, 6 reps au plus\./);
    expect(sp(M.testConsigneSerie({ charge: 122.5, visee: [6, 6], reserve: 0, plafond: 6 }))).toMatch(/visée 6 reps, autant que tu peux, 6 reps au plus\./);
  });
  test('garde de lexique : aucun texte affiché de v2/js ne dit « en gardant » ni « en en gardant » (les commentaires restent libres)', () => {
    const dossier = path.join(__dirname, '../../v2/js');
    const fautes = [];
    fs.readdirSync(dossier).filter((f) => /\.js$/.test(f)).forEach((f) => {
      fs.readFileSync(path.join(dossier, f), 'utf8').split('\n').forEach((ligne, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(ligne)) return;
        if (/\.test\(/.test(ligne)) return;   // les gardes qui REFUSENT l'ancien mot (I261) le citent
        if (/(['"`])[^'"`]*\ben (?:en )?gardant\b/.test(ligne) && !/\/\/.*en (?:en )?gardant/.test(ligne.replace(/(['"`])[^'"`]*\1/g, ''))) fautes.push(f + ':' + (i + 1));
      });
    });
    expect(fautes).toEqual([]);
  });
});

describe('3 et 4. la semaine de mesure : les chauffes et le repos disent ce qui est posé', () => {
  const [SQ, DC] = Modele.BARRES;
  const FICHES = {
    [DC]: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
    curl: { nom: 'Curl', equipement: 'haltere', mesure: 'charge_reps', muscles_primaires: ['biceps'], muscles_secondaires: [], muscles_stabilisateurs: [] }
  };
  let k = 0;
  const id = () => 'x-s' + (++k);
  const entrees = (se, extra) => Object.assign({
    seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, routine_id: 'R', exercices: se.exercices },
    consignes: { [DC]: { consigne: { etat: 'progression', zone: 'lourd', palier: 100, n: 3, ligne: { charge: 100, vise: 5 }, haut: null }, contexte: { cran: 102.5, haut: null } } },
    reglage: 'normal', paris: [], objectif: 'les_deux', catalogue: FICHES,
    semaineDeTest: { debut: '2026-11-02', fin: '2026-11-08', modes: {}, mesures: {}, refus: {}, maxEstimes: { [DC]: 154 } }
  }, extra || {});
  const depart = (extra) => {
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, DC, id, { series: 3 });
    se = S.ajouterExercice(se, 'curl', id, { series: 3 });
    se.exercices.forEach((ex) => ex.series.forEach((s) => { s.reps_visees = 5; }));
    return { se, extra };
  };
  const poserLesLignes = (se, extra) => {
    const t = T.planDeSeance(entrees(se, extra)).exercices[0].semaineDeTest;
    const lignes = t.ajout.lignes.map((l) => Object.assign([l.charge, l.reps], { test: true, type: l.type, reserve: l.reserve }));
    return { t, se: S.insererChauffes(se, 0, lignes, id) };
  };

  [['max', {}], ['serie', { debutant: true }]].forEach(([mode, extra]) => {
    test('mode ' + mode + ' : après « Ajouter ces lignes », aucune phrase « Chauffes calées sur … », aucune chauffe fantôme, aucune proposition', () => {
      const d = depart(extra);
      const avant = poserLesLignes(d.se, extra);
      expect(avant.t.mode).toBe(mode);
      const e = entrees(avant.se, extra);
      const p = T.planDeSeance(e);
      const x = p.exercices[0];
      const montee = x.lignes.filter((l) => l.type === 'echauffement');
      expect(montee.length).toBe(5);
      montee.forEach((l) => { expect(l.chauffe).toBeUndefined(); expect(l.fantome).toBeUndefined(); });
      expect(x.chauffes).toBeNull();
      expect(x.proposition).toBeNull();
      expect(x.phrases.map((q) => sp(q.texte)).join(' ')).not.toMatch(/Chauffes calées/);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });

  test('des chauffes qui ne sont pas de la semaine de mesure restent calées comme avant', () => {
    const d = depart({});
    let se = S.insererChauffes(d.se, 0, [[null, 5], [null, 3]], id);
    const e = entrees(se, {});
    const x = T.planDeSeance(e).exercices[0];
    expect(x.chauffes).not.toBeNull();
    expect(sp(x.chauffes.phrase)).toMatch(/^Chauffes calées sur 100 kg/);
  });

  test('4. le repos conseillé : essais, série de mesure, exercice non mesuré', () => {
    const lire = (extra) => {
      const d = depart(extra);
      const e = entrees(d.se, extra);
      const p = T.planDeSeance(e);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
      return p.exercices.map((x) => sp(x.reposConseille && x.reposConseille.pourquoi));
    };
    const [barreMax, curlMax] = lire({});
    expect(barreMax).toBe('Entre deux essais lourds, je conseille 4 min.');
    expect(curlMax).toBe('Semaine de mesure : je conseille 4 min entre les séries.');
    const [barreSerie, curlSerie] = lire({ debutant: true });
    expect(barreSerie).toBe('Série de mesure : je conseille 4 min entre les séries.');
    expect(barreSerie).not.toMatch(/essais/);
    [barreMax, curlMax, barreSerie, curlSerie].forEach((t) => expect(t).not.toMatch(/au max/i));   // « Au max » est interdit depuis I251 (20/11/2026)
    expect(curlSerie).toBe('Semaine de mesure : je conseille 4 min entre les séries.');
  });

  test('4. la règle pure : le mode vient de l\'appelant, la valeur ne change pas', () => {
    const phrase = (o) => Modele.capturer(() => M.phraseDuReposConseille({ r: M.reposConseilleDeBase(o), reps: 3, garde: 1, gardeDite: false })).texte;
    const base = { famille: 'grand', reps: 3, garde: 1, series: 3, test: true };
    expect(M.reposConseilleDeBase(Object.assign({}, base, { modeDeTest: 'serie' })).s).toBe(M.reposConseilleDeBase(Object.assign({}, base, { modeDeTest: 'max' })).s);
    expect(sp(phrase(Object.assign({}, base, { modeDeTest: 'max' })))).toBe('Entre deux essais lourds, je conseille 4 min.');
    expect(sp(phrase(Object.assign({}, base, { modeDeTest: 'serie' })))).toBe('Série de mesure : je conseille 4 min entre les séries.');
    expect(sp(phrase(base))).toBe('Semaine de mesure : je conseille 4 min entre les séries.');
    ['max', 'serie', null].forEach((m) => expect(sp(phrase(Object.assign({}, base, { modeDeTest: m })))).not.toMatch(/au max/i));
  });
});
