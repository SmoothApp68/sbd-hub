/** @jest-environment node */
// 195-2 — L'OBJECTIF CALISTHÉNIE ET LE DÉPART EN QUATRE CHIFFRES (v2_125).
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
const Profil = require('../../v2/js/profil.js');
const G = require('../../v2/js/generateur.js');
require('../../v2/js/moteur.js');
const Q = require('../../v2/js/questionnaire.js');

describe('195-2 — la table de départ (maquette du 31/10)', () => {
  const d = (o) => G.departDeCalisthenie(o);
  test.each([
    [0, ['traction_negative', 'rowing_inverse']], [1, ['tractions', 'traction_negative']], [4, ['tractions', 'traction_negative']],
    [5, ['tractions']], [11, ['tractions']], [12, ['tractions_leste']], [30, ['tractions_leste']], [null, ['traction_negative', 'rowing_inverse']]
  ])('tractions %s', (n, att) => expect(d({ tractions: n }).tractions).toEqual(att));
  test.each([
    [0, ['pompes_inclinees']], [4, ['pompes_inclinees']], [5, ['pompes_genoux']], [14, ['pompes_genoux']],
    [15, ['pompes']], [29, ['pompes']], [30, ['pompes_declinees']], [null, ['pompes_genoux']]
  ])('pompes %s', (n, att) => expect(d({ pompes: n }).pompes).toEqual(att));
  test.each([
    [0, ['dips_negatif']], [1, ['dips_torse']], [7, ['dips_torse']], [8, ['dips_torse']], [14, ['dips_torse']],
    [15, ['dips_torse_lestes']], [null, ['dips_negatif']]
  ])('dips %s', (n, att) => expect(d({ dips: n }).dips).toEqual(att));
  test('pistol : oui -> pistol, non ou inconnu -> squat bulgare (jamais une habileté deviné)', () => {
    expect(d({ pistol: true }).jambes).toEqual(['pistol_squat']);
    expect(d({ pistol: false }).jambes).toEqual(['split_squat_bulgare_poids_du_corps']);
    expect(d({}).jambes).toEqual(['split_squat_bulgare_poids_du_corps']);
  });
  test('rien de dit : quatre marches prudentes', () => {
    expect(d(null)).toEqual({ tractions: ['traction_negative', 'rowing_inverse'], pompes: ['pompes_genoux'], dips: ['dips_negatif'],
      jambes: ['split_squat_bulgare_poids_du_corps'] });
  });
});

describe('195-2 — l\'objectif calisthénie est une valeur partout', () => {
  test('la liste du profil, le gel de la séance', () => {
    expect(Profil.objectifDe({ objectif: 'calisthenie' })).toBe('calisthenie');
    expect(Profil.preparerChamps({}, { objectif: 'calisthenie' }).objectif).toBe('calisthenie');
    expect(Profil.preparerChamps({}, { objectif: 'inconnu' }).objectif).toBeUndefined();
  });
});

