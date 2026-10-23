/** @jest-environment node */
//
// Prompt 131 — les mesures, exercice par exercice (ECRAN-SAISIE §3 bis.3 bis, §3 ter.5,
// §7 septies.4 ; audit 130). Les tests des modules purs, un `describe` par point.

const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const SERIE = (o) => Object.assign({ exercise_slug: 'course', type_serie: 'travail',
  charge_kg: null, reps: null, duree_s: null, distance_m: null }, o);
const EXOS = [{ slug: 'course', nom: 'Course à Pied', mesure: 'distance_temps', charge: 'aucune' }];

// ── #5 — une série en distance seule ──────────────────────────────────────────
describe('audit 130 n°5 — une série en distance seule se montre', () => {
  test('la colonne « préc. » : la durée si elle est là, sinon la distance (jamais « — »)', () => {
    expect(Modele.formatPrecedent({ distance_m: 5000 }, 'distance_temps')).toBe('5 km');
    expect(Modele.formatPrecedent({ duree_s: 1800, distance_m: 5000 }, 'distance_temps')).toBe('30:00');
    expect(Modele.formatPrecedent({}, 'distance_temps')).toBe('—');
    // Sur `temps`, une distance égarée (un import) ne s'affiche pas : la mesure décide.
    expect(Modele.formatPrecedent({ distance_m: 5000 }, 'temps')).toBe('—');
  });
  test('la page d’exercice : sans aucune durée, la plus longue distance, avec son libellé', () => {
    const m = Modele.meilleureSerieDe('course',
      [SERIE({ distance_m: 5000 }), SERIE({ distance_m: 8200 }), SERIE({ distance_m: 3000 })], EXOS, null, {});
    expect(m.valeur).toBe('8,2 km');
    expect(m.libelle).toBe('Plus longue distance');
    expect(Modele.texteMeilleure(m)).toBe('8,2 km');
  });
  test('avec une durée, rien ne change : la plus longue durée, sa distance en complément, sans libellé', () => {
    const m = Modele.meilleureSerieDe('course',
      [SERIE({ distance_m: 9000 }), SERIE({ duree_s: 1800, distance_m: 5000 })], EXOS, null, {});
    expect(m.valeur).toBe('30 min');
    expect(m.complement).toBe('· 5 km');
    expect(m.libelle).toBeUndefined();
  });
});

// ── #8 et #9 — les bornes (ECRAN §3 ter.5, décidées le 21/10/2026) ─────────────
describe('audit 130 n°8 et n°9 — les bornes : jamais 0, la distance au plus 400 km', () => {
  const seance = () => ({ exercices: [{ exercise_slug: 'course', series: [SERIE({})] }] });
  const apres = (champs) => Seance.modifierSerie(seance(), 0, 0, champs).exercices[0].series[0];
  test('400 km passent ; 400,1 km ne s’écrivent pas', () => {
    expect(apres({ distance_km: '400' }).distance_m).toBe(400000);
    expect(apres({ distance_km: '400,1' }).distance_m).toBeNull();
    expect(apres({ distance_m: 400001 }).distance_m).toBeNull();
  });
  test('⚠️ 0 ne s’écrit jamais : ni une durée, ni une distance', () => {
    expect(apres({ distance_km: '0' }).distance_m).toBeNull();
    expect(apres({ duree: 0 }).duree_s).toBeNull();
    expect(apres({ duree_s: 0 }).duree_s).toBeNull();
    expect(apres({ duree: 1 }).duree_s).toBe(1);
    expect(apres({ distance_km: '0,5' }).distance_m).toBe(500);
  });
  test('une durée ou une distance à 0 déjà en base est une case vide au ✓', () => {
    const planche = Modele.gabaritDe({ mesure: 'temps' });
    expect(Seance.casesManquantes(planche, { duree_s: 0 }, {})).toEqual(['duree']);
    const course = Modele.gabaritDe({ mesure: 'distance_temps' });
    expect(Seance.casesManquantes(course, { duree_s: 0, distance_m: 0 }, {})).toEqual(['duree', 'distance_km']);
  });
  test('la réparation de la file borne pareil (une seule table)', () => {
    const r = Seance.bornerLigne({ duree_s: 1800, distance_m: 650000 });
    expect(r.change).toBe(true);
    expect(r.ligne.distance_m).toBeNull();
    expect(Seance.bornerLigne({ duree_s: 1800, distance_m: 5000 }).change).toBe(false);
  });
  test('le champ de saisie : la borne en kilomètres, rien pour la charge', () => {
    expect(Modele.maxDeSaisie('distance_km')).toBe(400);
    expect(Modele.maxDeSaisie('charge_kg')).toBeNull();
  });
});

