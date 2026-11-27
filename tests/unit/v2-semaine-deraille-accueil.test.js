// 27/11/2026 (décision 77, améliorations 3 et 8 ; MOTEUR §9.24 et §9.27) — LA SEMAINE QUI DÉRAILLE SUR L'ACCUEIL, ET L'ORDRE DES VOIX.
// La question de la semaine qui déraille prend la place UNIQUE de « Le coach te dit », ce jour-là seulement ; la carte « Jours »
// attend ; I215 est amendé pour elle seule ; la réponse passe par le chemin de Saisie (app.js, une seule fonction). Chaque fixture
// déclenche vraiment le chemin qu'elle nomme (la carte « Jours » parle bien sans la semaine qui déraille).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
require('../../v2/js/routines.js');
require('../../v2/js/generateur.js');
require('../../v2/js/rendu.js');
const fs = require('fs');
const path = require('path');
const Eq = require('../../v2/js/equilibres.js');
const Rendu = window.THRendu;

const JOUR = '2026-10-28';
const fiche = (nom, prim) => ({ nom, muscles_primaires: prim, muscles_secondaires: [], muscles_stabilisateurs: [], schema_mouvement: null, mouvement: null, equipement: 'machine' });
const CAT = { leg_curl: fiche('Leg Curl Assis', ['ischio_jambiers']), oiseau: fiche('Oiseau', ['deltoide_posterieur']) };
const lundi = (k) => new Date(2026, 9, 19 - 7 * k);
const iso = (d, h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 10, 0, 0).toISOString();
function bati(semaines) {
  const seances = [], series = [];
  let c = 0;
  Object.keys(semaines).forEach((k) => semaines[k].forEach((s, j) => {
    const l = lundi(Number(k)), d = new Date(l.getFullYear(), l.getMonth(), l.getDate() + j);
    const id = 's' + (++c);
    seances.push({ id, debut: iso(d, 10 + j), fin: null, routine_id: s.routine, gestes: [] });
    Object.keys(s.exos).forEach((slug, r) => { for (let i = 0; i < s.exos[slug]; i++) series.push({ id: id + slug + i, session_id: id, exercise_slug: slug, type_serie: 'travail', reps: 8, charge_kg: 50, rang: r * 10 + i }); });
  }));
  return { seances, series };
}
const routine = (id, nom) => ({ id, nom, jours: null, exercices: [{ exercise_slug: 'leg_curl', rang: 0, series: Array.from({ length: 4 }, () => ({ type_serie: 'travail', reps_visees: 8 })) }] });
const R = (n) => Array.from({ length: n }, (_, i) => routine('r' + (i + 1), 'Séance ' + (i + 1)));
// 8 semaines de 2 jours sous un programme de 4 jours : la carte « Jours » parle.
const semaines = {};
for (let k = 0; k < 8; k++) semaines[k] = [0, 1].map((j) => ({ routine: 'r' + (j + 1), exos: { leg_curl: 4, oiseau: 2 } }));
const b = bati(semaines);
const entree = Object.assign({ jour: JOUR, reglage: 'normal', intention: 'progresser', catalogue: CAT, seances: b.seances, series: b.series,
  routines: R(4), priorites: [], programmeDuCoach: true, volume: null, ecartes: [], cartes: {} });
const analyse = () => Eq.analyser(entree);
const PRET = { routinesPretes: true };
// La carte ouverte de la semaine qui déraille, telle que `Deraille.semaineQuiDeraille` la rend (titre, phrase, choix, pourquoi).
const DERAILLE = { titre: 'Il reste Jambes à placer cette semaine.', phrase: null, pourquoi: 'Les charges ne changent pas.',
  choix: [{ cle: 'decaler', libelle: 'Jambes aujourd’hui · la suite se décale', avant: true }, { cle: 'garder', libelle: 'Garder la semaine' }],
  manquee: { routine: 'r2' } };
const JOUR_DERAILLE = Object.assign({}, PRET, { deraille: DERAILLE, derailleLeJour: true });

