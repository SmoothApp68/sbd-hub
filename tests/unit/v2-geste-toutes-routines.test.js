// 16/11/2026 (B) — UN EXERCICE COMPTÉ SUR TOUTES SES ROUTINES, AU MÊME RÔLE (MOTEUR §9.27 quater, I208, I209, I212, I217, I218, I219).
// Le rôle (`Routines.roleDansLaRoutine`), le décompte unique (la fenêtre du groupe, 3 sur 4, 2 semaines civiles), la carte
// transversale et sa portée, la clé `geste|<exercice>|<rôle>[|<vers>]`, « Garder » pour tout le programme, l'absorption par une
// carte d'équilibre, la signature d'« Annuler », et le cas réel du tapis d'Aurélien (données lues par Claude.ai le 16/11/2026).
process.env.TZ = 'Europe/Paris';
global.self = global;
const H = require('./helpers-equilibres.js');
const { Eq, CAT, construire, equilibrees, entree, routine, EXOS_A } = H;
const Routines = global.THRoutines;
const fs = require('fs');
const path = require('path');

const CATR = Object.assign({}, CAT, {
  tapis_de_course: { nom: 'Tapis de course', nature: 'cardio', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] },
  mobilite_hanches: { nom: 'Mobilité des hanches', nature: 'mobilite', muscles_primaires: ['fessiers'], muscles_secondaires: [], muscles_stabilisateurs: [] },
  gainage: { nom: 'Gainage', muscles_primaires: ['abdominaux'], muscles_secondaires: [], muscles_stabilisateurs: [] }
});
const ex = (slug, n, extra) => Object.assign({ exercise_slug: slug, groupe_superset: null,
  series: Array.from({ length: n || 3 }, () => ({ type_serie: 'travail', reps_visees: 10 })) }, extra || {});

describe('Routines.roleDansLaRoutine — le rôle par rapport au premier et au dernier exercice de volume', () => {
  const R = { id: 'r', exercices: [ex('tapis_de_course', 1), ex('squat_barre', 4), ex('leg_curl', 3), ex('tapis_de_course', 1)] };
  test('avant le premier : ouverture ; entre : travail ; après le dernier : fin ; absent : null', () => {
    expect(Routines.roleDansLaRoutine(R, 'tapis_de_course', CATR)).toBe('ouverture');   // la première occurrence
    expect(Routines.roleDansLaRoutine(R, 'squat_barre', CATR)).toBe('travail');
    expect(Routines.roleDansLaRoutine(R, 'leg_curl', CATR)).toBe('travail');
    expect(Routines.roleDansLaRoutine(R, 'curl', CATR)).toBe(null);
    const F = { id: 'f', exercices: [ex('squat_barre', 4), ex('tapis_de_course', 1)] };
    expect(Routines.roleDansLaRoutine(F, 'tapis_de_course', CATR)).toBe('fin');
  });
  test('contradicteur : la mobilité comptée en REPS en fin (avec un muscle primaire) est une finition — elle ne devient pas « le dernier exercice de travail »', () => {
    const M = { id: 'm', exercices: [ex('squat_barre', 4), ex('leg_curl', 3), ex('mobilite_hanches', 2)] };
    expect(Routines.roleDansLaRoutine(M, 'mobilite_hanches', CATR)).toBe('fin');
    expect(Routines.roleDansLaRoutine(M, 'leg_curl', CATR)).toBe('travail');
    // Et l'ajout d'un exercice par une carte se place AVANT elle (la même définition de la finition).
    expect(Routines.placeDAjout(M, 'curl', CATR).avant).toBe('mobilite_hanches');
  });
  test('contradicteur : une routine [tapis] seule — aucun exercice de volume : null (pas de carte transversale)', () => {
    expect(Routines.roleDansLaRoutine({ id: 't', exercices: [ex('tapis_de_course', 1)] }, 'tapis_de_course', CATR)).toBe(null);
  });
  test('contradicteur : un superset en fin — une finition liée au dernier exercice de travail prend le rôle de son bloc', () => {
    const S = { id: 's', exercices: [ex('squat_barre', 4), ex('leg_curl', 3, { groupe_superset: 1 }), ex('gainage', 3, { groupe_superset: 1 }), ex('tapis_de_course', 1)] };
    expect(Routines.roleDansLaRoutine(S, 'gainage', CATR)).toBe('travail');
    expect(Routines.roleDansLaRoutine(S, 'tapis_de_course', CATR)).toBe('fin');
    // Deux finitions en superset après le dernier exercice de travail : fin.
    const S2 = { id: 's2', exercices: [ex('squat_barre', 4), ex('gainage', 3, { groupe_superset: 1 }), ex('tapis_de_course', 1, { groupe_superset: 1 })] };
    expect(Routines.roleDansLaRoutine(S2, 'gainage', CATR)).toBe('fin');
  });
  test('séries, reps et zone ne séparent pas : le même rôle avec 1 ou 5 séries', () => {
    const a = { id: 'a', exercices: [ex('tapis_de_course', 1), ex('squat_barre', 4)] };
    const b = { id: 'b', exercices: [ex('tapis_de_course', 5, { zone: 'force' }), ex('squat_barre', 2)] };
    expect(Routines.roleDansLaRoutine(a, 'tapis_de_course', CATR)).toBe(Routines.roleDansLaRoutine(b, 'tapis_de_course', CATR));
  });
});

