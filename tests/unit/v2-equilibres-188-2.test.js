/** @jest-environment node */
//
// 188-2 — « TA SEMAINE : LES JOURS, LE TEMPS, LA FRÉQUENCE, L'ORDRE » (MOTEUR §9.27 bis). Les cartes de la 188-1 se
// réutilisent (même mécanique : réglage, silence, ordre) ; ici les quatre mesures nouvelles. Chaque fixture déclenche vraiment le
// chemin qu'elle nomme. Aucun nombre fixe de séries ni d'exercices : les fixtures font varier les deux.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
require('../../v2/js/routines.js');
require('../../v2/js/generateur.js');
const Eq = require('../../v2/js/equilibres.js');

const fiche = (nom, prim, sec, stab, schema, mouvement, equipement) => ({
  nom, muscles_primaires: prim, muscles_secondaires: sec || [], muscles_stabilisateurs: stab || [],
  schema_mouvement: schema || null, mouvement: mouvement || null, equipement: equipement || 'machine'
});
const CAT = {
  developpe_couche_barre: fiche('Développé Couché (Barre)', ['pectoraux'], ['triceps'], ['deltoide_anterieur'], 'pousser_horizontal', 'couche', 'barre'),
  developpe_militaire_barre: fiche('Développé Militaire (Barre)', ['deltoide_anterieur'], ['triceps'], ['trapezes'], 'pousser_vertical', 'militaire', 'barre'),
  tractions: fiche('Tractions', ['grand_dorsal'], ['biceps'], ['avant_bras'], 'tirer_vertical', 'tractions', 'poids_du_corps'),
  rowing_barre: fiche('Rowing Penché (Barre)', ['grand_dorsal', 'haut_du_dos'], ['biceps'], [], 'tirer_horizontal', 'rowing', 'barre'),
  squat_barre: fiche('Squat (Barre)', ['quadriceps', 'fessiers'], ['adducteurs'], [], 'accroupir', 'squat', 'barre'),
  souleve_de_terre_barre: fiche('Soulevé de Terre (Barre)', ['bas_du_dos', 'fessiers', 'ischio_jambiers'], ['quadriceps'], [], 'pencher', 'souleve', 'barre'),
  souleve_de_terre_roumain: fiche('Soulevé de Terre Roumain', ['ischio_jambiers', 'fessiers'], ['bas_du_dos'], [], 'pencher', null, 'barre'),
  hip_thrust: fiche('Hip Thrust', ['fessiers'], ['ischio_jambiers', 'quadriceps'], [], 'fessiers', null, 'barre'),
  leg_curl: fiche('Leg Curl Assis', ['ischio_jambiers'], [], [], 'ischios', null, 'machine'),
  leg_extension: fiche('Leg Extension', ['quadriceps'], [], [], 'quadriceps', null, 'machine'),
  curl: fiche('Curl Biceps', ['biceps'], [], [], 'biceps', null, 'haltere'),
  extension_triceps: fiche('Extension Triceps', ['triceps'], [], [], 'triceps', null, 'poulie'),
  elevations_laterales: fiche('Élévations Latérales', ['deltoide_lateral'], [], [], 'epaules_cote', null, 'haltere'),
  oiseau: fiche('Oiseau', ['deltoide_posterieur'], [], [], 'epaules_arriere', null, 'haltere'),
  releves_mollets: fiche('Relevés Mollets', ['mollets'], [], [], 'mollets', null, 'machine'),
  tapis: { nom: 'Tapis', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] }
};

// ── Les semaines : k = 0 est la dernière semaine FINIE (le lundi 19/10/2026) ; la semaine en cours (26/10) est « 1 semaine devant ».
const JOUR = '2026-10-28';
const lundi = (k) => new Date(2026, 9, 19 - 7 * k);
const iso = (d, h, min) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 10, min || 0, 0).toISOString();
function jourDe(k, offset) { const l = lundi(k); return new Date(l.getFullYear(), l.getMonth(), l.getDate() + (offset || 0)); }
// `semaines` : { k: [{ routine, exos: { slug: n }, jour: 0..6, minutes, gestes }] } ; `courante` : les séances de la semaine en cours.
function bati(semaines, courante) {
  const seances = [], series = [];
  let c = 0;
  const poser = (d, s, j) => {
    const id = 's' + (++c);
    const debut = iso(d, 10 + j);
    seances.push({ id, debut, fin: s.minutes ? new Date(new Date(debut).getTime() + s.minutes * 60000).toISOString() : null, routine_id: s.routine || null, gestes: s.gestes || [] });
    let rang = 0;
    Object.keys(s.exos).forEach((slug) => {
      for (let i = 0; i < s.exos[slug]; i++) series.push({ id: id + slug + i, session_id: id, exercise_slug: slug, type_serie: 'travail', reps: 8, charge_kg: 50, rang: ++rang });
    });
  };
  Object.keys(semaines).forEach((k) => semaines[k].forEach((s, j) => poser(jourDe(Number(k), s.jour === undefined ? j : s.jour), s, j)));
  (courante || []).forEach((s, j) => poser(new Date(2026, 9, 26 + (s.jour === undefined ? j : s.jour)), s, j));
  return { seances, series };
}
const routine = (id, nom, exos, jours) => ({ id, nom, jours: jours || null, exercices: Object.keys(exos).map((slug, i) => ({ exercise_slug: slug, rang: i,
  series: Array.from({ length: exos[slug] }, () => ({ type_serie: 'travail', reps_visees: 8 })) })) });
const entree = (b, extra) => Object.assign({ jour: JOUR, reglage: 'normal', intention: 'progresser', catalogue: CAT, seances: b.seances, series: b.series,
  routines: [], priorites: [], programmeDuCoach: false, volume: null, ecartes: [], cartes: {} }, extra || {});
const constat = (a, cle) => a.constats.filter((c) => c.cle === cle)[0] || null;
const carte = (a, cle) => a.cartes.filter((c) => c.cle === cle)[0] || null;

// Des séances de remplissage sur un exercice, pour qu'une semaine compte.
const SEANCE = (routineId, jour, exos, extra) => Object.assign({ routine: routineId, jour, exos: exos || { leg_curl: 4, oiseau: 2 } }, extra || {});