// ── Point 2 — les champs en plus (ECRAN §3 ter.5, v2_101) ────────────────────
const RANDO = { slug: 'randonnee', nom: 'Randonnée', mesure: 'distance_temps', charge: 'aucune', champs_series: ['denivele_m'] };
const ESCALIERS = { slug: 'escaliers', nom: 'Escaliers', mesure: 'temps', charge: 'aucune', champs_series: ['etages'] };
const SQUAT = { slug: 'squat', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'absolue', champs_series: [] };
const VELO = { slug: 'velo_machine', nom: 'Vélo d’Appartement', mesure: 'distance_temps', charge: 'aucune' };

describe('131 — la fonction des champs d’une série : la mesure, puis le catalogue', () => {
  test('Randonnée : durée, distance, puis le D+ ; Escaliers : durée, puis les étages', () => {
    expect(Modele.champsDeSerie(RANDO)).toEqual(['duree', 'distance_km', 'denivele_m']);
    expect(Modele.colonnesDeSerie(RANDO)).toEqual(['duree_s', 'distance_m', 'denivele_m']);
    expect(Modele.champsDeSerie(ESCALIERS)).toEqual(['duree', 'etages']);
  });
  test('Squat : charge et reps ; un exercice sans `champs_series` : ceux de sa mesure seulement', () => {
    expect(Modele.champsDeSerie(SQUAT)).toEqual(['charge_kg', 'reps']);
    expect(Modele.champsDeSerie(VELO)).toEqual(['duree', 'distance_km']);
    expect(Modele.champsDeSerie({ mesure: 'temps', champs_series: null })).toEqual(['duree']);
  });
  test('une valeur inconnue du catalogue est ignorée ; la mesure inconnue n’en reçoit aucun', () => {
    expect(Modele.champsDeSerie({ mesure: 'temps', champs_series: ['inclinaison', 'etages', 'etages'] }))
      .toEqual(['duree', 'etages']);
    expect(Modele.champsDeSerie({ mesure: 'zzz', champs_series: ['etages'] })).toEqual(['charge_kg', 'reps']);
  });
  test('sans argument, toutes les colonnes de mesure d’une série', () => {
    expect(Modele.colonnesDeSerie()).toEqual(['charge_kg', 'reps', 'duree_s', 'distance_m', 'denivele_m', 'etages']);
  });
  test('la grille : les étages en colonne, le D+ dessous, la légende complétée ; rien dans l’éditeur', () => {
    const e = Modele.grilleDe(ESCALIERS);
    expect([e.colonnes, e.dessous, e.libelle]).toEqual([['duree', 'etages'], [], 'DURÉE · ÉTAGES']);
    const r = Modele.grilleDe(RANDO);
    expect([r.colonnes, r.dessous]).toEqual([['duree', 'distance_km'], ['denivele_m']]);
    expect(r.libelle).toBe('DURÉE · DISTANCE · D+');   // 131b : la légende suit les colonnes (maquette)
    expect(r.champs).toEqual(['duree', 'distance_km']);           // les cases obligatoires ne changent pas
    expect(Modele.grilleDe(RANDO, true).dessous).toEqual([]);
    expect(Modele.grilleDe(ESCALIERS, true).colonnes).toEqual(['duree']);
  });
  test('les champs en plus ne sont jamais obligatoires', () => {
    const g = Modele.gabaritDe(ESCALIERS);
    expect(Seance.casesManquantes(g, { duree_s: 1200, etages: null, denivele_m: null }, {})).toEqual([]);
  });
});