// ── LE CAS RÉEL (Aurélien) ─────────────────────────────────────────────────────────────────────────────────────────────────
// Le tapis est le 1er exercice de ses 5 routines ; retiré à la main le 10/11 (Bas A), le 12/11 (Haut B), le 13/11 (Bas B), le 16/11
// (Bas A) ; la séance Haut A du 09/11 n'a aucun geste.
const HAUT = { developpe_couche_barre: 4, rowing_barre: 4 };
const BAS = { squat_barre: 4, leg_curl: 3 };
const avecTapis = (id, nom, exos) => {
  const r = routine(id, nom, Object.assign({ tapis_de_course: 1 }, exos));
  return r;
};
const ROUT5 = [avecTapis('ha', 'Haut A', HAUT), avecTapis('ba', 'Bas A', BAS), avecTapis('hb', 'Haut B', HAUT),
  avecTapis('bb', 'Bas B', BAS), avecTapis('fc', 'Full C', { squat_barre: 3, developpe_couche_barre: 3 })];
function seanceDu(id, jour, rid, exos, gestes) {
  return { s: { id, debut: jour + 'T17:00:00.000Z', fin: jour + 'T18:15:00.000Z', statut: 'terminee', routine_id: rid, gestes: gestes || [] }, exos };
}
function casReel(tapisHautA) {
  const RT = [{ geste: 'retrait', slug: 'tapis_de_course' }];
  const liste = [
    seanceDu('s09', '2026-11-09', 'ha', Object.assign(tapisHautA ? { tapis_de_course: 1 } : {}, HAUT)),
    seanceDu('s10', '2026-11-10', 'ba', BAS, RT),
    seanceDu('s12', '2026-11-12', 'hb', HAUT, RT),
    seanceDu('s13', '2026-11-13', 'bb', BAS, RT),
    seanceDu('s16', '2026-11-16', 'ba', BAS, RT)
  ];
  const seances = [], series = [];
  liste.forEach(({ s, exos }) => {
    seances.push(s);
    Object.keys(exos).forEach((slug) => { for (let i = 0; i < exos[slug]; i++) series.push({ id: s.id + slug + i, session_id: s.id, exercise_slug: slug, type_serie: 'travail', reps: 8, charge_kg: 50 }); });
  });
  return entree({ seances, series }, { jour: '2026-11-16', reglage: 'franc', catalogue: CATR, routines: ROUT5 });
}
const gestes = (a) => a.cartes.filter((c) => c.kind === 'geste');
const nbsp = (t) => String(t).replace(/[  ]/g, ' ');

