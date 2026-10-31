/** @jest-environment node */
// 196 — REST-PAUSE ET MUSCLE ÉTIRÉ (MOTEUR §9.33). Chaque fixture déclenche le chemin qu'elle nomme.
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const M = global.THModele || require('../../v2/js/modele.js');
const Mo = global.THMoteur;
const S = global.THSeance;

const iso = (slug, extra) => Object.assign({ slug, mesure: 'charge_reps', repos: 90, ch: 0, tr: 3, deg: 0, rec: 0, duree: null,
  prim: ['biceps'], sec: [], stab: [], equipement: 'haltere', groupe: null }, extra || {});
const barre = (slug) => ({ slug, mesure: 'charge_reps', repos: 180, ch: 2, tr: 4, deg: 0, rec: 0, duree: null,
  prim: ['pectoraux'], sec: ['triceps'], stab: ['deltoide_anterieur'], equipement: 'barre', groupe: null });

describe('peutRestPause', () => {
  test('isolation, machine, poulie : oui ; barre, soulevé, durée : non', () => {
    expect(Mo.peutRestPause({ prim: ['biceps'], sec: [], stab: [], equipement: 'haltere', slug: 'curl' })).toBe(true);
    expect(Mo.peutRestPause({ prim: ['quadriceps', 'fessiers'], sec: ['a'], stab: ['b'], equipement: 'machine', slug: 'presse' })).toBe(true);
    expect(Mo.peutRestPause({ prim: ['biceps'], sec: [], stab: [], equipement: 'barre', slug: 'curl_barre' })).toBe(false);
    expect(Mo.peutRestPause({ prim: ['dos'], sec: [], stab: [], equipement: 'machine', slug: 'souleve_de_terre_machine' })).toBe(false);
    expect(Mo.peutRestPause({ prim: ['biceps'], sec: [], stab: [], equipement: 'machine', mesure: 'temps', slug: 'x' })).toBe(false);
  });
});

describe('restPauseDe', () => {
  const t = (c, r) => ({ type_serie: 'travail', charge_kg: c, reps: r });
  const d = (c, r, plus) => Object.assign({ type_serie: 'degressive', charge_kg: c, reps: r }, plus || {});
  test('dégressives à la même charge : tête + mini-séries, reps cumulées', () => {
    const rp = M.restPauseDe([t(20, 12), d(20, 5), d(20, 3)]);
    expect(rp[0]).toEqual({ role: 'tete', cumul: 20, parties: 3 });
    expect(rp[1].role).toBe('mini'); expect(rp[2].role).toBe('mini');
  });
  test('une dégressive à charge plus basse n\'est pas un rest-pause', () => {
    expect(M.restPauseDe([t(20, 12), d(15, 8)])).toEqual([null, null]);
  });
  test('une mini-série marquée sans charge encore en est une', () => {
    expect(M.restPauseDe([t(20, 12), d(null, null, { rest_pause: true })])[1].role).toBe('mini');
  });
  test('le rest-pause compte pour UNE série de travail', () => {
    const series = [t(20, 12), d(20, 5), d(20, 3)];
    expect(series.filter(M.estTravail).length).toBe(1);
  });
});

describe('ajouterRestPause', () => {
  const seance = (charge) => ({ exercices: [{ exercise_slug: 'curl', series: [
    { id: 'a', type_serie: 'travail', charge_kg: charge, reps: 12, validee_a: '2026-10-31T10:00:00Z' }] }] });
  test('deux mini-séries à la même charge, juste après', () => {
    let n = 0;
    const r = S.ajouterRestPause(seance(20), 0, 0, () => 'id' + (++n));
    const ss = r.exercices[0].series;
    expect(ss.length).toBe(3);
    expect(ss.slice(1).map(x => [x.type_serie, x.charge_kg, x.rest_pause])).toEqual([['degressive', 20, true], ['degressive', 20, true]]);
    expect(M.restPauseDe(ss)[0].role).toBe('tete');
  });
  test('sans charge, rien', () => {
    const s = seance(null);
    expect(S.ajouterRestPause(s, 0, 0, () => 'x')).toBe(s);
  });
});