describe('131 — les bornes du D+ et des étages', () => {
  const seance = () => ({ exercices: [{ exercise_slug: 'randonnee', series: [SERIE({})] }] });
  const apres = (champs) => Seance.modifierSerie(seance(), 0, 0, champs).exercices[0].series[0];
  test('D+ : 10 000 m passent, 10 001 m non, 0 jamais', () => {
    expect(apres({ denivele_m: '10000' }).denivele_m).toBe(10000);
    expect(apres({ denivele_m: '10001' }).denivele_m).toBeNull();
    expect(apres({ denivele_m: '0' }).denivele_m).toBeNull();
    expect(apres({ denivele_m: '920' }).denivele_m).toBe(920);
  });
  test('étages : 2 000 passent, 2 001 non, 0 jamais', () => {
    expect(apres({ etages: '2000' }).etages).toBe(2000);
    expect(apres({ etages: '2001' }).etages).toBeNull();
    expect(apres({ etages: 0 }).etages).toBeNull();
  });
  test('la réparation de la file, et la borne du champ', () => {
    const r = Seance.bornerLigne({ duree_s: 600, etages: 2500, denivele_m: 920 });
    expect([r.change, r.ligne.etages, r.ligne.denivele_m]).toEqual([true, null, 920]);
    expect([Modele.maxDeSaisie('denivele_m'), Modele.maxDeSaisie('etages')]).toEqual([10000, 2000]);
  });
});

describe('131 — le formateur unique : distance, puis durée, puis D+ ou étages', () => {
  test('« 13,2 km · 3 h 25 · D+ 920 m » et « 20 min · 72 étages »', () => {
    expect(Modele.formatMesure({ duree_s: 12300, distance_m: 13200, denivele_m: 920 })).toBe('13,2 km · 3 h 25 · D+ 920 m');
    expect(Modele.formatMesure({ duree_s: 1200, etages: 72 })).toBe('20 min · 72 étages');
  });
  test('rien quand c’est vide : jamais « D+ 0 m », jamais « 0 étage »', () => {
    expect(Modele.formatMesure({ duree_s: 11100, distance_m: 11800, denivele_m: null })).toBe('11,8 km · 3 h 05');
    expect(Modele.formatMesure({ duree_s: 1200, etages: 0, denivele_m: 0 })).toBe('20 min');
    expect(Modele.formatMesure({ duree_s: 1200, etages: 1 })).toBe('20 min · 1 étage');
  });
});

describe('131 — l’écriture : la série vide, la reprise, l’envoi', () => {
  test('la série vide porte le D+ et les étages, à null', () => {
    const v = Seance.serieVide('s1');
    expect([v.denivele_m, v.etages]).toEqual([null, null]);
  });
  test('« Modifier » une séance passée garde le D+ et les étages', () => {
    const s = Seance.reprendre({ id: 'x', debut: '2026-10-12T08:00:00Z', fin: '2026-10-12T11:30:00Z', statut: 'terminee' },
      [{ exercices: [{ slug: 'randonnee', series: [{ id: 'a', rang: 1, source: 'app', type_serie: 'travail',
        duree_s: 12300, distance_m: 13200, denivele_m: 920, etages: null, validee_a: '2026-10-12T11:00:00Z' }] }] }]);
    const serie = s.exercices[0].series[0];
    expect([serie.denivele_m, serie.etages, serie.distance_m]).toEqual([920, null, 13200]);
    const ligne = Seance.lignes(Object.assign({}, s, { user_id: 'u' }))[0];
    expect([ligne.denivele_m, ligne.etages]).toEqual([920, null]);
  });
  test('l’envoi et la lecture s’accordent (`verifierColonnes`)', () => {
    expect(Seance.COLONNES_SET).toEqual(expect.arrayContaining(['denivele_m', 'etages']));
    expect(Seance.verifierColonnes()).toBe(true);
  });
});