describe('le cas réel : le tapis, en début de séance, sur 3 routines', () => {
  [true, false].forEach((fait) => {
    test('Haut A du 09/11 ' + (fait ? 'avec' : 'sans') + ' le tapis : la fenêtre est 16, 13, 12, 10 → 4 sur 4, une carte transversale', () => {
      const e = casReel(fait);
      const a = Eq.analyser(e);
      const c = gestes(a);
      expect(c.length).toBe(1);
      expect(c[0].cle).toBe('geste|tapis_de_course|ouverture');
      expect(c[0].geste.transversal).toBe(true);
      expect(c[0].geste.routines.slice().sort()).toEqual(['ba', 'bb', 'hb']);
      expect(c[0].geste.seances).toEqual(['s16', 's13', 's12', 's10']);
      expect(nbsp(c[0].fait)).toBe('Tu as retiré Tapis de course, en début de séance, 4 fois sur tes 4 dernières séances de ces routines : 2 en « Bas A », 1 en « Bas B », 1 en « Haut B ».');
      expect(c[0].phrases[1]).toBe('Je peux l’enlever de ces 3 routines.');
      expect(c[0].propositions.map((p) => p.libelle)).toEqual(['Retirer des 3 routines', 'Garder Tapis de course']);
      expect(nbsp(c[0].propositions[0].fait)).toBe('C’est fait : Tapis de course retiré de « Bas A », « Haut B » et « Bas B ».');
      expect(c[0].propositions[1].fait).toBe('Noté : je garde Tapis de course en début de séance dans tes routines et je ne te le redemande plus.');
      expect(c[0].propositions[0].routines.slice().sort()).toEqual(['ba', 'bb', 'hb']);
      expect(Eq.verifierGestes(e, a)).toEqual([]);
      // L'accueil : la même carte, le fait en une phrase, le détail replié.
      const acc = Eq.carteDeLAccueil(a, {}, '2026-11-16', { routinesPretes: true });
      expect(acc.carte).toBe(c[0]);
      expect(acc.fait).toBe('Tu as retiré Tapis de course, en début de séance, 4 fois sur tes 4 dernières séances qui le prévoient.');
      expect(acc.detail).toEqual(['2 en « Bas A », 1 en « Bas B », 1 en « Haut B ».', 'Je peux l’enlever de ces 3 routines.']);
    });
  });
});

