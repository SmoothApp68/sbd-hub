/** @jest-environment node */
//
// 60-4 — LES CINQ COLONNES DU PROGRAMME CONSTRUIT (`v2_066`, QUESTIONNAIRE-COACH-V2 §5 bis) et leurs bornes.
//
// Écrites, elles passent par la liste blanche `CHAMPS_ECRITS` et par `preparerChamps` (une seule préparation, pour
// le questionnaire, le Profil et les gestes de l'aperçu). Les bornes DOUBLENT les CHECK de la base : un 23514 est
// un refus définitif que le profil, qui n'a pas de file, reprendrait sans fin — tout l'envoi serait bloqué.
//
//   profiles_zones_a_menager_ok            zones_a_menager <@ {epaule, dos, genou, coude, hanche}
//   profiles_exercices_ecartes_ok          cardinality(exercices_ecartes) <= 200
//   profiles_programme_construit_dossier_ok  = btrim ET longueur 1 à 40 (la forme de routines_dossier_ok)

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');
const Generateur = require('../../v2/js/generateur.js');

const MAINTENANT = new Date('2026-10-08T10:00:00.000Z');
const prep = (profil, entrees) => Profil.preparerChamps(profil, entrees, MAINTENANT);

describe('60-4 — la liste blanche et les colonnes', () => {
  test('les cinq colonnes sont écrites, et elles seules en plus de 60-3', () => {
    ['zones_a_menager', 'exercices_ecartes', 'programme_construit_dossier', 'programme_construit_le', 'carte_cycles_le']
      .forEach((c) => expect(Profil.CHAMPS_ECRITS).toContain(c));
    expect(Profil.champsEcrits({ exercices_ecartes: ['a'], is_admin: true, tier: 'x' })).toEqual({ exercices_ecartes: ['a'] });
  });

  test('les zones à ménager sont les cinq du CHECK ET celles que le générateur charge', () => {
    expect(Profil.ZONES_A_MENAGER.map((z) => z.cle)).toEqual(['epaule', 'dos', 'genou', 'coude', 'hanche']);
    expect(Profil.ZONES_A_MENAGER.map((z) => z.cle).sort()).toEqual(Object.keys(Generateur.CHARGE_ZONE).sort());
    expect(Profil.ZONES_A_MENAGER.map((z) => z.libelle)).toEqual(['Épaule', 'Dos', 'Genou', 'Coude', 'Hanche']);
  });

  test('« Construis-le-moi » est un programme du profil (le CHECK programme_choix le permet)', () => {
    expect(Profil.PROGRAMMES.map((p) => p.cle)).toEqual(['deduit', 'moi', 'construis']);
    expect(Profil.preparerChamps({}, { programme_choix: 'construis' }, MAINTENANT)).toEqual({ programme_choix: 'construis' });
  });
});

describe('60-4 — zones_a_menager', () => {
  test('connues seulement, sans doublon, dans l’ordre de la liste ; ce qui n’est pas une liste n’en est pas une', () => {
    expect(Profil.zonesAMenagerValides(['hanche', 'dos', 'dos', 'nuque', 42, null])).toEqual(['dos', 'hanche']);
    expect(Profil.zonesAMenagerValides([])).toEqual([]);
    ['dos', null, undefined, {}, 3].forEach((v) => expect(Profil.zonesAMenagerValides(v)).toBeNull());
  });

  test('un geste : on ajoute, on retire, « aucune » les retire toutes, une zone inconnue est sans effet', () => {
    expect(Profil.basculerZone([], 'genou')).toEqual(['genou']);
    expect(Profil.basculerZone(['genou'], 'dos')).toEqual(['dos', 'genou']);
    expect(Profil.basculerZone(['dos', 'genou'], 'dos')).toEqual(['genou']);
    expect(Profil.basculerZone(['dos', 'genou'], 'aucune')).toEqual([]);
    expect(Profil.basculerZone(['dos'], 'nuque')).toEqual(['dos']);
    expect(Profil.basculerZone(null, 'coude')).toEqual(['coude']);
    expect(Profil.basculerZone(undefined, 'aucune')).toEqual([]);
  });

  test('⚠️ le vide s’écrit NULL ; NULL et [] se valent (aucune écriture pour rien)', () => {
    expect(prep({}, { zones_a_menager: ['genou', 'dos'] })).toEqual({ zones_a_menager: ['dos', 'genou'] });
    expect(prep({ zones_a_menager: ['dos'] }, { zones_a_menager: [] })).toEqual({ zones_a_menager: null });
    expect(prep({ zones_a_menager: null }, { zones_a_menager: [] })).toEqual({});
    expect(prep({ zones_a_menager: [] }, { zones_a_menager: [] })).toEqual({});
    expect(prep({}, { zones_a_menager: [] })).toEqual({});
  });

  test('inchangé : rien ; hors liste : ne part pas (un 23514 retenterait le profil entier sans fin)', () => {
    expect(prep({ zones_a_menager: ['dos', 'genou'] }, { zones_a_menager: ['genou', 'dos'] })).toEqual({});
    expect(prep({}, { zones_a_menager: ['nuque'] })).toEqual({});
    expect(prep({}, { zones_a_menager: ['nuque', 'coude'] })).toEqual({ zones_a_menager: ['coude'] });
    expect(prep({}, { zones_a_menager: 'dos' })).toEqual({});
    expect(prep({}, { zones_a_menager: null })).toEqual({});
  });
});