describe('audit 130 n°4 — une distance Hevy sur le vélo d’appartement se voit (le vélo en `distance_temps`, v2_101)', () => {
  const hevy = { exercise_slug: 'velo_machine', type_serie: 'travail', source: 'hevy', duree_s: 1800, distance_m: 12600 };
  test('la colonne « préc. », la page d’exercice et le journal', () => {
    expect(Modele.formatPrecedent(hevy, Modele.gabaritDe(VELO).mesure)).toBe('30:00');
    const m = Modele.meilleureSerieDe('velo_machine', [hevy], [VELO], null, {});
    expect(Modele.texteMeilleure(m)).toBe('30 min · 12,6 km');
    expect(Modele.formatMesure(hevy)).toBe('12,6 km · 30 min');
  });
});

// ── Point 4 — la fin de séance : une donnée facultative restée vide (ECRAN §7 septies.4, écran 6) ─────────
describe('131 — la feuille « Terminer » : la première donnée facultative restée vide', () => {
  const CAT = [RANDO, ESCALIERS, VELO, SQUAT];
  const S = (slug, o) => Object.assign({ id: slug + Math.random(), type_serie: 'travail', validee_a: '2026-10-21T10:00:00Z',
    charge_kg: null, reps: null, duree_s: null, distance_m: null, denivele_m: null, etages: null }, o);
  const seance = (exos) => ({ exercices: exos.map(([slug, series]) => ({ exercise_slug: slug, series })) });
  test('la randonnée en durée seule : le D+ d’abord (le champ en plus), pas la distance', () => {
    const s = seance([['squat', [S('squat', { charge_kg: 100, reps: 5 })]], ['randonnee', [S('randonnee', { duree_s: 11400 })]]]);
    expect(Seance.donneeFacultativeVide(s, CAT)).toEqual({ iExo: 1, iSerie: 0, slug: 'randonnee', nom: 'denivele_m' });
  });
  test('le D+ tapé : la distance de cette randonnée (durée remplie) ; puis les étages de l’escalier', () => {
    const s = seance([['randonnee', [S('randonnee', { duree_s: 11400, denivele_m: 920 })]],
      ['escaliers', [S('escaliers', { duree_s: 1200 })]]]);
    expect(Seance.donneeFacultativeVide(s, CAT).nom).toBe('distance_km');
    s.exercices[0].series[0].distance_m = 13200;
    expect(Seance.donneeFacultativeVide(s, CAT)).toEqual({ iExo: 1, iSerie: 0, slug: 'escaliers', nom: 'etages' });
  });
  test('le vélo en distance seule (pas de durée) : rien à demander ; une série non validée, une chauffe : non plus', () => {
    expect(Seance.donneeFacultativeVide(seance([['velo_machine', [S('velo_machine', { distance_m: 12600 })]]]), CAT)).toBeNull();
    expect(Seance.donneeFacultativeVide(seance([['randonnee', [S('randonnee', { duree_s: 600, validee_a: null })]]]), CAT)).toBeNull();
    expect(Seance.donneeFacultativeVide(seance([['randonnee', [S('randonnee', { duree_s: 600, type_serie: 'echauffement' })]]]), CAT)).toBeNull();
  });
  test('tout est rempli : rien', () => {
    const s = seance([['randonnee', [S('randonnee', { duree_s: 11400, distance_m: 13200, denivele_m: 920 })]],
      ['escaliers', [S('escaliers', { duree_s: 1200, etages: 72 })]]]);
    expect(Seance.donneeFacultativeVide(s, CAT)).toBeNull();
  });
});
