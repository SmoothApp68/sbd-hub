/**
 * @jest-environment node
 */
// tests/unit/v2-semaine.test.js — vue hebdomadaire.
//
// Le fuseau est forcé AVANT tout usage de Date : sans ça, le test le plus
// important (une séance dont le jour UTC diffère du jour local) passerait
// trivialement sur un runner déjà en UTC, sans rien prouver.
process.env.TZ = 'Europe/Paris';

// PR 6 de la consolidation — la série de travail et son compte vivent dans
// `modele.js` et `semaine.js`, lus à l'appel par les autres modules.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Semaine = require('../../v2/js/semaine.js');

const jourDe = (d) => ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][d.getDay()];
const seance = (o) => Object.assign({ id: 'x', titre: 'Séance', debut: '2026-09-09T18:00:00Z' }, o);
const serie = (o) => Object.assign({
  id: 's', session_id: 'x', exercise_slug: 'dc', type_serie: 'travail'
}, o);

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé couché', muscles_primaires: ['pectoraux'],
    muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
  { slug: 'squat', nom: 'Squat', muscles_primaires: ['quadriceps'],
    muscles_secondaires: ['fessiers'] },
  // Une randonnée n'a aucun muscle au catalogue — vérifié en base : les 13
  // exercices sans muscle primaire sont exactement les activités sans charge.
  { slug: 'rando', nom: 'Randonnée', muscles_primaires: [], muscles_secondaires: [] },
  // Un gainage, lui, EN a : il doit continuer de compter.
  { slug: 'planche', nom: 'Planche', muscles_primaires: ['abdominaux'], muscles_secondaires: [] }
];

// ── 1. Bornes de semaine ────────────────────────────────────────────────────
describe('bornesSemaine — lundi au dimanche', () => {
  test('un mercredi donne le lundi et le dimanche qui l’encadrent', () => {
    const b = Semaine.bornesSemaine(new Date(2026, 8, 9));      // mer 9 sept 2026
    expect(jourDe(b.lundi)).toBe('lun');
    expect(b.lundi.getDate()).toBe(7);
    expect(jourDe(b.dimanche)).toBe('dim');
    expect(b.dimanche.getDate()).toBe(13);
  });

  test('le lundi lui-même est son propre début de semaine', () => {
    const b = Semaine.bornesSemaine(new Date(2026, 8, 7));      // lun 7 sept
    expect(b.lundi.getDate()).toBe(7);
    expect(b.dimanche.getDate()).toBe(13);
  });

  test('le dimanche appartient à la semaine qui l’a précédé, pas à la suivante', () => {
    const b = Semaine.bornesSemaine(new Date(2026, 8, 13));     // dim 13 sept
    expect(b.lundi.getDate()).toBe(7);
    expect(b.dimanche.getDate()).toBe(13);
  });

  test('passage d’année : le 1ᵉʳ janvier 2027 appartient à la semaine du 28 décembre 2026', () => {
    const b = Semaine.bornesSemaine(new Date(2027, 0, 1));      // ven 1er janv 2027
    expect(b.lundi.getFullYear()).toBe(2026);
    expect(b.lundi.getMonth()).toBe(11);
    expect(b.lundi.getDate()).toBe(28);
    expect(b.dimanche.getFullYear()).toBe(2027);
    expect(b.dimanche.getDate()).toBe(3);
  });

  test('la borne haute couvre la fin du dimanche, pas son début', () => {
    const b = Semaine.bornesSemaine(new Date(2026, 8, 9));
    expect(b.dimanche.getHours()).toBe(23);
    expect(b.dimanche.getMinutes()).toBe(59);
  });

  test('une date invalide ne lève pas', () => {
    expect(Semaine.bornesSemaine('pas une date')).toBeNull();
  });
});