describe('« J\'ai peu de temps » en objectif Muscle', () => {
  const structure = [barre('developpe'), iso('curl'), iso('triceps', { prim: ['triceps'] })];
  test('une isolation passe de 3 à 2 séries, la dernière en rest-pause, avant toute autre coupe', () => {
    const complet = Mo.dureeEstimee(structure);
    const r = Mo.raccourcirRoutine(structure, Math.floor(complet / 60) - 2, [], { objectif: 'muscle' });
    expect(r.journal[0].quoi).toBe('rest_pause');
    const i = r.journal[0].i;
    expect(r.exercices[i].tr).toBe(2); expect(r.exercices[i].rp).toBe(1);
    expect(r.journal.filter(j => j.quoi === 'rest_pause').length).toBe(1);
    expect(r.exercices[0].tr).toBe(4);   // la barre n'est jamais touchée
  });
  test('un autre objectif, ou sans options : aucun rest-pause', () => {
    const cible = Math.floor(Mo.dureeEstimee(structure) / 60) - 2;
    expect(Mo.raccourcirRoutine(structure, cible, [], { objectif: 'force' }).journal.some(j => j.quoi === 'rest_pause')).toBe(false);
    expect(Mo.raccourcirRoutine(structure, cible).journal.some(j => j.quoi === 'rest_pause')).toBe(false);
  });
  test('un exercice exempté (zone à ménager) n\'y passe pas', () => {
    const r = Mo.raccourcirRoutine([iso('curl')], 1, ['curl'], { objectif: 'muscle' });
    expect(r.journal.some(j => j.quoi === 'rest_pause')).toBe(false);
  });
  test('appliquerRaccourci pose les deux mini-séries marquées après la dernière série gardée', () => {
    const routine = { exercices: [{ id: 'e1', exercise_slug: 'curl', series: [
      { id: 1, type_serie: 'travail' }, { id: 2, type_serie: 'travail' }, { id: 3, type_serie: 'travail' }] }] };
    const resultat = { exercices: [iso('curl', { tr: 2, rp: 1 })], journal: [{ quoi: 'rest_pause', i: 0, slug: 'curl' }] };
    const out = Mo.appliquerRaccourci(routine, resultat).routine.exercices[0].series;
    expect(out.map(x => x.type_serie + (x.rest_pause ? '*' : ''))).toEqual(['travail', 'travail', 'degressive*', 'degressive*']);
  });
  test('la carte le dit, avec son pourquoi', () => {
    const cible = Math.floor(Mo.dureeEstimee(structure) / 60) - 2;
    const r = Mo.raccourcirRoutine(structure, cible, [], { objectif: 'muscle' });
    const c = Mo.carteRaccourcir(structure, r, cible, s => s, false);
    expect(c.lignes.some(l => /rest-pause/.test(l))).toBe(true);
    expect(c.phrase).toMatch(/Enes 2021/);
  });
});

describe('accent_allonge', () => {
  test('la lecture', () => {
    expect(M.estAccentAllonge({ accent_allonge: true })).toBe(true);
    expect(M.estAccentAllonge({ accent_allonge: false })).toBe(false);
    expect(M.estAccentAllonge(undefined)).toBe(false);
  });
  test('l\'échange le propose en premier, à égalité', () => {
    const cat = { a_curl: { nom: 'Curl A' }, b_curl: { nom: 'Curl B', accent_allonge: true } };
    const l = S.exercicesProposes(['a_curl', 'b_curl'], cat, {}, [], null);
    expect(l.map(x => x.slug)).toEqual(['b_curl', 'a_curl']);
  });
  test('l\'historique reste plus fort', () => {
    const cat = { a_curl: { nom: 'Curl A' }, b_curl: { nom: 'Curl B', accent_allonge: true } };
    const l = S.exercicesProposes(['a_curl', 'b_curl'], cat, { a_curl: { date: '2026-10-01' } }, [], null);
    expect(l[0].slug).toBe('a_curl');
  });
});


describe('I105 / I106', () => {
  require('../../v2/js/plan.js');
  const P = global.THPlan;
  const plan = (mini) => ({ exercices: [{ slug: 'curl', lignes: [
    { iSerie: 0, type: 'travail', validee: true, faite: { charge: 20 }, role: 'haut' }, mini] }] });
  const run = (mini) => { const e = []; P.verifierRestPause(plan(mini), e); return e; };
  test('une mini-série à la charge de sa série, hors couverture : aucune faute', () => {
    expect(run({ iSerie: 1, type: 'degressive', restPause: true, role: 'hors', fantome: { charge: 20, reps: null, source: 'rest_pause' } })).toEqual([]);
  });
  test('I105 : une baisse de charge est refusée', () => {
    expect(run({ iSerie: 1, type: 'degressive', restPause: true, role: 'hors', fantome: { charge: 15.5, reps: null, source: 'degressive' } })
      .some(f => /^I105/.test(f))).toBe(true);
  });
  test('I106 : une mini-série couverte par la consigne est refusée', () => {
    expect(run({ iSerie: 1, type: 'degressive', restPause: true, role: 'haut' }).some(f => /^I106/.test(f))).toBe(true);
  });
});