describe('l’ordre des voix de l’accueil (amélioration 8)', () => {
  test('la fixture : la carte « Jours » parle sans la semaine qui déraille, et passe d’abord des autres familles', () => {
    const r = Eq.carteDeLAccueil(analyse(), {}, JOUR, PRET);
    expect(r.carte.famille).toBe('jours');
    expect(r.voix).toBe('equilibres');
  });
  test('l’ordre est écrit : la semaine qui déraille, le point de semaine (réservé), « Jours », les autres', () => {
    expect(Eq.ORDRE_DES_VOIX).toEqual(['deraille', 'point', 'jours', 'autres']);
  });
  test('(a) le jour de la semaine qui déraille : SA question seule, et « Jours » attend (une voix sur les jours)', () => {
    const a = analyse();
    const r = Eq.carteDeLAccueil(a, {}, JOUR, JOUR_DERAILLE);
    expect(r.voix).toBe('deraille');
    expect(r.deraille).toBe(DERAILLE);
    expect(r.carte).toBeNull();
    expect(r.tete).toBe('Le coach te dit');
    expect(r.fait).toBe('Il reste Jambes à placer cette semaine.');
    expect(Eq.verifierCarteDeLAccueil(a, {}, JOUR, JOUR_DERAILLE, r)).toEqual([]);
  });
  test('la question répondue (plus de carte ouverte) : « Jours » attend ENCORE ce jour-là, une autre famille peut parler', () => {
    const a = analyse();
    const ctx = Object.assign({}, PRET, { deraille: null, derailleLeJour: true });
    const r = Eq.carteDeLAccueil(a, {}, JOUR, ctx);
    expect(r === null || r.carte.famille !== 'jours').toBe(true);
    expect(Eq.verifierCarteDeLAccueil(a, {}, JOUR, ctx, r)).toEqual([]);
    // Le lendemain (aucune voix sur la semaine) : « Jours » reparle.
    expect(Eq.carteDeLAccueil(a, {}, JOUR, PRET).carte.famille).toBe('jours');
  });
  test('la semaine qui déraille garde les silences de l’accueil (I214) : séance, routines, niveau, carnet, réponse du jour', () => {
    const a = analyse();
    expect(Eq.carteDeLAccueil(a, {}, JOUR, Object.assign({}, JOUR_DERAILLE, { enSeance: true }))).toBeNull();
    expect(Eq.carteDeLAccueil(a, {}, JOUR, Object.assign({}, JOUR_DERAILLE, { routinesPretes: false }))).toBeNull();
    expect(Eq.carteDeLAccueil(a, {}, JOUR, Object.assign({}, JOUR_DERAILLE, { niveauParle: true }))).toBeNull();
    expect(Eq.carteDeLAccueil(a, { temps: { r: 'non', le: JOUR, refus: 1 } }, JOUR, JOUR_DERAILLE)).toBeNull();
    const carnet = Eq.analyser(Object.assign({}, entree, { intention: 'entretien' }));
    expect(Eq.carteDeLAccueil(carnet, {}, JOUR, JOUR_DERAILLE)).toBeNull();
  });
  test('sans analyse des équilibres (peu de séances), la semaine qui déraille parle quand même', () => {
    const r = Eq.carteDeLAccueil(null, {}, JOUR, JOUR_DERAILLE);
    expect(r.voix).toBe('deraille');
    expect(Eq.verifierCarteDeLAccueil(null, {}, JOUR, JOUR_DERAILLE, r)).toEqual([]);
    expect(Eq.carteDeLAccueil(null, {}, JOUR, PRET)).toBeNull();
  });
  test('une carte sans titre ni choix n’est pas une voix', () => {
    expect(Eq.carteDeLAccueil(analyse(), {}, JOUR, Object.assign({}, PRET, { deraille: { titre: 'x', choix: [] } })).voix).toBe('equilibres');
  });
});