// n semaines de `jours` jours chacune (des séances distinctes, un jour chacune).
function semainesDeJours(liste) {
  const s = {};
  liste.forEach((n, k) => { s[k] = Array.from({ length: n }, (_, j) => SEANCE('r' + (j + 1), j)); });
  return s;
}
const R = (n) => Array.from({ length: n }, (_, i) => routine('r' + (i + 1), 'Séance ' + (i + 1), { leg_curl: 4, oiseau: 2 }));

// ══ LES JOURS ════════════════════════════════════════════════════════════════════════════════════════════════════
describe('188-2 — Ta semaine prévue et ta semaine réelle', () => {
  const huit = (n) => Array.from({ length: 8 }, () => n);

  test('prévu 4 jours, 2 réels chaque semaine : la carte, le fait (prévu et réel), la proposition « sur 2 jours »', () => {
    const a = Eq.analyser(entree(bati(semainesDeJours(huit(2))), { seancesParSemaine: 4, routines: R(4) }));
    const c = carte(a, 'jours');
    expect(c).not.toBeNull();
    expect(c.famille).toBe('jours');
    expect(c.fait).toBe('Ton programme est prévu pour 4 jours. Tes 8 dernières semaines d’entraînement en comptent 2 en moyenne.');
    expect(c.propositions.map((p) => [p.type, p.libelle, p.jours])).toEqual([['refaire_jours', 'Refaire mon programme sur 2 jours', 2]]);
    expect(c.libelleRefus).toBe('Garder 4 jours');
    expect(c.repere).toMatch(/Les semaines sans aucune séance .* ne comptent pas/);
  });
  test('⚠️ un jour d’entraînement est un JOUR distinct : deux séances le même jour comptent pour un seul', () => {
    const sem = {};
    for (let k = 0; k < 8; k++) sem[k] = [SEANCE('r1', 0), SEANCE('r2', 0), SEANCE('r3', 2), SEANCE('r4', 2)];       // 4 séances, 2 jours
    const a = Eq.analyser(entree(bati(sem), { seancesParSemaine: 4, routines: R(4) }));
    expect(constat(a, 'jours').reel).toBe(2);
    expect(carte(a, 'jours')).not.toBeNull();
  });
  test('la médiane inférieure d’au moins 1 jour : 3 pour 4 prévus déclenche ; 4 pour 4 non', () => {
    expect(carte(Eq.analyser(entree(bati(semainesDeJours(huit(3))), { seancesParSemaine: 4, routines: R(4) })), 'jours')).not.toBeNull();
    expect(constat(Eq.analyser(entree(bati(semainesDeJours(huit(4))), { seancesParSemaine: 4, routines: R(4) })), 'jours')).toBeNull();
  });
  test('l’autre sens : prévu 3, 4 réels chaque semaine — « sur 4 jours »', () => {
    const a = Eq.analyser(entree(bati(semainesDeJours(huit(4))), { seancesParSemaine: 3, routines: R(4) }));
    const c = carte(a, 'jours');
    expect(c.sens).toBe('plus');
    expect(c.propositions[0].libelle).toBe('Refaire mon programme sur 4 jours');
    expect(c.fait).toMatch(/prévu pour 3 jours/);
  });
  test('l’habitude suit le réglage : 3 jours pour 4 prévus sur 5 semaines de 8 — Normal (5) et Me pousser (4) parlent, Me ménager (6) se tait', () => {
    const jours = [3, 3, 3, 3, 3, 4, 4, 4];
    const e = (r) => entree(bati(semainesDeJours(jours)), { seancesParSemaine: 4, routines: R(4), reglage: r });
    expect(carte(Eq.analyser(e('normal')), 'jours')).not.toBeNull();
    expect(carte(Eq.analyser(e('franc')), 'jours')).not.toBeNull();
    const m = Eq.analyser(e('prudent'));
    expect(carte(m, 'jours')).toBeNull();
    expect(constat(m, 'jours').habitude.tenu).toBe(5);           // le fait est le même : seul « quand » change
  });
  test('un accident n’est pas une habitude : 2 semaines à 3 jours sur 8 ne font rien', () => {
    expect(constat(Eq.analyser(entree(bati(semainesDeJours([3, 3, 4, 4, 4, 4, 4, 4])), { seancesParSemaine: 4, routines: R(4) })), 'jours')).toBeNull();
  });
  test('prévu 5 : une rotation sans trou (4 jours, la séance qui manque tourne) ne déclenche rien', () => {
    const sem = {};
    for (let k = 0; k < 8; k++) sem[k] = [0, 1, 2, 3, 4].filter((i) => i !== k % 5).map((i, j) => SEANCE('r' + (i + 1), j));
    const a = Eq.analyser(entree(bati(sem), { seancesParSemaine: 5, routines: R(5) }));
    expect(constat(a, 'jours')).toBeNull();
  });
  test('prévu 5 : la MÊME séance sautée 4 fois sur 8 (ou plus) déclenche — et la proposition tombe sur 4 jours', () => {
    const sem = {};
    for (let k = 0; k < 8; k++) sem[k] = [0, 1, 2, 3, 4].filter((i) => !(i === 4 && k < 4)).map((i, j) => SEANCE('r' + (i + 1), j));
    const a = Eq.analyser(entree(bati(sem), { seancesParSemaine: 5, routines: R(5) }));
    const c = constat(a, 'jours');
    expect(c).not.toBeNull();
    expect(c.causes.map((x) => x.texte).join(' ')).toMatch(/« Séance 5 »/);
    // 3 sauts seulement : rien.
    const sem3 = {};
    for (let k = 0; k < 8; k++) sem3[k] = [0, 1, 2, 3, 4].filter((i) => !(i === 4 && k < 3)).map((i, j) => SEANCE('r' + (i + 1), j));
    expect(constat(Eq.analyser(entree(bati(sem3), { seancesParSemaine: 5, routines: R(5) })), 'jours')).toBeNull();
  });
  test('prévu 6 : une médiane ≤ prévu − 1,5 (4 jours) déclenche, sans séance sautée toujours la même', () => {
    const sem = {};
    for (let k = 0; k < 8; k++) sem[k] = [0, 1, 2, 3, 4, 5].filter((i) => i % 6 !== k % 6 && i % 6 !== (k + 3) % 6).map((i, j) => SEANCE('r' + (i + 1), j));
    const a = Eq.analyser(entree(bati(sem), { seancesParSemaine: 6, routines: R(6) }));
    expect(constat(a, 'jours')).not.toBeNull();
    // 5 jours pour 6 prévus : la médiane 5 > 6 − 1,5, sans séance qui saute 4 fois : rien.
    const sem5 = {};
    for (let k = 0; k < 8; k++) sem5[k] = [0, 1, 2, 3, 4, 5].filter((i) => i !== k % 6).map((i, j) => SEANCE('r' + (i + 1), j));
    expect(constat(Eq.analyser(entree(bati(sem5), { seancesParSemaine: 6, routines: R(6) })), 'jours')).toBeNull();
  });
  test('les semaines à zéro sont exclues (une coupure n’est pas un retard) et la semaine en cours n’est pas finie', () => {
    const sem = {};
    [0, 2, 4, 6, 8, 10, 12, 14].forEach((k) => { sem[k] = Array.from({ length: 4 }, (_, j) => SEANCE('r' + (j + 1), j)); });
    const e = entree(bati(sem, [SEANCE('r1', 0)]), { seancesParSemaine: 4, routines: R(4) });
    expect(constat(Eq.analyser(e), 'jours')).toBeNull();      // 4 jours chaque semaine non nulle ; 1 jour cette semaine, pas finie
  });
  test('mesure : « 5 prévus, 4,9 réels » → aucune carte des jours', () => {
    const jours = [5, 5, 5, 5, 5, 5, 5, 4];
    const sem = {};
    jours.forEach((n, k) => { sem[k] = [0, 1, 2, 3, 4].slice(0, n).map((i, j) => SEANCE('r' + (i + 1), j)); });
    const a = Eq.analyser(entree(bati(sem), { seancesParSemaine: 5, routines: R(5) }));
    expect(constat(a, 'jours')).toBeNull();
    expect(a.cartes.map((c) => c.cle)).not.toContain('jours');
  });
  test('mesure : « 4 prévus, 2 réels » → la carte des jours, la première de l’ordre', () => {
    const a = Eq.analyser(entree(bati(semainesDeJours(huit(2))), { seancesParSemaine: 4, routines: R(4) }));
    expect(a.cartes[0].cle).toBe('jours');
  });
  test('« Garder 4 jours » (Pas maintenant) fait taire la carte la durée du réglage, doublée après deux refus', () => {
    const e = (cartes, jour) => entree(bati(semainesDeJours(huit(2))), { seancesParSemaine: 4, routines: R(4), cartes, jour: jour || JOUR });
    expect(carte(Eq.analyser(e({ jours: { r: 'non', le: '2026-10-20', refus: 1 } })), 'jours')).toBeNull();
    expect(carte(Eq.analyser(e({ jours: { r: 'non', le: '2026-08-20', refus: 1 } })), 'jours')).not.toBeNull();
    expect(carte(Eq.analyser(e({ jours: { r: 'non', le: '2026-08-20', refus: 2 } })), 'jours')).toBeNull();
  });
  test('le prévu d’un programme du coach : le nombre de ses séances ; celui d’un programme à jours posés : ses jours', () => {
    const rs = R(4).map((r, i) => Object.assign({}, r, { jours: [i + 1] }));
    const a = Eq.analyser(entree(bati(semainesDeJours(huit(2))), { routines: rs, programmeDuCoach: false }));
    expect(carte(a, 'jours').fait).toMatch(/prévu pour 4 jours/);
    const b = Eq.analyser(entree(bati(semainesDeJours(huit(2))), { routines: R(4), programmeDuCoach: true }));
    expect(carte(b, 'jours').fait).toMatch(/prévu pour 4 jours/);
    expect(constat(Eq.analyser(entree(bati(semainesDeJours(huit(2))), { routines: R(4) })), 'jours')).toBeNull();   // ni coach, ni jours, ni profil : rien à comparer
  });
});

