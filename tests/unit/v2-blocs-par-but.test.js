//
// 26/11/2026 — D1 : LE BLOC SUIVANT LIT LE BUT (décision du fondateur ; MOTEUR §19.2, delta du 26/11/2026).
//
//   · Muscle → Mix ⇄ Hypertrophie, jamais Lourd par défaut ; la grosse série COCHÉE dans un bloc Hypertrophie proposé ;
//   · Forme → Mix ; Force et Les deux → inchangé (Mix/Hypertrophie → Lourd → Mix) ; sans réponse → Lourd, dit sans comparaison ;
//   · Lourd reste au menu (`zonesDeBloc`), un bloc Lourd en cours passe à Mix ;
//   · « comme le font les programmes de force » ne s'écrit plus qu'à Force et Les deux.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');

const bloc = (zone, extra) => Object.assign({ id: 'b1', dossier: 'Haut', zone, debut: '2026-11-02', semaines: 4, decharge: true,
  exercices: ['squat_barre'], statut: 'en_cours', grosse_serie: false }, extra || {});
const BILAN = { exercices: {}, paris: 0, tenus: 0 };
const carte = (b, objectif) => M.carteFinDeBloc(b, BILAN, {}, null, false, objectif);
const chaine = (objectif, depart, n) => {
  const zones = []; let b = bloc(depart);
  for (let i = 0; i < n; i++) { const s = M.blocSuivant(b, false, objectif); zones.push(s.zone); b = bloc(s.zone); }
  return zones;
};

describe('D1 — la chaîne des blocs suit le but', () => {
  test('Muscle : Mix ⇄ Hypertrophie, jamais Lourd', () => {
    expect(chaine('muscle', 'mix', 6)).toEqual(['hypertrophie', 'mix', 'hypertrophie', 'mix', 'hypertrophie', 'mix']);
    expect(chaine('muscle', 'hypertrophie', 4)).toEqual(['mix', 'hypertrophie', 'mix', 'hypertrophie']);
  });
  test('Muscle : un bloc Lourd en cours passe à Mix', () => {
    expect(M.blocSuivant(bloc('lourd'), false, 'muscle').zone).toBe('mix');
  });
  test('Forme : Mix', () => {
    ['mix', 'lourd', 'hypertrophie'].forEach((z) => expect(M.blocSuivant(bloc(z), false, 'forme').zone).toBe('mix'));
    expect(chaine('forme', 'mix', 4)).toEqual(['mix', 'mix', 'mix', 'mix']);
  });
  test('Force et Les deux : inchangé (Mix/Hypertrophie → Lourd → Mix)', () => {
    ['force', 'les_deux'].forEach((o) => {
      expect(chaine(o, 'mix', 4)).toEqual(['lourd', 'mix', 'lourd', 'mix']);
      expect(M.blocSuivant(bloc('hypertrophie'), false, o).zone).toBe('lourd');
      expect(M.blocSuivant(bloc('lourd'), false, o).zone).toBe('mix');
    });
  });
  test('sans réponse (et calisthénie) : le coach garde Lourd', () => {
    [undefined, null, '', 'calisthenie'].forEach((o) => {
      expect(chaine(o, 'mix', 4)).toEqual(['lourd', 'mix', 'lourd', 'mix']);
    });
  });
  test('une phase ne change pas, quel que soit le but', () => {
    ['muscle', 'forme', 'force', null].forEach((o) => {
      const s = M.blocSuivant(bloc('mix'), true, o);
      expect(s.zone).toBe('mix'); expect(s.sansZones).toBe(true); expect(s.grosse).toBeUndefined();
    });
  });
  test('la durée, la décharge et les exercices se gardent', () => {
    const s = M.blocSuivant(bloc('mix', { semaines: 5, exercices: ['a', 'b'] }), false, 'muscle');
    expect([s.semaines, s.decharge, s.exercices]).toEqual([5, true, ['a', 'b']]);
  });
  test('Lourd reste toujours au menu (I37), Hypertrophie seulement en Muscle et Les deux', () => {
    ['force', 'muscle', 'les_deux', 'forme', null].forEach((o) => expect(M.zonesDeBloc(o)).toContain('lourd'));
    expect(M.zonesDeBloc('muscle')).toContain('hypertrophie');
    expect(M.zonesDeBloc('forme')).not.toContain('hypertrophie');
  });
});