// ── 4. Fuseau horaire — le test qui compte ──────────────────────────────────
describe('fuseau horaire — timestamptz lu en heure locale', () => {
  test('une séance du dimanche 23 h reste dans SA semaine', () => {
    // 21:00Z = dimanche 13 à 23 h à Paris. Elle ne doit pas basculer au lundi.
    const jours = Semaine.repartirParJour(
      [seance({ id: 'dim23', debut: '2026-09-13T21:00:00Z' })], new Date(2026, 8, 7));
    expect(jours[6].nom).toBe('Dimanche');
    expect(jours[6].seances.map(s => s.id)).toEqual(['dim23']);
  });

  test('lire en UTC au lieu du local rangerait cette séance au mauvais jour', () => {
    // 2026-09-13T23:00:00Z est DIMANCHE en UTC, mais LUNDI 14 à 1 h à Paris.
    // C'est l'heure locale qui correspond au vécu : la séance est du lundi.
    const d = new Date('2026-09-13T23:00:00Z');
    expect(d.getUTCDay()).toBe(0);   // dimanche en UTC
    expect(d.getDay()).toBe(1);      // lundi en local

    const semainePrecedente = Semaine.repartirParJour([seance({ id: 'nuit', debut: d.toISOString() })],
      new Date(2026, 8, 7));
    expect(semainePrecedente.every(j => j.seances.length === 0)).toBe(true);

    const semaineSuivante = Semaine.repartirParJour([seance({ id: 'nuit', debut: d.toISOString() })],
      new Date(2026, 8, 14));
    expect(semaineSuivante[0].nom).toBe('Lundi');
    expect(semaineSuivante[0].seances.map(s => s.id)).toEqual(['nuit']);
  });
});