// ══ LE TEMPS ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('188-2 — Le temps de tes séances', () => {
  const EXOS_A = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3, extension_triceps: 3, elevations_laterales: 3, oiseau: 3 };   // 26 séries
  const EXOS_B = { squat_barre: 4, souleve_de_terre_roumain: 3, leg_curl: 3, leg_extension: 3, hip_thrust: 3 };                                                                   // 16 séries
  // La séance écourtée : les trois derniers exercices tombent (17 séries sur 26 — moins de 75 %).
  const COURTE_A = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3 };
  const COURTE_B = { squat_barre: 4, souleve_de_terre_roumain: 3, leg_curl: 1 };      // 8 séries sur 16
  const RA = routine('r-a', 'Haut A', EXOS_A), RB = routine('r-b', 'Bas B', EXOS_B);
  // Une semaine : A (écourtée ou non) et B. `courte(k)` : { a: bool, b: bool }.
  function semaines(n, courte, minutes) {
    const s = {};
    for (let k = 0; k < n; k++) {
      const c = courte(k);
      const m = (typeof minutes === 'function' ? minutes(k) : minutes);
      s[k] = [{ routine: 'r-a', jour: 0, exos: c.a ? COURTE_A : EXOS_A, minutes: c.a ? m : 95 },
              { routine: 'r-b', jour: 2, exos: c.b ? COURTE_B : EXOS_B, minutes: c.b ? m : 70 }];
    }
    return s;
  }
  const e = (b, extra) => entree(b, Object.assign({ routines: [RA, RB] }, extra || {}));
  const chaqueSemaine = () => ({ a: true, b: false });

  test('la moitié des séances écourtées, chaque semaine : la carte, le fait, la durée = la médiane réelle', () => {
    const a = Eq.analyser(e(bati(semaines(8, () => ({ a: true, b: true }), 68)), { dureeSeanceMin: 90 }));
    const c = carte(a, 'temps');
    expect(c).not.toBeNull();
    expect(c.famille).toBe('temps');
    expect(c.minutes).toBe(70);
    expect(c.fait).toBe('Ta durée est réglée sur 90 min. Depuis 8 semaines, 16 de tes 16 séances ont été écourtées.');
    expect(c.propositions.map((p) => [p.type, p.libelle, p.minutes])).toEqual([['duree', 'Régler mes séances sur 70 min', 70]]);
    expect(c.libelleRefus).toBe('Garder 90 min');
    expect(c.causes[0].texte).toMatch(/derniers exercices qui sautent/);
    expect(c.reperes[0]).toMatch(/70 min : la durée réelle de tes séances écourtées/);
    expect(c.reperes[0]).toMatch(/supersets.*repos.*jamais sous 2.*Jamais une priorité ni un grand mouvement/);
    expect(c.reperes[1]).toMatch(/Une séance longue ne déclenche rien/);
  });
  test('⚠️ aucun pourcentage de « stimulus » dans le texte (non sourcé de façon fiable)', () => {
    const a = Eq.analyser(e(bati(semaines(8, () => ({ a: true, b: true }), 68))));
    const t = JSON.stringify(carte(a, 'temps'));
    expect(t).not.toMatch(/stimulus|65|75 %|%/i);
  });
  test('la durée proposée est la médiane réelle, arrondie aux 5 min : 73 → 75 ; 70,5 → 70', () => {
    expect(carte(Eq.analyser(e(bati(semaines(8, () => ({ a: true, b: true }), 73)))), 'temps').minutes).toBe(75);
    const m = [66, 68, 69, 71, 72, 73, 74, 70];
    expect(carte(Eq.analyser(e(bati(semaines(8, () => ({ a: true, b: true }), (k) => m[k])))), 'temps').minutes).toBe(70);
  });
  test('mesure : « 3 séances écourtées sur 20 » → aucune carte du temps', () => {
    const s = semaines(8, (k) => ({ a: k < 3, b: false }), 68);
    [0, 1, 2, 3].forEach((k) => s[k].push({ routine: 'r-b', jour: 4, exos: EXOS_B, minutes: 70 }));
    const b = bati(s);
    expect(b.seances).toHaveLength(20);
    const a = Eq.analyser(e(b));
    expect(constat(a, 'temps')).toBeNull();
  });
  test('la moitié exactement : 8 sur 16 déclenche, 7 sur 16 non', () => {
    expect(carte(Eq.analyser(e(bati(semaines(8, chaqueSemaine, 68)))), 'temps')).not.toBeNull();
    const s = semaines(8, (k) => ({ a: k !== 0, b: false }), 68);
    expect(constat(Eq.analyser(e(bati(s))), 'temps')).toBeNull();
  });
  test('moins de 75 % des séries prévues : 17 sur 26 est écourtée, 20 sur 26 ne l’est pas', () => {
    const vingt = Object.assign({}, EXOS_A, { oiseau: 0, elevations_laterales: 0, extension_triceps: 0, curl: 0, developpe_militaire_barre: 3, tractions: 3 });   // 4+4+3+3 = 14… voir ci-dessous
    const sur = (n) => {
      // n séries de travail sur les 26 de « Haut A » : le couché d’abord, puis le rowing, etc.
      const exos = {}; let reste = n;
      Object.keys(EXOS_A).forEach((slug) => { const k = Math.min(EXOS_A[slug], reste); if (k > 0) exos[slug] = k; reste -= k; });
      return exos;
    };
    const avec = (n) => {
      const s = {};
      for (let k = 0; k < 8; k++) s[k] = [{ routine: 'r-a', jour: 0, exos: sur(n), minutes: 68 }, { routine: 'r-b', jour: 2, exos: sur(n) && COURTE_B, minutes: 68 }];
      return Eq.analyser(e(bati(s)));
    };
    expect(vingt).toBeDefined();
    // 19 séries : 19 < 0,75 × 26 = 19,5 → écourtée ; 20 : non. (B reste écourtée dans les deux cas : on lit le seul seuil de A.)
    const nombreA = (n) => constat(avec(n), 'temps') && constat(avec(n), 'temps').nEcourtees;
    expect(nombreA(19)).toBe(16);
    expect(nombreA(20)).toBe(8);
  });
  test('« J’ai peu de temps » (le geste) compte comme écourtée, même avec toutes les séries', () => {
    const s = {};
    for (let k = 0; k < 8; k++) s[k] = [{ routine: 'r-a', jour: 0, exos: EXOS_A, minutes: 65, gestes: [{ geste: 'raccourci', retires: [] }] },
                                        { routine: 'r-b', jour: 2, exos: EXOS_B, minutes: 60, gestes: [{ geste: 'raccourci', retires: [] }] }];
    const c = carte(Eq.analyser(e(bati(s))), 'temps');
    expect(c).not.toBeNull();
    expect(c.minutes).toBe(65);
  });
  test('⚠️ une séance LONGUE ne déclenche jamais rien (plus de séries que la routine prévoit)', () => {
    const doubles = (exos) => Object.keys(exos).reduce((o, k) => Object.assign(o, { [k]: exos[k] * 2 }), {});
    const s = {};
    for (let k = 0; k < 8; k++) s[k] = [{ routine: 'r-a', jour: 0, exos: doubles(EXOS_A), minutes: 130 }, { routine: 'r-b', jour: 2, exos: doubles(EXOS_B), minutes: 120 }];
    const a = Eq.analyser(e(bati(s)));
    expect(constat(a, 'temps')).toBeNull();
  });
  test('les semaines allégées ne comptent pas : toutes les séances écourtées sont dans une période allégée', () => {
    const b = bati(semaines(8, () => ({ a: true, b: true }), 68));
    expect(carte(Eq.analyser(e(b)), 'temps')).not.toBeNull();
    const a = Eq.analyser(e(b, { periodesAllegees: [{ debut: '2026-06-01', fin: '2026-10-31' }] }));
    expect(constat(a, 'temps')).toBeNull();
  });
  test('au moins N semaines différentes, N suit le réglage : 4 semaines — Me pousser (4) parle, Normal (5) et Me ménager (6) se taisent', () => {
    // Les 4 semaines écourtées le sont en entier (8 séances sur 16 : la moitié) ; les 4 autres sont entières.
    const b = bati(semaines(8, (k) => ({ a: k < 4, b: k < 4 }), 68));
    const ev = (r) => Eq.analyser(e(b, { reglage: r }));
    expect(carte(ev('franc'), 'temps')).not.toBeNull();
    expect(carte(ev('normal'), 'temps')).toBeNull();
    expect(carte(ev('prudent'), 'temps')).toBeNull();
    expect(constat(ev('prudent'), 'temps').habitude.tenu).toBe(4);       // le fait ne change pas
  });
  test('sans durée mesurable (pas de fin de séance), rien à proposer : pas de carte, jamais une durée devinée', () => {
    const a = Eq.analyser(e(bati(semaines(8, () => ({ a: true, b: true }), undefined))));
    expect(constat(a, 'temps')).toBeNull();
  });
  test('la structure bouge : une routine plus longue ou plus courte ne change pas la règle (75 % de SES séries)', () => {
    const grosse = routine('r-a', 'Haut A', Object.keys(EXOS_A).reduce((o, k) => Object.assign(o, { [k]: EXOS_A[k] + 1 }), {}));   // 34 séries
    const a = Eq.analyser(e(bati(semaines(8, () => ({ a: true, b: true }), 68)), { routines: [grosse, RB] }));
    expect(carte(a, 'temps').nEcourtees).toBe(16);
  });
  test('Juste un carnet : aucune carte ; le constat reste lisible', () => {
    const a = Eq.analyser(e(bati(semaines(8, () => ({ a: true, b: true }), 68)), { intention: 'entretien' }));
    expect(a.cartes).toEqual([]);
    expect(constat(a, 'temps')).not.toBeNull();
  });
});