describe('D1 — la grosse série, cochée par défaut dans un bloc Hypertrophie proposé en Muscle', () => {
  test('Muscle, après Mix : Hypertrophie avec grosse = true ; ailleurs, aucune coche', () => {
    expect(M.blocSuivant(bloc('mix'), false, 'muscle').grosse).toBe(true);
    expect(M.blocSuivant(bloc('hypertrophie'), false, 'muscle').grosse).toBeUndefined();   // le suivant est Mix
    ['forme', 'force', 'les_deux', null].forEach((o) => expect(M.blocSuivant(bloc('mix'), false, o).grosse).toBeUndefined());
  });
  test('la coche donne une série lourde à la structure du squat, décochée elle la retire', () => {
    const famille = 'squat_barre';
    const fam = (M.structureDeBloc({ zone: 'hypertrophie', grosse_serie: true }, famille));
    expect(fam.grosse).toBe(true);
    expect(M.structureDeBloc({ zone: 'hypertrophie', grosse_serie: false }, famille).grosse).toBe(false);
  });
});

describe('D1 — la carte de fin de bloc', () => {
  test('Muscle : « Le suivant\u00a0: Mix (6-8)… » puis « Hypertrophie (8-10)… », sans comparaison', () => {
    const a = carte(bloc('hypertrophie'), 'muscle');
    expect(a.suivant).toBe('Le suivant\u00a0: Mix (6-8) sur tes mouvements à la barre, 4 semaines, décharge la dernière semaine. Les autres exercices gardent leur zone.');
    expect(a.commencer).toBe('Commencer le bloc Mix');
    const b = carte(bloc('mix'), 'muscle');
    expect(b.suivant).toBe('Le suivant\u00a0: Hypertrophie (8-10) sur tes mouvements à la barre, 4 semaines, décharge la dernière semaine. Les autres exercices gardent leur zone.');
    expect(b.commencer).toBe('Commencer le bloc Hypertrophie');
    expect(b.suivantZone).toBe('Hypertrophie (8-10)');
  });
  test('Forme : Mix, sans comparaison', () => {
    const k = carte(bloc('mix'), 'forme');
    expect(k.suivant).toMatch(/^Le suivant\u00a0: Mix \(6-8\) sur tes mouvements/);
    expect(k.commencer).toBe('Commencer le bloc Mix');
  });
  test('Force et Les deux : la phrase d’avant, mot pour mot', () => {
    ['force', 'les_deux'].forEach((o) => {
      const k = carte(bloc('hypertrophie', { grosse_serie: true }), o);
      expect(k.suivant).toBe('Le suivant, comme le font les programmes de force\u00a0: Lourd (3-5) sur tes mouvements à la barre, 4 semaines, décharge la dernière semaine. Les autres exercices gardent leur zone.');
      expect(k.commencer).toBe('Commencer le bloc Lourd');
    });
  });
  test('sans réponse : Lourd, dit en un fait, sans comparaison ni but deviné', () => {
    [undefined, null].forEach((o) => {
      const k = carte(bloc('mix'), o);
      expect(k.suivant).toBe('Le suivant\u00a0: Lourd (3-5) sur tes mouvements à la barre, 4 semaines, décharge la dernière semaine. Les autres exercices gardent leur zone.');
      expect(k.commencer).toBe('Commencer le bloc Lourd');
      expect(JSON.stringify(k)).not.toMatch(/programmes de force|assidu|séances de suite|absence/);
    });
  });
  test('une phase garde sa phrase, quel que soit le but', () => {
    const k = M.carteFinDeBloc(bloc('mix'), BILAN, {}, null, true, 'muscle');
    expect(k.suivant).toMatch(/^La suivante\u00a0: /);
  });
});
