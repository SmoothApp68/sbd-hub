/** @jest-environment node */
//
// 188-1 — LES GESTES DE LA SÉANCE (`sessions.gestes`, v2_118), `profiles.cartes_semaine`, et les gestes de routine que les
// cartes d'équilibre proposent (ajouter un exercice, une série de plus, déplacer plus tôt).

process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
const R = require('../../v2/js/routines.js');
const S = require('../../v2/js/seance.js');

const base = () => S.creer({ id: 's1', userId: 'u', debut: '2026-10-28T10:00:00Z', titre: 'Haut A',
  routine: { id: 'r1', exercices: [{ exercise_slug: 'a', series: [{ type_serie: 'travail' }] }] }, idSerie: () => 'x' });

describe('les gestes de la séance', () => {
  test('une séance neuve n’a aucun geste, et la ligne envoyée porte toujours `gestes` (NOT NULL)', () => {
    const s = base();
    expect(s.gestes).toEqual([]);
    expect(S.ligneSession(s).gestes).toEqual([]);
    expect(S.COLONNES_SESSION).toContain('gestes');
    expect(S.ligneSession(Object.assign({}, s, { gestes: undefined })).gestes).toEqual([]);
  });
  test('la déclaration et la ligne s’accordent (la sonde de démarrage ne lève pas)', () => {
    expect(S.verifierColonnes()).toBe(true);
  });
  test('les cinq gestes s’écrivent, avec ce qu’ils savent', () => {
    let s = base();
    s = S.noterGeste(s, { geste: 'raccourci', retires: ['a', 'b'] });
    s = S.noterGeste(s, { geste: 'machine_prise', slug: 'a' });
    s = S.noterGeste(s, { geste: 'machine_prise', slug: 'a', vers: 'c' });
    s = S.noterGeste(s, { geste: 'remplacement', slug: 'a', vers: 'd' });
    s = S.noterGeste(s, { geste: 'ajout_serie', slug: 'a', n: 1 });
    s = S.noterGeste(s, { geste: 'retrait', slug: 'b' });
    expect(S.ligneSession(s).gestes).toEqual([
      { geste: 'raccourci', retires: ['a', 'b'] },
      { geste: 'machine_prise', slug: 'a' },
      { geste: 'machine_prise', slug: 'a', vers: 'c' },
      { geste: 'remplacement', slug: 'a', vers: 'd' },
      { geste: 'ajout_serie', slug: 'a', n: 1 },
      { geste: 'retrait', slug: 'b' }
    ]);
  });
  test('un geste mal formé ou inconnu ne s’écrit pas, et la séance d’origine n’est jamais modifiée', () => {
    const s = base();
    const t = S.noterGeste(s, { geste: 'inconnu', slug: 'a' });
    expect(t.gestes).toEqual([]);
    expect(S.noterGeste(s, { geste: 'remplacement', slug: 'a' }).gestes).toEqual([]);   // un remplacement sans remplaçant
    expect(S.noterGeste(s, { geste: 'retrait' }).gestes).toEqual([]);
    expect(S.noterGeste(s, null)).toBe(s);
    const u = S.noterGeste(s, { geste: 'retrait', slug: 'a' });
    expect(s.gestes).toEqual([]);
    expect(u.gestes).toHaveLength(1);
  });
  test('rouvrir une séance garde ses gestes ; une ligne d’un cache d’avant v2_118 en a zéro', () => {
    const ligne = { id: 's1', user_id: 'u', debut: '2026-10-28T10:00:00Z', fin: null, titre: 'x', routine_id: 'r1', statut: 'terminee',
      gestes: [{ geste: 'retrait', slug: 'a' }, { geste: 'bidon' }] };
    expect(S.reprendre(ligne, []).gestes).toEqual([{ geste: 'retrait', slug: 'a' }]);
    expect(S.reprendre(Object.assign({}, ligne, { gestes: undefined }), []).gestes).toEqual([]);
  });
  test('refaire une séance ne reprend pas les gestes de l’autre', () => {
    expect(S.refaire({ id: 'n', blocs: [] }).gestes).toEqual([]);
  });
});

describe('profiles.cartes_semaine', () => {
  test('lue, écrite, un objet seulement', () => {
    expect(Profil.CHAMPS_ECRITS).toContain('cartes_semaine');
    const v = { 'tp-horizontal': { r: 'non', le: '2026-10-28', refus: 1 } };
    expect(Profil.champsEcrits({ cartes_semaine: v })).toEqual({ cartes_semaine: v });
    expect(Profil.champsEcrits({ cartes_semaine: ['x'] })).toEqual({});
    expect(Profil.champsEcrits({ cartes_semaine: null })).toEqual({});
  });
  test('FACULTATIVE : la lecture et l’écriture du profil se passent d’elle si la base ne l’a pas', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/donnees.js'), 'utf8');
    expect(src).toMatch(/COLONNES_FACULTATIVES = \[[^\]]*'cartes_semaine'/);
    expect(src).toMatch(/'cartes_semaine'/);
  });
});

describe('les gestes de routine des cartes d’équilibre', () => {
  const ex = (slug, n, extra) => Object.assign({ id: 'e-' + slug, exercise_slug: slug, repos_cible_s: 120, groupe_superset: null, note: null,
    series: Array.from({ length: n }, (_, i) => ({ id: slug + i, type_serie: 'travail', reps: 8 })) }, extra);
  const routine = () => ({ id: 'r', nom: 'Haut A', exercices: [ex('a', 4), ex('b', 3), ex('c', 2), ex('d', 5)] });
  test('ajouter un exercice : en fin de routine, avec le nombre de séries donné (aucun nombre fixe)', () => {
    const r = routine();
    const v = R.ajoutDExercice(r, 'z', 7);
    expect(v.map((e) => e.exercise_slug)).toEqual(['a', 'b', 'c', 'd', 'z']);
    expect(v[4].series).toHaveLength(7);
    expect(v[4].series.every((s) => s.type_serie === 'travail' && s.id === null)).toBe(true);
    expect(R.ajoutDExercice(r, 'z', 1)[4].series).toHaveLength(1);
    expect(R.ajoutDExercice(r, 'z', 0)[4].series).toHaveLength(1);   // au moins une série
    expect(r.exercices).toHaveLength(4);                                // la routine d’origine n’a pas bougé
  });
  test('ajouter un exercice déjà là : rien (la routine a changé depuis la carte)', () => {
    expect(R.ajoutDExercice(routine(), 'b', 3)).toBeNull();
  });
  test('une série de plus : une copie de la dernière série de travail, juste après elle', () => {
    const r = routine();
    r.exercices[1].series.push({ id: 'ch', type_serie: 'degressive', reps: 12 });
    const v = R.ajoutDeSerie(r, 'b');
    const travail = v[1].series.filter((s) => s.type_serie === 'travail');
    expect(travail).toHaveLength(4);
    expect(v[1].series[3].id).toBeNull();
    expect(v[1].series[4].type_serie).toBe('degressive');
    expect(R.ajoutDeSerie(r, 'inconnu')).toBeNull();
    expect(r.exercices[1].series).toHaveLength(4);
  });
  test('déplacer plus tôt : le chemin existant de la mise en tête', () => {
    const v = R.miseEnTete(routine(), 'd', 'b');
    expect(v.map((e) => e.exercise_slug)).toEqual(['a', 'd', 'b', 'c']);
  });
});