// ══ LA FRÉQUENCE ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe('188-2 — Tes priorités, combien de fois par semaine', () => {
  const A = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3 };
  const B = { squat_barre: 4, souleve_de_terre_roumain: 3, leg_curl: 3, leg_extension: 3 };
  const RA = routine('r-a', 'Haut A', A), RB = routine('r-b', 'Bas B', B);
  // 8 semaines : A chaque semaine ; B chaque semaine ; `enB(k)` : ajoute des exercices à B cette semaine-là.
  function sem(enB, enA) {
    const s = {};
    for (let k = 0; k < 8; k++) s[k] = [{ routine: 'r-a', jour: 0, exos: Object.assign({}, A, enA ? enA(k) : {}) }, { routine: 'r-b', jour: 2, exos: Object.assign({}, B, enB ? enB(k) : {}) }];
    return s;
  }
  const e = (b, extra) => entree(b, Object.assign({ routines: [RA, RB], priorites: ['tractions'] }, extra || {}));

  test('une priorité faite une fois par semaine : la carte, la table (fois / sem.), le repère de Grgic 2018', () => {
    const a = Eq.analyser(e(bati(sem())));
    const c = carte(a, 'frequence');
    expect(c).not.toBeNull();
    expect(c.famille).toBe('frequence');
    expect(c.lignes).toEqual([{ libelle: 'Tractions', texte: '1 fois / sem.', cle: 'tractions' }]);
    expect(c.repere).toMatch(/deux fois par semaine font mieux qu’une \(Grgic, 2018\)/);
    expect(JSON.stringify(c)).not.toMatch(/Schoenfeld/);       // Schoenfeld 2019 dit que la fréquence compte peu pour l'hypertrophie : pas pour la force
  });
  test('⚠️ le seuil 1,5 des deux côtés : 11 séances sur 8 semaines (1,375) est un écart, 12 (1,5) n’en est pas un', () => {
    const treize = (k) => ({ tractions: [0, 2, 4].indexOf(k) >= 0 ? 3 : 0 });                  // tractions en B 3 semaines : 8 + 3 = 11
    const douze = (k) => ({ tractions: [0, 2, 4, 6].indexOf(k) >= 0 ? 3 : 0 });                // 4 semaines : 8 + 4 = 12
    expect(constat(Eq.analyser(e(bati(sem(treize)))), 'frequence')).not.toBeNull();
    expect(constat(Eq.analyser(e(bati(sem(douze)))), 'frequence')).toBeNull();
  });
  test('deux fois chaque semaine : rien', () => {
    expect(constat(Eq.analyser(e(bati(sem(() => ({ tractions: 3 }))))), 'frequence')).toBeNull();
  });
  test('la proposition : « Ajouter … à Bas B » (une priorité), ou « Répartir mes priorités sur deux jours » (plusieurs)', () => {
    const une = carte(Eq.analyser(e(bati(sem()))), 'frequence');
    expect(une.propositions.map((p) => [p.type, p.routine_id, p.slug])).toEqual([['ajouter', 'r-b', 'tractions']]);
    expect(une.propositions[0].series).toBe(2);              // la moitié de ce qu’il fait d’habitude (3), jamais un nombre fixe
    const deux = carte(Eq.analyser(e(bati(sem()), { priorites: ['tractions', 'developpe_militaire_barre'] })), 'frequence');
    expect(deux.propositions[0].type).toBe('repartir');
    expect(deux.propositions[0].libelle).toBe('Répartir mes priorités sur deux jours');
    expect(deux.propositions[0].ajouts.map((x) => x.slug).sort()).toEqual(['developpe_militaire_barre', 'tractions']);
  });
  test('⚠️ le soulevé de terre : une fois par semaine suffit si un 2ᵉ jour porte une charnière plus légère (hip thrust)', () => {
    const e2 = (b) => entree(b, { routines: [RA, RB], priorites: ['souleve_de_terre_barre'] });
    const sd = (k) => ({ souleve_de_terre_barre: 3 });
    // avec une charnière légère le 2ᵉ jour (A) : 1 + 1 = 2 → rien
    const avec = bati(sem(sd, () => ({ hip_thrust: 3 })));
    expect(constat(Eq.analyser(e2(avec)), 'frequence')).toBeNull();
    // sans : une carte, dont la proposition est la VARIANTE légère — jamais un second soulevé lourd
    const sans = Eq.analyser(e2(bati(sem(sd))));
    const c = carte(sans, 'frequence');
    expect(c).not.toBeNull();
    expect(c.propositions).toHaveLength(1);
    expect(c.propositions[0]).toMatchObject({ type: 'ajouter', routine_id: 'r-a' });
    expect(c.propositions[0].slug).not.toBe('souleve_de_terre_barre');
    expect(['hip_thrust', 'souleve_de_terre_roumain']).toContain(c.propositions[0].slug);
    expect(c.causes.map((x) => x.texte).join(' ')).toMatch(/jamais un second soulevé lourd/);
  });
  test('seules les priorités-mouvements se mesurent : un muscle prioritaire ne donne pas de ligne', () => {
    expect(constat(Eq.analyser(e(bati(sem()), { priorites: ['bras'] })), 'frequence')).toBeNull();
  });
  test('l’habitude suit le réglage et Juste un carnet se tait', () => {
    expect(carte(Eq.analyser(e(bati(sem()), { reglage: 'prudent' })), 'frequence')).not.toBeNull();   // 8 semaines à ≤ 1 fois : l’habitude est là, même à 6
    expect(Eq.analyser(e(bati(sem()), { intention: 'entretien' })).cartes).toEqual([]);
  });
});