describe('60-4 — exercices_ecartes', () => {
  test('des slugs, sans doublon, dans l’ordre où on les a écartés', () => {
    expect(Profil.ecartesValides(['squat_barre', 'tractions', 'squat_barre', '', ' x', 7, null])).toEqual(['squat_barre', 'tractions']);
    expect(Profil.ecartesValides([])).toEqual([]);
    ['squat_barre', null, {}].forEach((v) => expect(Profil.ecartesValides(v)).toBeNull());
  });

  test('⚠️ deux cents au plus (le CHECK) : au-delà, les plus anciens s’effacent — jamais un 23514', () => {
    const trois = []; for (let i = 0; i < 203; i++) trois.push('ex_' + i);
    const v = Profil.ecartesValides(trois);
    expect(v).toHaveLength(200);
    expect(v[0]).toBe('ex_3');
    expect(v[199]).toBe('ex_202');
    expect(prep({}, { exercices_ecartes: trois }).exercices_ecartes).toHaveLength(200);
  });

  test('le vide s’écrit NULL ; « Reprendre » le dernier écrit NULL ; inchangé : rien', () => {
    expect(prep({}, { exercices_ecartes: ['a', 'b'] })).toEqual({ exercices_ecartes: ['a', 'b'] });
    expect(prep({ exercices_ecartes: ['a'] }, { exercices_ecartes: [] })).toEqual({ exercices_ecartes: null });
    expect(prep({ exercices_ecartes: ['a', 'b'] }, { exercices_ecartes: ['a', 'b'] })).toEqual({});
    expect(prep({ exercices_ecartes: null }, { exercices_ecartes: [] })).toEqual({});
    expect(prep({}, { exercices_ecartes: 'a' })).toEqual({});
  });
});

describe('60-4 — programme_construit_dossier : la borne de routines.dossier', () => {
  test('1 à 40 caractères, sans espace autour ; il ne se tronque JAMAIS (le nom réel d’un dossier, un nom coupé ne désigne plus rien)', () => {
    expect(Profil.DOSSIER_PROGRAMME_MAX).toBe(40);
    expect(Profil.dossierDuProgrammeValide('Mon programme')).toBe('Mon programme');
    expect(Profil.dossierDuProgrammeValide('x'.repeat(40))).toBe('x'.repeat(40));
    [' Mon programme', 'Mon programme ', '', 'x'.repeat(41), null, undefined, 3, {}].forEach((v) => {
      expect([v, Profil.dossierDuProgrammeValide(v)]).toEqual([v, null]);
    });
  });

  test('s’écrit tel quel s’il est valide et change ; sinon ne part pas', () => {
    expect(prep({}, { programme_construit_dossier: 'Mon programme (2)' })).toEqual({ programme_construit_dossier: 'Mon programme (2)' });
    expect(prep({ programme_construit_dossier: 'Mon programme' }, { programme_construit_dossier: 'Mon programme' })).toEqual({});
    expect(prep({}, { programme_construit_dossier: 'x'.repeat(41) })).toEqual({});
    expect(prep({}, { programme_construit_dossier: ' Mon programme ' })).toEqual({});
  });
});

describe('60-4 — programme_construit_le et carte_cycles_le : des instants', () => {
  test('une date lisible s’écrit en ISO ; une illisible ne part pas', () => {
    expect(prep({}, { programme_construit_le: MAINTENANT })).toEqual({ programme_construit_le: '2026-10-08T10:00:00.000Z' });
    expect(prep({}, { carte_cycles_le: '2026-10-29T08:00:00+02:00' })).toEqual({ carte_cycles_le: '2026-10-29T06:00:00.000Z' });
    expect(prep({}, { programme_construit_le: 'pas une date' })).toEqual({});
    expect(prep({}, { carte_cycles_le: 'x' })).toEqual({});
    expect(prep({}, { carte_cycles_le: null })).toEqual({});
  });

  test('les deux instants et le dossier s’écrivent ensemble, comme l’aperçu les pose', () => {
    expect(prep({}, { programme_construit_dossier: 'Mon programme', programme_construit_le: MAINTENANT }))
      .toEqual({ programme_construit_dossier: 'Mon programme', programme_construit_le: '2026-10-08T10:00:00.000Z' });
  });
});

describe('revue adverse — ecartesValides sans prototype', () => {
  test('« constructor », « toString », « __proto__ » sont des slugs comme les autres (ni refusés ni dédoublonnés à tort)', () => {
    const P = require('../../v2/js/profil.js');
    expect(P.ecartesValides(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'ok']))
      .toEqual(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'ok']);
    expect(P.ecartesValides(['constructor', 'constructor'])).toEqual(['constructor']);
  });
});