describe('I215 amendé : l’exception est la semaine qui déraille, et rien de plus', () => {
  const a = () => analyse();
  test('la relecture voit : une autre carte à sa place, « Jours » le jour de la semaine qui déraille, une copie de la carte, une carte en plus', () => {
    const jours = Eq.carteDeLAccueil(a(), {}, JOUR, PRET);
    // La semaine qui déraille était ouverte : montrer « Jours » est une faute (ordre des voix).
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, JOUR_DERAILLE, jours).some((f) => /passe d’abord/.test(f))).toBe(true);
    // Un jour où la question est répondue, « Jours » ne doit pas parler non plus.
    const ctx = Object.assign({}, PRET, { deraille: null, derailleLeJour: true });
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, ctx, jours).some((f) => /« Jours » parle le jour/.test(f))).toBe(true);
    // Une copie de la carte de la semaine qui déraille n'est pas « la carte que l'app a donnée ».
    const r = Eq.carteDeLAccueil(a(), {}, JOUR, JOUR_DERAILLE);
    const copie = Object.assign({}, r, { deraille: Object.assign({}, DERAILLE) });
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, JOUR_DERAILLE, copie).some((f) => /^I215/.test(f))).toBe(true);
    // Une voix qui porte AUSSI une carte des équilibres, ou une voix inconnue : I215.
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, JOUR_DERAILLE, Object.assign({}, r, { carte: jours.carte })).some((f) => /^I215/.test(f))).toBe(true);
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, PRET, Object.assign({}, jours, { voix: 'point' })).some((f) => /^I215/.test(f))).toBe(true);
    // Une carte qui n'est pas dans « Ton parcours » reste une faute I215 quand ce n'est PAS la semaine qui déraille.
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, PRET, Object.assign({}, jours, { carte: Object.assign({}, jours.carte) })).some((f) => /^I215/.test(f))).toBe(true);
  });
  test('la voix de la semaine qui déraille sans carte donnée par l’app est refusée', () => {
    const r = Eq.carteDeLAccueil(a(), {}, JOUR, JOUR_DERAILLE);
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, PRET, r).some((f) => /^I215/.test(f))).toBe(true);
  });
});

describe('le rendu de l’accueil et le chemin d’écriture', () => {
  test('la carte porte la question et ses choix ; un choix appelle `surChoixDeSemaine` avec la carte et sa clé (jamais une copie de la logique)', () => {
    const r = Eq.carteDeLAccueil(analyse(), {}, JOUR, JOUR_DERAILLE);
    const cible = document.createElement('div');
    const appels = [];
    Rendu.rendreCoachDeLAccueil(cible, { accueil: r, surChoixDeSemaine: (c, cle) => appels.push([c, cle]) });
    expect(cible.hidden).toBe(false);
    expect(cible.textContent).toMatch(/Il reste Jambes à placer cette semaine\./);
    const boutons = cible.querySelectorAll('[data-choix]');
    expect(boutons.length).toBe(2);
    boutons[0].click();
    expect(appels).toEqual([[DERAILLE, 'decaler']]);
  });
  test('app.js : Saisie et l’accueil écrivent par la MÊME fonction, et l’accueil lit la même carte que Saisie', () => {
    const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const corps = (nom) => { const i = app.indexOf('function ' + nom + '('); return app.slice(i, app.indexOf('\n  }\n', i)); };
    expect(corps('repondreALaSemaine')).toMatch(/Deraille\.lignesDuChoix/);
    expect((app.match(/Deraille\.lignesDuChoix/g) || []).length).toBe(1);               // aucune copie
    expect(app).toMatch(/vue\.surChoix = function \(cle\) \{ repondreALaSemaine\(carte, cle, jour\)/);
    expect(app).toMatch(/surChoixDeSemaine: function \(carte, cle\) \{\s*repondreALaSemaine\(carte, cle/);
    expect(corps('derailleDeLAccueil')).toMatch(/Deraille\.semaineQuiDeraille\(entreeDeLaSemaine\(jour\)\)/);
    expect(corps('contexteDeLAccueil')).toMatch(/deraille: d\.carte, derailleLeJour: d\.leJour/);
  });
});