// ══ L'ORDRE ════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('188-2 — L’ordre dans tes séances', () => {
  const sem = (a, b) => { const s = {}; for (let k = 0; k < 8; k++) s[k] = [{ routine: 'r-a', jour: 0, exos: a }, { routine: 'r-b', jour: 2, exos: b }]; return s; };
  const B = { squat_barre: 4, souleve_de_terre_roumain: 3, leg_extension: 3, leg_curl: 3, releves_mollets: 3 };

  test('cas 1 — un gros mouvement dans le dernier tiers : « La mettre en premier » (Simão 2012)', () => {
    const A = { developpe_couche_barre: 4, rowing_barre: 4, developpe_militaire_barre: 3, curl: 3, extension_triceps: 3, tractions: 3 };
    const RA = routine('r-a', 'Haut A', A), RB = routine('r-b', 'Bas B', B);
    const a = Eq.analyser(entree(bati(sem(A, B)), { routines: [RA, RB], priorites: ['tractions'] }));
    const c = constat(a, 'ordre');
    expect(c).not.toBeNull();
    expect(c.items[0]).toMatchObject({ slug: 'tractions', cas: 'gros' });
    expect(c.fait).toBe('Tractions arrive en moyenne dans le dernier tiers de tes séances.');
    expect(c.repere).toMatch(/Simão, 2012/);
    expect(c.propositions.map((p) => [p.type, p.libelle, p.slug, p.avant])).toEqual([['deplacer', 'La mettre en premier dans « Haut A »', 'tractions', 'developpe_couche_barre']]);
  });
  test('cas 2 — une isolation d’un muscle qui travaille aussi dans les gros mouvements : « juste après les gros mouvements », jamais avant', () => {
    const A = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3, extension_triceps: 3 };
    const RA = routine('r-a', 'Haut A', A), RB = routine('r-b', 'Bas B', B);
    const c = constat(Eq.analyser(entree(bati(sem(A, B)), { routines: [RA, RB], priorites: ['bras'] })), 'ordre');
    const ext = c.items.filter((x) => x.slug === 'extension_triceps')[0];
    expect(ext.cas).toBe('synergiste');
    const p = c.propositions.filter((x) => x.slug === 'extension_triceps')[0];
    expect(p.libelle).toBe('La placer juste après les gros mouvements de « Haut A »');
    expect(p.avant).toBe('curl');                       // placée devant le curl : juste après le dernier gros mouvement (le militaire)
    // Le curl est déjà juste après eux : aucune proposition pour lui.
    expect(c.propositions.filter((x) => x.slug === 'curl')).toEqual([]);
    // Jamais « en premier » pour une isolation synergiste.
    c.propositions.forEach((x) => expect(x.libelle).not.toMatch(/en premier/));
  });
  test('cas 3 — une isolation sans lien (mollets) : « La mettre en premier »', () => {
    const A = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3 };
    const RA = routine('r-a', 'Haut A', A), RB = routine('r-b', 'Bas B', B);
    const c = constat(Eq.analyser(entree(bati(sem(A, B)), { routines: [RA, RB], priorites: ['jambes'] })), 'ordre');
    const m = c.items.filter((x) => x.slug === 'releves_mollets')[0];
    expect(m.cas).toBe('sans_lien');
    const p = c.propositions.filter((x) => x.slug === 'releves_mollets')[0];
    expect(p).toMatchObject({ type: 'deplacer', avant: 'squat_barre' });
    expect(p.libelle).toBe('La mettre en premier dans « Bas B »');
  });
  test('sinon la ligne calme « Bien placées »', () => {
    const A = { tractions: 3, developpe_couche_barre: 4, rowing_barre: 4, developpe_militaire_barre: 3 };
    const RA = routine('r-a', 'Haut A', A), RB = routine('r-b', 'Bas B', B);
    const a = Eq.analyser(entree(bati(sem(A, B)), { routines: [RA, RB], priorites: ['tractions'] }));
    expect(constat(a, 'ordre')).toBeNull();
    expect(a.calmes.filter((x) => x.cle === 'ordre')[0].texte).toMatch(/^Bien placées/);
  });
  test('la structure bouge : avec 3 ou avec 9 exercices, c’est la part de la séance qui compte (le dernier tiers)', () => {
    const court = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3 };                                    // tractions dernier sur 3
    const long = { developpe_couche_barre: 4, rowing_barre: 4, developpe_militaire_barre: 3, curl: 3, extension_triceps: 3, elevations_laterales: 3, oiseau: 3, leg_curl: 2, tractions: 3 };
    [court, long].forEach((A) => {
      const c = constat(Eq.analyser(entree(bati(sem(A, B)), { routines: [routine('r-a', 'Haut A', A), routine('r-b', 'Bas B', B)], priorites: ['tractions'] })), 'ordre');
      expect(c).not.toBeNull();
    });
  });
  test('une séance de moins de 3 exercices ne se juge pas (rien à ordonner)', () => {
    const deux = { rowing_barre: 4, tractions: 3 };
    expect(constat(Eq.analyser(entree(bati(sem(deux, deux)), { routines: [routine('r-a', 'Haut A', deux), routine('r-b', 'Bas B', deux)], priorites: ['tractions'] })), 'ordre')).toBeNull();
  });
});