describe('195-2 — l\'écran « Où tu en es »', () => {
  test('visible seulement en objectif calisthénie, juste après « Ton but »', () => {
    const base = { aDesSeances: false, historique: 'debutant' };
    expect(Q.ecransVisibles(base)).not.toContain('depart');
    expect(Q.ecransVisibles(Object.assign({ objectif: 'force' }, base))).not.toContain('depart');
    const v = Q.ecransVisibles(Object.assign({ objectif: 'calisthenie' }, base));
    expect(v.indexOf('depart')).toBe(v.indexOf('but') + 1);
  });
  test('« Continuer » est actif sans réponse (tout est facultatif)', () => {
    expect(Q.ecranPret('depart', {})).toBe(true);
  });
  test('un chiffre tapé : 0 est une réponse, 101 tractions n\'en est pas une', () => {
    const lire = (cle, t) => Q.lireChamp(cle, t, (x) => (x === '' ? null : Number(x)), new Date());
    expect(lire('dep_tractions', '0')).toEqual({ valeur: 0, erreur: null });
    expect(lire('dep_pompes', '18')).toEqual({ valeur: 18, erreur: null });
    expect(lire('dep_tractions', '101').valeur).toBeNull();
    expect(lire('dep_dips', '').erreur).toBeNull();
  });
  test('il écrit `depart_calisthenie` avec le jour, une fois, et rien quand rien n\'est dit', () => {
    const maintenant = new Date('2026-11-02T10:00:00Z');
    const r = { dep_tractions: 3, dep_pompes: 18, dep_dips: 0, dep_pistol: false };
    const c = Q.champsDeLEcran('depart', r, {}, { maintenant }).champs;
    expect(c.depart_calisthenie).toEqual({ tractions: 3, pompes: 18, dips: 0, pistol: false, le: '2026-11-02' });
    // déjà écrit : rien
    expect(Q.champsDeLEcran('depart', r, { depart_calisthenie: c.depart_calisthenie }, { maintenant }).champs).toEqual({});
    // « Je ne sais pas » partout : rien n'est écrit
    expect(Q.champsDeLEcran('depart', { dep_tractions: null, dep_pompes: null, dep_dips: null, dep_pistol: null }, {}, { maintenant }).champs).toEqual({});
  });
  test('les réponses de départ sont ce que la base porte', () => {
    const rep = Q.reponsesInitiales({ depart_calisthenie: { tractions: 5, pompes: null, dips: 2, pistol: true, le: '2026-11-02' } }, {});
    expect([rep.dep_tractions, rep.dep_pompes, rep.dep_dips, rep.dep_pistol]).toEqual([5, null, 2, true]);
  });
  test('la vue montre les quatre marches de départ', () => {
    const v = Q.vueDe('depart', { rep: { objectif: 'calisthenie', dep_tractions: 0, dep_pompes: 18, dep_dips: 0, dep_pistol: false }, textes: {},
      catalogue: { pompes: { nom: 'Pompes' } }, visibles: Q.ecransVisibles({ objectif: 'calisthenie' }) });
    const f = v.blocs.filter((b) => b.type === 'faits')[0];
    expect(f.lignes.map((l) => l.libelle)).toEqual(['Tractions', 'Pompes', 'Dips', 'Jambes']);
    expect(f.lignes[1].valeur).toBe('Pompes');
  });
});

describe('195-2 — le récapitulatif', () => {
  const recap = (rep, ctx) => Q.vueDe('recap', { rep, aDesSeances: false, faits: null, visibles: Q.ecransVisibles(ctx) }).blocs[0].lignes;
  test('« Où tu en es » apparaît en calisthénie, juste après la phase, et se change d\'un tap', () => {
    const l = recap({ objectif: 'calisthenie', dep_tractions: 3, dep_pompes: 18, dep_dips: 0, dep_pistol: false },
      { aDesSeances: false, historique: 'debutant', objectif: 'calisthenie' });
    const i = l.findIndex((x) => x.libelle === 'Où tu en es');
    expect(l[i - 1].libelle).toBe('Phase');
    expect(l[i].ecran).toBe('depart');
    expect(l[i].valeur).toBe('3\u00a0tractions · 18\u00a0pompes · 0\u00a0dips · pistol : non');
  });
  test('rien de dit : un tiret ; hors calisthénie : pas de ligne', () => {
    const l = recap({ objectif: 'calisthenie' }, { aDesSeances: false, historique: 'debutant', objectif: 'calisthenie' });
    expect(l.filter((x) => x.libelle === 'Où tu en es')[0].valeur).toBe('—');
    expect(recap({ objectif: 'force' }, { aDesSeances: false, historique: 'debutant', objectif: 'force' }).map((x) => x.libelle)).not.toContain('Où tu en es');
  });
});

describe('195-2 — la colonne est bornée avant l\'envoi', () => {
  test('champsEcrits ne laisse partir qu\'un objet valide', () => {
    expect(Profil.champsEcrits({ depart_calisthenie: { tractions: 3, pompes: 999, dips: -1, pistol: 'oui', le: '2026-11-02' } }).depart_calisthenie)
      .toEqual({ tractions: 3, pompes: null, dips: null, pistol: null, le: '2026-11-02' });
    expect(Profil.champsEcrits({ depart_calisthenie: [1] })).toEqual({});
    expect(Profil.champsEcrits({ depart_calisthenie: { tractions: 'x' } })).toEqual({});
  });
});