// ── 2. Répartition sur sept jours ───────────────────────────────────────────
describe('repartirParJour — les jours vides sont des jours', () => {
  test('trois séances laissent quatre jours vides, et les sept jours sont rendus', () => {
    const jours = Semaine.repartirParJour([
      seance({ id: 'a', debut: '2026-09-07T10:00:00Z' }),   // lundi
      seance({ id: 'b', debut: '2026-09-09T10:00:00Z' }),   // mercredi
      seance({ id: 'c', debut: '2026-09-12T10:00:00Z' })    // samedi
    ], new Date(2026, 8, 7));

    expect(jours).toHaveLength(7);
    expect(jours.map(j => j.seances.length)).toEqual([1, 0, 1, 0, 0, 1, 0]);
    expect(jours.filter(j => !j.seances.length)).toHaveLength(4);
    expect(jours.map(j => j.nom)).toEqual(
      ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']);
  });

  test('une semaine entièrement vide rend quand même sept jours', () => {
    const jours = Semaine.repartirParJour([], new Date(2026, 8, 7));
    expect(jours).toHaveLength(7);
    expect(jours.every(j => j.seances.length === 0)).toBe(true);
  });

  test('les séances hors de la semaine ne rentrent pas', () => {
    const jours = Semaine.repartirParJour([
      seance({ id: 'avant', debut: '2026-09-06T10:00:00Z' }),  // dimanche précédent
      seance({ id: 'dedans', debut: '2026-09-09T10:00:00Z' }),
      seance({ id: 'apres', debut: '2026-09-14T10:00:00Z' })   // lundi suivant
    ], new Date(2026, 8, 7));
    const dedans = jours.reduce((n, j) => n + j.seances.length, 0);
    expect(dedans).toBe(1);
    expect(jours[2].seances[0].id).toBe('dedans');
  });

  test('deux séances le même jour sont rangées dans l’ordre horaire', () => {
    const jours = Semaine.repartirParJour([
      seance({ id: 'soir', debut: '2026-09-09T18:00:00Z' }),
      seance({ id: 'matin', debut: '2026-09-09T07:00:00Z' })
    ], new Date(2026, 8, 7));
    expect(jours[2].seances.map(s => s.id)).toEqual(['matin', 'soir']);
  });
});

// ── 3. Volume par muscle ────────────────────────────────────────────────────
describe('volumeParMuscle — 1 en primaire, 0,5 en secondaire', () => {
  test('la pondération est appliquée et le tri est décroissant', () => {
    const v = Semaine.volumeParMuscle([
      serie({ id: '1', exercise_slug: 'dc' }),
      serie({ id: '2', exercise_slug: 'dc' }),
      serie({ id: '3', exercise_slug: 'squat' })
    ], CATALOGUE);

    const par = Object.fromEntries(v.map(x => [x.muscle, x.series]));
    expect(par.pectoraux).toBe(2);              // 2 × primaire
    expect(par.triceps).toBe(1);                // 2 × 0,5
    expect(par.deltoide_anterieur).toBe(1);     // 2 × 0,5
    expect(par.quadriceps).toBe(1);
    expect(par.fessiers).toBe(0.5);
    expect(v[0].muscle).toBe('pectoraux');      // le plus volumineux en tête
    expect(v[v.length - 1].series).toBe(0.5);
  });

  test('les séries qui ne sont pas du travail ne comptent pas', () => {
    const v = Semaine.volumeParMuscle([
      serie({ id: '1', type_serie: 'echauffement' }),
      serie({ id: '2', type_serie: 'degressive' }),
      serie({ id: '3', type_serie: 'echec' }),
      serie({ id: '4', type_serie: 'travail' })
    ], CATALOGUE);
    expect(v.filter(x => x.muscle === 'pectoraux')[0].series).toBe(1);
  });

  test('une randonnée ne contribue à aucun muscle', () => {
    const v = Semaine.volumeParMuscle([
      serie({ id: '1', exercise_slug: 'rando' }),
      serie({ id: '2', exercise_slug: 'rando' })
    ], CATALOGUE);
    expect(v).toEqual([]);
  });

  test('un gainage, lui, compte — ses muscles sont renseignés', () => {
    const v = Semaine.volumeParMuscle([serie({ id: '1', exercise_slug: 'planche' })], CATALOGUE);
    expect(v).toEqual([{ muscle: 'abdominaux', libelle: 'Abdominaux', series: 1 }]);
  });

  test('un exercice absent du catalogue est ignoré sans lever', () => {
    expect(Semaine.volumeParMuscle([serie({ exercise_slug: 'inconnu' })], CATALOGUE)).toEqual([]);
    expect(Semaine.volumeParMuscle([serie({})], null)).toEqual([]);
  });

  test('les libellés sont lisibles, pas des slugs', () => {
    const v = Semaine.volumeParMuscle([serie({ exercise_slug: 'dc' })], CATALOGUE);
    expect(v.map(x => x.libelle)).toContain('Deltoïde antérieur');
  });
});

// ── Bilan et navigation ─────────────────────────────────────────────────────
describe('bilanSemaine et navigation', () => {
  test('le compte brut ne retient que le travail des séances de la semaine', () => {
    const b = Semaine.bilanSemaine(
      [seance({ id: 'a' }), seance({ id: 'b' })],
      [serie({ session_id: 'a' }), serie({ session_id: 'a', type_serie: 'echauffement' }),
       serie({ session_id: 'b' }), serie({ session_id: 'hors-semaine' })]);
    expect(b.nbSeances).toBe(2);
    expect(b.nbSeriesTravail).toBe(2);
  });

  test('reculer puis avancer d’une semaine revient au point de départ', () => {
    const depart = Semaine.bornesSemaine(new Date(2026, 8, 9));
    const avant = Semaine.decalerSemaine(depart.lundi, -1);
    const retour = Semaine.decalerSemaine(avant.lundi, 1);
    expect(avant.lundi.getDate()).toBe(31);      // lundi 31 août
    expect(retour.lundi.getTime()).toBe(depart.lundi.getTime());
  });

  test('memeSemaine reconnaît deux instants de la même semaine', () => {
    expect(Semaine.memeSemaine(new Date(2026, 8, 7), new Date(2026, 8, 13))).toBe(true);
    expect(Semaine.memeSemaine(new Date(2026, 8, 13), new Date(2026, 8, 14))).toBe(false);
  });
});

// ── Libellés de muscles ────────────────────────────────────────────────────
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : un jeu contenant À LA
// FOIS `abducteurs` et `adducteurs`. Avec un seul des deux, une table qui les
// fusionne — ou qui en oublie un — passe inaperçue.
describe('libelleMuscle — les 18 muscles du catalogue', () => {
  // Relevés en base sur les 237 exercices : liste exhaustive.
  const MUSCLES = [
    'abdominaux', 'abducteurs', 'adducteurs', 'avant_bras', 'bas_du_dos', 'biceps',
    'deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur', 'fessiers',
    'grand_dorsal', 'haut_du_dos', 'ischio_jambiers', 'mollets', 'pectoraux',
    'quadriceps', 'trapezes', 'triceps'
  ];

  test('les 18 donnent 18 libellés DISTINCTS', () => {
    const libelles = MUSCLES.map(Semaine.libelleMuscle);
    expect(libelles).toHaveLength(18);
    expect(new Set(libelles).size).toBe(18);
  });

  test('aucun des 18 ne retombe sur sa clé brute', () => {
    MUSCLES.forEach((m) => {
      expect(Semaine.libelleMuscle(m)).not.toBe(m);
      expect(Semaine.libelleMuscle(m)).toMatch(/^[A-ZÀ-Ý]/);
    });
  });

  test('abducteurs et adducteurs sont DEUX muscles, deux libellés', () => {
    expect(Semaine.libelleMuscle('abducteurs')).toBe('Abducteurs');
    expect(Semaine.libelleMuscle('adducteurs')).toBe('Adducteurs');
    expect(Semaine.libelleMuscle('abducteurs')).not.toBe(Semaine.libelleMuscle('adducteurs'));
  });

  test('un muscle inconnu ne disparaît pas et ne prend le nom d’aucun autre', () => {
    const connus = new Set(MUSCLES.map(Semaine.libelleMuscle));
    ['psoas', 'soleaire', 'muscle_invente'].forEach((inconnu) => {
      const rendu = Semaine.libelleMuscle(inconnu);
      expect(rendu).toBe(inconnu);        // rendu tel quel, reconnaissable
      expect(rendu).toBeTruthy();         // il ne disparaît pas
      expect(connus.has(rendu)).toBe(false);
    });
  });

  test('une clé vide ou absente ne casse rien', () => {
    expect(Semaine.libelleMuscle(null)).toBe('');
    expect(Semaine.libelleMuscle(undefined)).toBe('');
  });
});

// ── Les jours vides ne sont plus rendus ────────────────────────────────────
describe('joursAvecSeances — seuls les jours pleins', () => {
  const jour = (n, seances) => ({ date: new Date(2026, 7, 24 + n), nom: 'J' + n, seances });

  test('une semaine à quatre séances rend quatre jours, pas sept', () => {
    const jours = [jour(0, [{ id: 'a' }]), jour(1, []), jour(2, [{ id: 'b' }]),
                   jour(3, []), jour(4, [{ id: 'c' }]), jour(5, []), jour(6, [{ id: 'd' }])];
    const pleins = Semaine.joursAvecSeances(jours);
    expect(pleins).toHaveLength(4);
    expect(pleins.every((j) => j.seances.length > 0)).toBe(true);
    expect(pleins.map((j) => j.nom)).toEqual(['J0', 'J2', 'J4', 'J6']);
  });

  test('une semaine entièrement vide rend une liste vide — à la vue de le dire', () => {
    expect(Semaine.joursAvecSeances([jour(0, []), jour(1, [])])).toEqual([]);
  });

  test('l’ordre des jours est conservé', () => {
    const jours = [jour(0, [{ id: 'a' }]), jour(1, [{ id: 'b' }]), jour(2, [{ id: 'c' }])];
    expect(Semaine.joursAvecSeances(jours).map((j) => j.nom)).toEqual(['J0', 'J1', 'J2']);
  });

  test('rien, ou des jours mal formés, ne cassent pas', () => {
    expect(Semaine.joursAvecSeances(null)).toEqual([]);
    expect(Semaine.joursAvecSeances([null, {}, { seances: null }])).toEqual([]);
  });

  test('le modèle continue de rendre les SEPT jours — c’est la vue qui filtre', () => {
    const jours = Semaine.repartirParJour([], new Date(2026, 7, 24));
    expect(jours).toHaveLength(7);
  });
});

// ── Zones (ECRAN-SAISIE §7 bis.10) ─────────────────────────────────────────
describe('volumeParZone — on regroupe, on ne tronque pas', () => {
  const CAT = [
    { slug: 'sq', nom: 'Squat', muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'] },
    { slug: 'sdt', nom: 'Soulevé', muscles_primaires: ['ischio_jambiers'], muscles_secondaires: ['bas_du_dos'] },
    { slug: 'dc', nom: 'Couché', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
    { slug: 'row', nom: 'Rowing', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'] },
    { slug: 'ohp', nom: 'Militaire', muscles_primaires: ['deltoide_anterieur'], muscles_secondaires: [] },
    { slug: 'abs', nom: 'Gainage', muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
    { slug: 'mol', nom: 'Mollets', muscles_primaires: ['mollets'], muscles_secondaires: [] },
    { slug: 'zz', nom: 'Inconnu', muscles_primaires: ['psoas'], muscles_secondaires: [] }
  ];
  const series = (paires) => {
    const out = [];
    paires.forEach(([slug, n]) => {
      for (let i = 0; i < n; i++) out.push({ exercise_slug: slug, type_serie: 'travail', session_id: 'a' });
    });
    return out;
  };
  const somme = (l) => Math.round(l.reduce((t, x) => t + x.series, 0) * 10) / 10;

  // L'invariant central : regrouper ne doit RIEN perdre.
  test.each([
    [[['sq', 4], ['sdt', 3], ['dc', 5]]],
    [[['sq', 1], ['row', 7], ['ohp', 2], ['abs', 3], ['mol', 1]]],
    [[['dc', 12]]],
    [[['sq', 3], ['sdt', 3], ['dc', 3], ['row', 3], ['ohp', 3], ['abs', 3], ['mol', 3]]]
  ])('somme des zones = somme des muscles (jeu %#)', (paires) => {
    const s = series(paires);
    expect(somme(Semaine.volumeParZone(s, CAT))).toBe(somme(Semaine.volumeParMuscle(s, CAT)));
  });

  test('chaque muscle se retrouve dans sa zone, une seule fois', () => {
    const s = series([['sq', 4], ['sdt', 3], ['dc', 5], ['row', 2], ['ohp', 1], ['abs', 2], ['mol', 1]]);
    const zones = Semaine.volumeParZone(s, CAT);
    const muscles = Semaine.volumeParMuscle(s, CAT);
    const dansLesZones = [].concat.apply([], zones.map((z) => z.muscles)).map((m) => m.muscle);
    expect(dansLesZones.sort()).toEqual(muscles.map((m) => m.muscle).sort());
    expect(new Set(dansLesZones).size).toBe(dansLesZones.length);
  });

  test('les zones sont triées par volume décroissant', () => {
    const s = series([['sq', 6], ['dc', 2], ['abs', 1]]);
    const zones = Semaine.volumeParZone(s, CAT);
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i - 1].series).toBeGreaterThanOrEqual(zones[i].series);
    }
  });

  test('un muscle HORS TABLE n’est ni perdu ni rattaché au hasard', () => {
    const s = series([['sq', 4], ['zz', 3]]);
    const zones = Semaine.volumeParZone(s, CAT);
    const hors = zones.filter((z) => z.horsTable);
    expect(hors).toHaveLength(1);
    expect(hors[0].series).toBe(3);                        // il n'est PAS perdu
    expect(hors[0].muscles.map((m) => m.muscle)).toEqual(['psoas']);
    // et il n'a rejoint aucune zone connue
    Semaine.ZONES.forEach((z) => {
      const zone = zones.filter((x) => x.zone === z.cle)[0];
      if (zone) expect(zone.muscles.map((m) => m.muscle)).not.toContain('psoas');
    });
    // la somme reste juste malgré l'intrus
    expect(somme(zones)).toBe(somme(Semaine.volumeParMuscle(s, CAT)));
  });

  test('les 18 muscles du catalogue ont tous une zone', () => {
    const MUSCLES = [
      'abdominaux', 'abducteurs', 'adducteurs', 'avant_bras', 'bas_du_dos', 'biceps',
      'deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur', 'fessiers',
      'grand_dorsal', 'haut_du_dos', 'ischio_jambiers', 'mollets', 'pectoraux',
      'quadriceps', 'trapezes', 'triceps'
    ];
    MUSCLES.forEach((m) => expect(Semaine.zoneDuMuscle(m)).not.toBeNull());
    expect(Semaine.zoneDuMuscle('psoas')).toBeNull();
    // Les six zones couvrent les 18, sans doublon.
    const couverts = [].concat.apply([], Semaine.ZONES.map((z) => z.muscles));
    expect(couverts.sort()).toEqual(MUSCLES.slice().sort());
  });

  test('une semaine vide ne rend aucune zone', () => {
    expect(Semaine.volumeParZone([], CAT)).toEqual([]);
    expect(Semaine.volumeParZone(null, null)).toEqual([]);
  });
});

describe('apportsParMuscle — d’où vient ce chiffre', () => {
  const CAT = [
    { slug: 'hack', nom: 'Hack Squat', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
    { slug: 'sdt', nom: 'Soulevé', muscles_primaires: ['ischio_jambiers'], muscles_secondaires: ['quadriceps'] }
  ];
  const SEANCES = [
    { id: 'a', debut: new Date(2026, 7, 24, 10).toISOString() },
    { id: 'b', debut: new Date(2026, 7, 28, 10).toISOString() }
  ];
  const serie = (slug, sid) => ({ exercise_slug: slug, session_id: sid, type_serie: 'travail' });
  const SERIES = [
    serie('hack', 'a'), serie('hack', 'a'), serie('hack', 'a'), serie('hack', 'a'), serie('hack', 'a'),
    serie('sdt', 'b'), serie('sdt', 'b'), serie('sdt', 'b'), serie('sdt', 'b'), serie('sdt', 'b')
  ];

  test('5 séries en primaire valent 5 ; 5 séries en secondaire valent 2,5', () => {
    const a = Semaine.apportsParMuscle('quadriceps', SERIES, CAT, SEANCES);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ nom: 'Hack Squat', seriesReelles: 5, apport: 5, secondaire: false });
    expect(a[1]).toMatchObject({ nom: 'Soulevé', seriesReelles: 5, apport: 2.5, secondaire: true });
  });

  test('la somme des apports vaut le volume du muscle', () => {
    const total = Semaine.apportsParMuscle('quadriceps', SERIES, CAT, SEANCES)
      .reduce((t, a) => t + a.apport, 0);
    const muscle = Semaine.volumeParMuscle(SERIES, CAT).filter((m) => m.muscle === 'quadriceps')[0];
    expect(total).toBe(muscle.series);
  });

  test('chaque apport porte son jour', () => {
    const a = Semaine.apportsParMuscle('quadriceps', SERIES, CAT, SEANCES);
    expect(a[0].jour.getDate()).toBe(24);
    expect(a[1].jour.getDate()).toBe(28);
  });

  test('le même exercice dans deux séances fait deux lignes', () => {
    const s = [serie('hack', 'a'), serie('hack', 'b')];
    expect(Semaine.apportsParMuscle('quadriceps', s, CAT, SEANCES)).toHaveLength(2);
  });

  test('les séries hors travail ne comptent pas', () => {
    const s = [{ exercise_slug: 'hack', session_id: 'a', type_serie: 'echauffement' }];
    expect(Semaine.apportsParMuscle('quadriceps', s, CAT, SEANCES)).toEqual([]);
  });

  test('un muscle sans apport rend une liste vide, sans casser', () => {
    expect(Semaine.apportsParMuscle('mollets', SERIES, CAT, SEANCES)).toEqual([]);
    expect(Semaine.apportsParMuscle('quadriceps', null, null, null)).toEqual([]);
  });
});

// ── « Cette semaine » — chantier 18 ────────────────────────────────────────
//
// Le bouton n'existe que si on a quitté la semaine courante. C'est
// `memeSemaine` qui tranche, et c'est lui qu'on vérifie ici : le rendu se
// contente de l'absence ou de la présence de la fonction.
describe('memeSemaine — ce qui décide de « Cette semaine »', () => {
  const ref = new Date(2026, 8, 11);          // vendredi 11 septembre 2026

  test('vrai partout dans la semaine courante, du lundi au dimanche', () => {
    for (let j = 7; j <= 13; j++) {
      expect(Semaine.memeSemaine(new Date(2026, 8, j), ref)).toBe(true);
    }
  });

  test('faux dès la semaine d’avant et celle d’après — les deux sens comptent', () => {
    expect(Semaine.memeSemaine(new Date(2026, 8, 6), ref)).toBe(false);   // dimanche précédent
    expect(Semaine.memeSemaine(new Date(2026, 8, 14), ref)).toBe(false);  // lundi suivant
  });

  test('le lundi de la semaine courante suffit — c’est ce que la barre passe', () => {
    const lundi = Semaine.bornesSemaine(ref).lundi;
    expect(Semaine.memeSemaine(lundi, ref)).toBe(true);
    expect(Semaine.memeSemaine(Semaine.decalerSemaine(lundi, -1).lundi, ref)).toBe(false);
    expect(Semaine.memeSemaine(Semaine.decalerSemaine(lundi, -12).lundi, ref)).toBe(false);
  });
});