// ══ LE RÉGLAGE, L'ORDRE DES CARTES, LA VOIX, LA PURETÉ ═══════════════════════════════════════════════════════════
describe('188-2 — la mécanique commune', () => {
  const A = { developpe_couche_barre: 4, rowing_barre: 4, developpe_militaire_barre: 3, curl: 3, extension_triceps: 3, tractions: 3 };
  const B = { squat_barre: 4, souleve_de_terre_roumain: 3, leg_extension: 3 };
  const base = (extra) => {
    const s = {};
    for (let k = 0; k < 8; k++) s[k] = [{ routine: 'r-a', jour: 0, exos: A, minutes: 60 }, { routine: 'r-b', jour: 2, exos: B, minutes: 60 }];
    return entree(bati(s), Object.assign({ routines: [routine('r-a', 'Haut A', A), routine('r-b', 'Bas B', B)], priorites: ['tractions'], seancesParSemaine: 4 }, extra || {}));
  };
  test('l’ordre des cartes : les jours d’abord, puis la fréquence, puis l’ordre ; le nombre suit le réglage (1, 2, 3)', () => {
    const franc = Eq.analyser(base({ reglage: 'franc' }));
    expect(franc.cartes.map((c) => c.cle)).toEqual(['jours', 'frequence', 'ordre']);
    expect(Eq.analyser(base({ reglage: 'normal' })).cartes.map((c) => c.cle)).toEqual(['jours', 'frequence']);
    expect(Eq.analyser(base({ reglage: 'prudent' })).cartes.map((c) => c.cle)).toEqual(['jours']);
    expect(Eq.ORDRE_DES_FAMILLES).toEqual(['jours', 'temps', 'equilibre', 'frequence', 'ordre']);
  });
  test('la ligne de l’écran Séances reste celle des équilibres : une carte des jours n’y parle pas', () => {
    expect(Eq.analyser(base({ reglage: 'franc' })).ligne).toBeNull();
  });
  test('les faits ne changent pas selon le réglage', () => {
    const f = (r) => JSON.stringify(Eq.analyser(base({ reglage: r })).constats.map((c) => [c.cle, c.fait, c.causes && c.causes.map((x) => x.texte)]));
    expect(f('prudent')).toBe(f('franc'));
  });
  test('rien n’est modifié : l’entrée est identique après l’analyse, et deux analyses se répondent', () => {
    const e = base({ reglage: 'franc' });
    const avant = JSON.stringify(e);
    const a1 = JSON.stringify(Eq.analyser(e)), a2 = JSON.stringify(Eq.analyser(e));
    expect(JSON.stringify(e)).toBe(avant);
    expect(a1).toBe(a2);
  });
  test('les textes passent les règles de la voix (pas de reproche, de compliment, de « vous », de point décimal)', () => {
    const regles = require('./fixtures/voix-regles-181.json').interdits;
    const lettre = '[\\wÀ-ÿ]';
    const res = regles.map((r) => new RegExp(r.motif.replace(/^\\b/, '(?<!' + lettre + ')').replace(/\\b$/, '(?!' + lettre + ')').replace(/\\w\*/g, lettre + '*'), r.drapeaux));
    // Une semaine qui fait parler les quatre : jours, temps, fréquence, ordre.
    const a = Eq.analyser(base({ reglage: 'franc' }));
    const temps = Eq.analyser((() => {
      const EXOS_A = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3, extension_triceps: 3, elevations_laterales: 3, oiseau: 3 };
      const s = {};
      for (let k = 0; k < 8; k++) s[k] = [{ routine: 'r-a', jour: 0, exos: { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3 }, minutes: 68 }];
      for (let k = 0; k < 8; k++) s[k].push({ routine: 'r-b', jour: 2, exos: { squat_barre: 4 }, minutes: 68 });
      return entree(bati(s), { routines: [routine('r-a', 'Haut A', EXOS_A), routine('r-b', 'Bas B', { squat_barre: 4, souleve_de_terre_roumain: 3, leg_extension: 3 })], reglage: 'franc', dureeSeanceMin: 90 });
    })());
    const phrases = [];
    a.constats.concat(a.cartes, temps.cartes).forEach((c) => {
      phrases.push(c.fait, c.repere, c.libelleRefus);
      (c.reperes || []).forEach((t) => phrases.push(t));
      (c.causes || []).forEach((x) => phrases.push(x.texte));
      (c.propositions || []).forEach((p) => phrases.push(p.libelle));
    });
    a.calmes.forEach((c) => phrases.push(c.texte));
    expect(temps.cartes.map((c) => c.cle)).toContain('temps');
    const ecartees = new Set([4]);   // « cran » : un mot du produit, admis
    const fautes = [];
    phrases.filter(Boolean).forEach((t) => {
      res.forEach((re, i) => {
        if (ecartees.has(i) || i === 10) return;
        if (re.test(t)) fautes.push([i, t]);
      });
    });
    expect(fautes).toEqual([]);
    expect(phrases.filter(Boolean).length).toBeGreaterThan(8);
  });
});