describe('le décompte unique : la fenêtre, le seuil des 2 semaines, la portée (I208, I212, I218)', () => {
  test('3 retraits dans la MÊME semaine civile : rien (une semaine de panne ne suffit pas)', () => {
    const e = casReel(true);
    // Toutes les séances dans la semaine du 09/11.
    e.seances = e.seances.map((s) => (s.id === 's16' ? Object.assign({}, s, { debut: '2026-11-14T10:00:00.000Z', fin: '2026-11-14T11:00:00.000Z' }) : s));
    expect(gestes(Eq.analyser(Object.assign({}, e, { jour: '2026-11-15' })))).toEqual([]);
  });
  test('une routine dont une séance de la fenêtre a fait l’exercice : nommée dans le décompte, HORS de la portée', () => {
    const e = casReel(true);
    // Le 10/11 en Bas A : le tapis fait (aucun geste) ; Bas A garde 1 retrait sur 2 → hors portée.
    e.seances = e.seances.map((s) => (s.id === 's10' ? Object.assign({}, s, { gestes: [] }) : s));
    e.series = e.series.concat([{ id: 's10tap', session_id: 's10', exercise_slug: 'tapis_de_course', type_serie: 'travail', reps: null, duree_s: 600 }]);
    const a = Eq.analyser(e);
    const c = gestes(a)[0];
    expect(c.geste.k).toBe(3);
    expect(c.geste.routines.slice().sort()).toEqual(['bb', 'hb']);
    expect(nbsp(c.fait)).toBe('Tu as retiré Tapis de course, en début de séance, 3 fois sur tes 4 dernières séances de ces routines : 1 en « Bas A », 1 en « Bas B », 1 en « Haut B ».');
    expect(c.phrases[1]).toBe('Je peux l’enlever de « Haut B » et « Bas B ».');
    expect(c.propositions[0].libelle).toBe('Retirer des 2 routines');
    expect(Eq.verifierGestes(e, a)).toEqual([]);
    // La relecture voit une portée fausse.
    const faux = JSON.parse(JSON.stringify(a));
    gestes(faux)[0].geste.routines = ['ba', 'bb', 'hb'];
    expect(Eq.verifierGestes(e, faux).some((f) => /^I218/.test(f))).toBe(true);
  });
  test('« fait ce jour-là » : un tapis REFAIT dans la séance malgré le retrait ne compte pas (le décompte et la relecture lisent la même fonction)', () => {
    const e = casReel(true);
    e.series = e.series.concat([{ id: 's12tap', session_id: 's12', exercise_slug: 'tapis_de_course', type_serie: 'travail', duree_s: 600 }]);
    const a = Eq.analyser(e);
    const c = gestes(a)[0];
    expect(c.geste.k).toBe(3);
    expect(c.geste.routines.slice().sort()).toEqual(['ba', 'bb']);   // Haut B : sa seule séance l'a fait
    // Le même tapis refait le 16/11 : les 3 retraits restants tombent dans la même semaine civile → rien.
    const e2 = casReel(true);
    e2.series = e2.series.concat([{ id: 's16tap', session_id: 's16', exercise_slug: 'tapis_de_course', type_serie: 'travail', duree_s: 600 }]);
    expect(gestes(Eq.analyser(e2))).toEqual([]);
    expect(Eq.verifierGestes(e, a)).toEqual([]);
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/equilibres.js'), 'utf8');
    expect((src.match(/exerciceFaitDansLaSeance\(/g) || []).length).toBeGreaterThanOrEqual(4);   // déclarée, le décompte, les remplaçants, la relecture
  });
  test('deux rôles = deux décomptes : le tapis en début dans deux routines, en fin dans deux autres — jamais un groupe mêlé (I217)', () => {
    const debut = [avecTapis('a1', 'A1', BAS), avecTapis('a2', 'A2', BAS)];
    const fin = [routine('f1', 'F1', Object.assign({}, BAS, { tapis_de_course: 1 })), routine('f2', 'F2', Object.assign({}, BAS, { tapis_de_course: 1 }))];
    const RT = [{ geste: 'retrait', slug: 'tapis_de_course' }];
    const s = [['a1', '2026-11-02'], ['f1', '2026-11-03'], ['a2', '2026-11-09'], ['f2', '2026-11-10']];
    const seances = s.map(([rid, j], i) => ({ id: 'x' + i, debut: j + 'T17:00:00.000Z', statut: 'terminee', routine_id: rid, gestes: RT }));
    const series = [];
    seances.forEach((x) => Object.keys(BAS).forEach((slug) => series.push({ id: x.id + slug, session_id: x.id, exercise_slug: slug, type_serie: 'travail', reps: 8, charge_kg: 50 })));
    const e = entree({ seances, series }, { jour: '2026-11-11', catalogue: CATR, routines: debut.concat(fin) });
    // Chaque rôle n'a que 2 séances : aucune carte (un groupe mêlé en aurait vu 4 sur 4).
    expect(gestes(Eq.analyser(e))).toEqual([]);
  });
  test('une seule routine touchée : la carte de la routine (les mots d’avant), même clé `geste|exercice|rôle`', () => {
    const e = casReel(true);
    e.seances = e.seances.map((s) => (s.id === 's12' || s.id === 's13' ? Object.assign({}, s, { gestes: [] }) : s));
    e.series = e.series.concat(['s12', 's13'].map((id) => ({ id: id + 'tap', session_id: id, exercise_slug: 'tapis_de_course', type_serie: 'travail', duree_s: 600 })));
    const RT = [{ geste: 'retrait', slug: 'tapis_de_course' }];
    // Bas A : 4 séances, 3 retraits sur 2 semaines.
    const plus = [['s03', '2026-11-03'], ['s05', '2026-11-05']].map(([id, j]) => ({ id, debut: j + 'T17:00:00.000Z', statut: 'terminee', routine_id: 'ba', gestes: id === 's03' ? RT : [] }));
    e.seances = e.seances.concat(plus);
    e.series = e.series.concat(plus.reduce((t, x) => t.concat(Object.keys(BAS).map((slug) => ({ id: x.id + slug, session_id: x.id, exercise_slug: slug, type_serie: 'travail', reps: 8, charge_kg: 50 }))), []))
      .concat([{ id: 's05tap', session_id: 's05', exercise_slug: 'tapis_de_course', type_serie: 'travail', duree_s: 600 }]);
    const a = Eq.analyser(e);
    const c = gestes(a);
    expect(c.length).toBe(1);
    expect(c[0].cle).toBe('geste|tapis_de_course|ouverture');
    expect(c[0].geste.transversal).toBe(false);
    expect(c[0].fait).toBe('Tu as retiré Tapis de course 3 fois sur tes 4 dernières séances « Bas A ».');
    expect(c[0].propositions[0].libelle).toBe('Retirer de « Bas A »');
    expect(Eq.verifierGestes(e, a)).toEqual([]);
  });
});

describe('les réponses : « Garder » pour (exercice, rôle) sur tout le programme, la clé, « Pas maintenant » (I209)', () => {
  test('« Garder » posé sur le rôle : plus aucune carte pour le tapis en début de séance, dans aucune routine', () => {
    const cartes = Eq.reponseAuGeste({}, 'ouverture', 'tapis_de_course', 'garder');
    expect(gestes(Eq.analyser(Object.assign(casReel(true), { cartes })))).toEqual([]);
    // « Ce que le coach a retenu » le dit pour tout le programme ; « Effacer » le retire.
    expect(Eq.gestesRetenus(cartes)).toEqual([{ routine_id: 'ouverture', slug: 'tapis_de_course', r: 'garder', role: 'ouverture' }]);
    const efface = Eq.reponseAuGeste(cartes, 'ouverture', 'tapis_de_course', null);
    expect(gestes(Eq.analyser(Object.assign(casReel(true), { cartes: efface }))).length).toBe(1);
    // Un autre rôle n'est pas gardé.
    expect(Eq.analyser(Object.assign(casReel(true), { cartes: Eq.reponseAuGeste({}, 'fin', 'tapis_de_course', 'garder') })).cartes.length).toBe(1);
  });
  test('une réponse d’avant (sous l’identifiant d’une routine) vaut encore pour les routines qu’elle nomme', () => {
    const cartes = Eq.reponseAuGeste({}, 'hb', 'tapis_de_course', 'garder');
    expect(gestes(Eq.analyser(Object.assign(casReel(true), { cartes })))).toEqual([]);
  });
  test('« Pas maintenant » sur la carte transversale : la même clé la fait taire (une carte absorbée ne revient pas sous une autre clé)', () => {
    const cle = 'geste|tapis_de_course|ouverture';
    const cartes = { [cle]: Eq.reponse({}, cle, 'non', '2026-11-16') };
    expect(gestes(Eq.analyser(Object.assign(casReel(true), { cartes })))).toEqual([]);
  });
  test('la réponse datée d’un geste vise le rôle (le groupe) et la clé de la carte', () => {
    const t = Eq.reponseAuGesteDatee({}, 'geste|tapis_de_course|ouverture', 'ouverture', 'tapis_de_course', 'retirer', '2026-11-16');
    expect(t).toEqual({ geste_routine: { ouverture: { tapis_de_course: 'retirer' } }, 'geste|tapis_de_course|ouverture': { r: 'oui', le: '2026-11-16', refus: 0 } });
  });
});

describe('le remplacement par le même, sur plusieurs routines', () => {
  test('A → le MÊME B dans deux routines : « Remplacer dans les 2 routines », portée sans celles qui ont déjà B', () => {
    const CAT2 = Object.assign({}, CATR, { curl_marteau: { nom: 'Curl Marteau', muscles_primaires: ['biceps'], muscles_secondaires: [], muscles_stabilisateurs: [] } });
    const exos = { developpe_couche_barre: 3, curl: 3, extension_triceps: 3 };
    const R1 = routine('r1', 'Bras 1', exos), R2 = routine('r2', 'Bras 2', exos), R3 = routine('r3', 'Bras 3', Object.assign({}, exos, { curl_marteau: 2 }));
    const RP = [{ geste: 'remplacement', slug: 'curl', vers: 'curl_marteau' }];
    const plan = [['r1', '2026-11-02', true], ['r2', '2026-11-04', true], ['r1', '2026-11-09', true], ['r2', '2026-11-11', false], ['r3', '2026-11-12', false]];
    const seances = [], series = [];
    plan.forEach(([rid, j, remp], i) => {
      const id = 'p' + i;
      seances.push({ id, debut: j + 'T17:00:00.000Z', statut: 'terminee', routine_id: rid, gestes: remp ? RP : [] });
      const faits = Object.assign({ developpe_couche_barre: 3, extension_triceps: 3 }, remp ? { curl_marteau: 3 } : { curl: 3 });
      Object.keys(faits).forEach((slug) => { for (let k = 0; k < faits[slug]; k++) series.push({ id: id + slug + k, session_id: id, exercise_slug: slug, type_serie: 'travail', reps: 10, charge_kg: 14 }); });
    });
    const e = entree({ seances, series }, { jour: '2026-11-13', catalogue: CAT2, routines: [R1, R2, R3] });
    const a = Eq.analyser(e);
    const c = gestes(a).filter((x) => x.geste.type === 'remplacement');
    expect(c.length).toBe(1);
    expect(c[0].cle).toBe('geste|curl|travail|curl_marteau');
    expect(c[0].geste.routines.slice().sort()).toEqual(['r1']);   // Bras 2 a une séance de la fenêtre avec le curl : hors portée
    expect(nbsp(c[0].fait)).toBe('Tu as remplacé Curl Biceps par Curl Marteau 3 fois sur tes 4 dernières séances de ces routines : 2 en « Bras 1 », 1 en « Bras 2 ».');
    expect(c[0].propositions[0].libelle).toBe('Remplacer dans « Bras 1 »');
    expect(Eq.verifierGestes(e, a)).toEqual([]);
  });
});

describe('l’absorption : un retrait sans report, du côté qui manque, devient une cause de la carte d’équilibre', () => {
  test('l’oiseau retiré 8 semaines (deltoïde postérieur à 0) : la carte du geste ne parle pas seule, son fait est une cause', () => {
    const sem = equilibrees(14, { a: (i) => (i < 8 ? { oiseau: 0 } : {}) });
    const b = construire(sem);
    b.seances.forEach((s) => {
      if (s.routine_id === 'r-a' && !b.series.some((x) => x.session_id === s.id && x.exercise_slug === 'oiseau')) s.gestes = [{ geste: 'retrait', slug: 'oiseau' }];
    });
    const a = Eq.analyser(entree(b, { reglage: 'franc' }));
    const zero = a.cartes.filter((c) => c.kind === 'zero' && c.muscle === 'deltoide_posterieur')[0];
    expect(!!zero).toBe(true);
    expect(gestes(a).filter((c) => c.geste.slug === 'oiseau')).toEqual([]);
    const absorbee = a.constats.filter((c) => c.kind === 'geste' && c.geste.slug === 'oiseau')[0];
    expect(absorbee.parle).toBe(false);
    expect(absorbee.absorbeePar).toBe(zero.cle);
    expect(zero.causes.some((x) => x.texte === absorbee.fait)).toBe(true);
    expect(zero.causes.some((x) => /Oiseau a été retiré à la main/.test(x.texte))).toBe(false);   // la cause générique remplacée, pas doublée
  });
});

describe('« Annuler » : la signature de ce que le geste a écrit (I219)', () => {
  test('la signature change si la routine change (séries, ordre, superset), pas pour un identifiant posé par la file', () => {
    const R = { exercices: [ex('squat_barre', 3), ex('leg_curl', 3)] };
    const s0 = Routines.signatureDesExercices(R.exercices);
    expect(Routines.signatureDesExercices(R.exercices.map((x, i) => Object.assign({}, x, { id: 'id' + i, rang: i })))).toBe(s0);
    expect(Routines.signatureDesExercices([R.exercices[1], R.exercices[0]])).not.toBe(s0);
    expect(Routines.signatureDesExercices([R.exercices[0], Object.assign({}, R.exercices[1], { series: R.exercices[1].series.slice(1) })])).not.toBe(s0);
    expect(Routines.signatureDesExercices([R.exercices[0], Object.assign({}, R.exercices[1], { groupe_superset: 2 })])).not.toBe(s0);
  });
  test('l’app : tout ou rien avant d’écrire, la signature relue à « Annuler », la phrase de la routine laissée', () => {
    const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const f = app.slice(app.indexOf('async function repondreAuGesteUneFois'), app.indexOf('// 188-2 — « RÉGLER MES SÉANCES'));
    // Toutes les routines voulues et vérifiées AVANT la première écriture.
    expect(f.indexOf('Equilibres.verifierRetrait(rt, voulues, p)')).toBeGreaterThan(0);
    const garde = f.indexOf('if (!voulues) { ecrites = null; break; }');
    expect(garde).toBeGreaterThan(0);
    expect(garde).toBeLessThan(f.indexOf('await poserRoutineVoulue(ecrites[k].rt'));
    expect(/Routines\.signatureDesExercices\(r2\.exercices\) !== ecrites\[j\]\.signature/.test(f)).toBe(true);
    expect(f.indexOf('a changé depuis : je ne la touche pas.')).toBeGreaterThan(0);
  });
});
