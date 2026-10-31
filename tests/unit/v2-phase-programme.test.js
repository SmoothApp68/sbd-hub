/** @jest-environment node */
//
// 193-2 (commit 3) — LA PHASE : le programme construit de Force / Les deux est un bloc de 5 semaines (la dernière allégée) SANS zone de
// bloc. Reconnue par les lignes à zone du jour des routines du dossier (aucune colonne), dite « Phase » (jamais « Bloc Lourd »), et
// recommencée d'un geste (jamais en alternant Mix ↔ Lourd).
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const bloc = (o) => Object.assign({ id: 'b1', dossier: 'Mon programme', zone: 'lourd', debut: '2026-11-02', semaines: 5, decharge: true,
  exercices: ['squat_barre', 'developpe_couche_barre'], statut: 'en_cours' }, o || {});
const rt = (dossier, lignes) => ({ dossier, exercices: lignes.map(([slug, zone]) => ({ exercise_slug: slug, zone })) });
const PHASE = [rt('Mon programme', [['squat_barre', 'lourd'], ['leg_curl_assis', null]]),
  rt('Mon programme', [['developpe_couche_barre', 'lourd'], ['squat_barre', 'hypertrophie']])];

describe('blocAPhases — pure, sans colonne', () => {
  test('chaque exercice du bloc a une ligne à zone dans une routine du dossier : une phase', () => {
    expect(M.blocAPhases(bloc(), PHASE)).toBe(true);
  });
  test('un exercice du bloc sans ligne à zone (Automatique) : un bloc classique', () => {
    expect(M.blocAPhases(bloc(), [rt('Mon programme', [['squat_barre', 'lourd'], ['developpe_couche_barre', null]])])).toBe(false);
  });
  test('les routines d’un AUTRE dossier ne comptent pas', () => {
    expect(M.blocAPhases(bloc(), [rt('Autre', [['squat_barre', 'lourd'], ['developpe_couche_barre', 'lourd']])])).toBe(false);
  });
  test('une zone inconnue n’en est pas une ; entrées vides ou absentes : faux, sans erreur', () => {
    expect(M.blocAPhases(bloc({ exercices: ['squat_barre'] }), [rt('Mon programme', [['squat_barre', 'zzz']])])).toBe(false);
    [null, undefined, {}, bloc({ exercices: [] })].forEach((b) => expect(M.blocAPhases(b, PHASE)).toBe(false));
    expect(M.blocAPhases(bloc(), null)).toBe(false);
    expect(M.blocAPhases(bloc(), [null, { dossier: 'Mon programme' }])).toBe(false);
  });
  test('la constante : 5 semaines', () => { expect(M.SEMAINES_PHASE).toBe(5); });
});

describe('le badge d’une phase', () => {
  test('« Phase · semaine 2 sur 5 », jamais « Bloc Lourd »', () => {
    const b = M.badgeDuBloc(bloc(), '2026-11-10', true);
    expect(b).toMatch(/^Phase · semaine 2 sur 5$/);
    expect(b).not.toMatch(/Bloc|Lourd/);
  });
  test('avant le début, « Phase · dès le … » ; après la fin, « Phase terminée »', () => {
    expect(M.badgeDuBloc(bloc(), '2026-10-30', true)).toMatch(/^Phase · dès le /);
    expect(M.badgeDuBloc(bloc(), '2026-12-20', true)).toBe('Phase terminée');
  });
  test('sans le drapeau, le badge est celui d’avant (octet pour octet)', () => {
    expect(M.badgeDuBloc(bloc(), '2026-11-10')).toBe('Bloc Lourd · semaine 2 sur 5');
    expect(M.badgeDuBloc(bloc(), '2026-12-20')).toBe('Bloc Lourd terminé');
    expect(M.badgeDuBloc(bloc({ zone: 'mix', semaines: 4 }), '2026-11-10', false)).toBe('Bloc Mix · semaine 2 sur 4');
  });
});

describe('blocSuivant d’une phase', () => {
  test('la même phase : même zone placeholder, mêmes semaines, mêmes barres, décharge, sansZones — jamais Mix', () => {
    const s = M.blocSuivant(bloc(), true);
    expect(s).toEqual({ zone: 'lourd', semaines: 5, decharge: true, exercices: ['squat_barre', 'developpe_couche_barre'], sansZones: true });
  });
  test('un bloc classique : Mix ↔ Lourd comme avant, sans `sansZones`', () => {
    expect(M.blocSuivant(bloc({ zone: 'lourd', semaines: 4 }))).toEqual({ zone: 'mix', semaines: 4, decharge: true,
      exercices: ['squat_barre', 'developpe_couche_barre'] });
    expect(M.blocSuivant(bloc({ zone: 'mix', semaines: 4 }), false).zone).toBe('lourd');
  });
});

describe('la carte de fin d’une phase', () => {
  const bilan = { exercices: { squat_barre: { premiere: [100, 5], derniere: [105, 5], change: true } }, paris: 2, tenus: 1 };
  const carte = M.carteFinDeBloc(bloc(), bilan, { squat_barre: 'Squat' }, null, true);
  test('« Ta phase est terminée. », pas de zone en gras, pas d’« Ajuster », « Commencer une phase de 5 semaines »', () => {
    expect(carte.titre).toBe('Ta phase est terminée.');
    expect(carte.entete).toBe('Pendant cette phase');
    expect(carte.ajuster).toBeNull();
    expect(carte.suivantZone).toBeNull();
    expect(carte.commencer).toBe('Commencer une phase de 5 semaines');
    expect(carte.suivant).toMatch(/dernière allégée/);
    expect(carte.suivant).toMatch(/Tes zones restent celles de tes routines/);
    expect(carte.arreter).toBe('Arrêter le programme');
  });
  test('rien de « bloc », « Lourd » ou « Mix » dans les phrases de la phase', () => {
    const dit = [carte.titre, carte.entete, carte.paris, carte.suivant, carte.commencer].join(' | ');
    expect(dit).not.toMatch(/\bbloc\b|Lourd|Mix/i);
  });
  test('sans le drapeau, la carte est celle d’avant', () => {
    const c = M.carteFinDeBloc(bloc({ semaines: 4 }), bilan, { squat_barre: 'Squat' }, null);
    expect(c.titre).toBe('Ton bloc Lourd est terminé.');
    expect(c.ajuster).toBe('Ajuster le bloc');
    expect(c.commencer).toBe('Commencer le bloc Mix');
  });
});

describe('la semaine allégée d’une phase (MOTEUR §9.22) : la 5e semaine, sans lire de zone', () => {
  test('la décharge tombe du 30/11 au 06/12 pour une phase commencée le 02/11', () => {
    const d = M.dechargeDuJour([bloc()], '2026-11-30');
    expect(d).toMatchObject({ debut: '2026-11-30', fin: '2026-12-06', semaines: 5 });
    expect(M.dechargeDuJour([bloc()], '2026-11-29')).toBeNull();
    expect(M.dechargeDuJour([bloc()], '2026-12-07')).toBeNull();
  });
});