// ══ LA COMPRESSION (Iversen 2021) ═════════════════════════════════════════════════════════════════════════════════
describe('188-2 — la compression d’une séance : supersets, repos, une série de moins, puis une isolation', () => {
  const M = require('../../v2/js/moteur.js');
  const ex = (slug, o) => Object.assign({ slug, mesure: 'charge_reps', repos: 90, ch: 0, tr: 3, deg: 0, duree: null, prim: '', sec: '', equipement: null, groupe: null }, o || {});
  const BARRE = ex('squat_barre', { prim: 'quadriceps', sec: 'fessiers/ischio_jambiers/bas_du_dos', equipement: 'barre', repos: 240, tr: 4 });
  const ISO = (slug, prim, tr, repos) => ex(slug, { prim, tr, repos: repos || 90 });
  const TOUT = [BARRE, ex('presse_a_cuisses', { prim: 'quadriceps', sec: 'fessiers/ischio_jambiers', repos: 120 }),
                ISO('leg_curl', 'ischio_jambiers', 4), ISO('mollets', 'mollets', 4), ISO('adducteurs', 'adducteurs', 3), ISO('abducteurs', 'abducteurs', 3)];

  test('⚠️ jamais sous 2 séries, quelle que soit la cible', () => {
    const r = M.raccourcirRoutine(TOUT, 1);
    r.exercices.forEach((e) => { if (e.tr > 0) expect(e.tr).toBeGreaterThanOrEqual(2); });
    expect(r.tient).toBe(false);
  });
  test('⚠️ un grand mouvement (barre) garde toutes ses séries et son repos', () => {
    const r = M.raccourcirRoutine(TOUT, 1);
    const sq = r.exercices.filter((e) => e.slug === 'squat_barre')[0];
    expect(sq.tr).toBe(4);
    expect(sq.repos).toBe(240);
  });
  test('⚠️ un exercice exempté (une priorité) n’est jamais touché', () => {
    const r = M.raccourcirRoutine(TOUT, 1, ['leg_curl', 'mollets']);
    expect(r.exercices.filter((e) => e.slug === 'leg_curl')[0]).toMatchObject({ tr: 4, repos: 90 });
    expect(r.exercices.filter((e) => e.slug === 'mollets')[0]).toMatchObject({ tr: 4, repos: 90 });
  });
  test('l’ordre : les supersets d’abord, puis les repos, puis une série de moins, puis une isolation retirée', () => {
    const ordre = M.raccourcirRoutine(TOUT, 1).journal.map((j) => j.quoi);
    const premier = (q) => ordre.indexOf(q);
    expect(premier('superset')).toBeGreaterThanOrEqual(0);
    expect(premier('superset')).toBeLessThan(premier('repos'));
    expect(premier('repos')).toBeLessThan(premier('serie'));
    const retraits = ordre.map((q, i) => (q === 'retrait' ? i : -1)).filter((i) => i >= 0);
    if (retraits.length) expect(retraits[0]).toBeGreaterThan(ordre.lastIndexOf('serie'));
  });
  test('les repos d’isolation descendent à 90 puis 60 s, jamais plus bas', () => {
    const r = M.raccourcirRoutine([BARRE, ISO('leg_curl', 'ischio_jambiers', 3, 150)], 1);
    const lc = r.exercices.filter((e) => e.slug === 'leg_curl')[0];
    expect(lc.repos).toBeGreaterThanOrEqual(60);
  });
});

// ══ LE REPOS LONG (aucune carte : une ligne au « Pourquoi ») ══════════════════════════════════════════════════════
describe('188-2 — « Sur un gros mouvement, 2 min 30 à 3 min de repos aident. »', () => {
  const M = require('../../v2/js/moteur.js');
  const bon = () => ({ grand: true, stagne: true, chutes: [0.35, 0.4, 0.31], reposS: 75 });
  test('les trois conditions réunies : la ligne', () => {
    expect(M.reposAConseiller(bon())).toBe(true);
    expect(M.phraseReposLong()).toBe('Sur un gros mouvement, 2 min 30 à 3 min de repos aident.');
  });
  test('⚠️ il suffit d’une seule condition manquante pour se taire', () => {
    expect(M.reposAConseiller(Object.assign(bon(), { grand: false }))).toBe(false);
    expect(M.reposAConseiller(Object.assign(bon(), { stagne: false }))).toBe(false);
    expect(M.reposAConseiller(Object.assign(bon(), { reposS: 120 }))).toBe(false);
    expect(M.reposAConseiller(Object.assign(bon(), { reposS: null }))).toBe(false);
    expect(M.reposAConseiller(Object.assign(bon(), { chutes: [0.35, 0.4] }))).toBe(false);
    expect(M.reposAConseiller(Object.assign(bon(), { chutes: [0.35, 0.29, 0.4] }))).toBe(false);
  });
  test('les bornes : 30 % pile et 90 s pile comptent', () => {
    expect(M.reposAConseiller({ grand: true, stagne: true, chutes: [0.3, 0.3, 0.3], reposS: 90 })).toBe(true);
    expect(M.reposAConseiller({ grand: true, stagne: true, chutes: [0.3, 0.3, 0.3], reposS: 91 })).toBe(false);
  });
  test('le fait : la chute de la série 1 à la série 3, à la même charge, sur les séances récentes', () => {
    const F = require('../../v2/js/faits.js').creer();
    expect(typeof F.chutesDeReps).toBe('function');
    const jeu = {};
    const seance = (jour, reps) => {
      const id = 's' + jour;
      jeu[id] = reps.map((r, k) => ({ exercise_slug: 'squat_barre', type: 'travail', charge_kg: 100, reps: r, rang: k }));
      return { id, debut: '2026-10-' + String(jour).padStart(2, '0') + 'T08:00:00Z' };
    };
    const c = { seances: [seance(1, [10, 8, 7]), seance(8, [10, 8, 6]), seance(15, [10, 7, 5])], seriesDe: (id) => jeu[id] };
    expect(F.chutesDeReps(c, 'squat_barre', 3)).toEqual([0.5, 0.4, 0.3]);
    jeu.s8[2].charge_kg = 90;                       // une charge différente à la série 3 : la séance n’est pas comparable
    expect(F.chutesDeReps(c, 'squat_barre', 3)).toEqual([0.5, 0.3]);
  });
  test('I76 : une ligne du repos sans son fait est attrapée par verifierPlan', () => {
    const T = require('../../v2/js/plan.js');
    const plan = { exercices: [{ slug: 'squat_barre', pourquoi: { repos: M.phraseReposLong() }, reposLong: null }] };
    let erreurs = [];
    try { erreurs = T.verifierPlan(plan, {}).erreurs; } catch (err) { erreurs = ['(exception) ' + err.message]; }
    expect(erreurs.join(' ')).toMatch(/I76 — exercice 0 \(squat_barre\) : la ligne du repos sans son fait/);
  });
});
