/** @jest-environment node */
//
// 188-1 — « TA SEMAINE ET TES ÉQUILIBRES » (MOTEUR §9.27) : les cartes d'équilibre et leur mécanique. Chaque fixture
// déclenche vraiment le chemin qu'elle nomme (le rapport, les semaines, les gestes). Pas un nombre fixe de séries ni
// d'exercices : les fixtures font varier les deux.

const H = require('./helpers-equilibres.js');
const { Eq, CAT, construire, equilibrees, entree, routine } = H;

// De quoi servir tous les autres muscles, pour que la carte testée soit la seule à parler.
const COMPL = { squat_barre: 4, souleve_de_terre_roumain: 2, leg_curl: 2, leg_extension: 4, hip_thrust: 2, oiseau: 1, elevations_laterales: 1, curl: 1, extension_triceps: 1 };
const constat = (a, cle) => a.constats.filter((c) => c.cle === cle)[0] || null;
const carte = (a, cle) => a.cartes.filter((c) => c.cle === cle)[0] || null;

// Un rapport tirage / poussée de a pour b, sur 12 semaines d'une séance chacune (12 séances : le minimum).
function rapportHorizontal(a, b, extra) {
  const sem = {};
  for (let i = 0; i < 12; i++) {
    const rowing = Math.floor(a / 12) + (i < a % 12 ? 1 : 0), couche = Math.floor(b / 12) + (i < b % 12 ? 1 : 0);
    const exos = {};
    if (rowing) exos.rowing_barre = rowing;
    if (couche) exos.developpe_couche_barre = couche;
    sem[i] = [{ routine: 'r-a', exos }];
  }
  return entree(construire(sem), extra);
}
function rapportChaine(a, b, extra) {
  const sem = {};
  for (let i = 0; i < 12; i++) {
    const post = Math.floor(a / 12) + (i < a % 12 ? 1 : 0), quad = Math.floor(b / 12) + (i < b % 12 ? 1 : 0);
    const exos = {};
    if (post) exos.leg_curl = post;
    if (quad) exos.leg_extension = quad;
    sem[i] = [{ routine: 'r-b', exos }];
  }
  return entree(construire(sem), extra);
}

describe('les seuils, des deux côtés', () => {
  test('tirage / poussée à l’horizontale : 0,59 est un écart, 0,61 n’en est pas un', () => {
    const bas = Eq.analyser(rapportHorizontal(59, 100));
    expect(constat(bas, 'tp-horizontal').ecart).toBe(true);
    expect(constat(bas, 'tp-horizontal').ratio).toBeCloseTo(0.59, 5);
    const haut = Eq.analyser(rapportHorizontal(61, 100));
    expect(constat(haut, 'tp-horizontal')).toBeNull();
    expect(haut.calmes.map((c) => c.cle)).toContain('tp-horizontal');
    expect(Eq.SEUIL_TIRAGE).toBe(0.6);
  });
  test('chaîne postérieure / quadriceps : 0,39 est un écart, 0,41 n’en est pas un', () => {
    expect(constat(Eq.analyser(rapportChaine(39, 100)), 'chaine').ecart).toBe(true);
    const ok = Eq.analyser(rapportChaine(41, 100));
    expect(constat(ok, 'chaine')).toBeNull();
    expect(ok.calmes.map((c) => c.cle)).toContain('chaine');
    expect(Eq.SEUIL_CHAINE).toBe(0.4);
  });
  test('à la verticale, séparément : le tirage vertical contre la poussée verticale', () => {
    const sem = {};
    for (let i = 0; i < 12; i++) sem[i] = [{ routine: 'r-a', exos: { developpe_militaire_barre: 5, tirage_poitrine: 2, rowing_barre: 5, developpe_couche_barre: 5 } }];
    const a = Eq.analyser(entree(construire(sem)));
    expect(constat(a, 'tp-vertical').ecart).toBe(true);
    expect(constat(a, 'tp-vertical').fait).toBe('1 série de tirage pour 2,5 de poussée.');
    expect(a.calmes.map((c) => c.cle)).toContain('tp-horizontal');   // l’horizontale est à 1 pour 1
  });
  test('un côté opposé nul ne donne pas de rapport (rien à comparer)', () => {
    const sem = {};
    for (let i = 0; i < 12; i++) sem[i] = [{ routine: 'r-a', exos: { rowing_barre: 5 } }];
    const a = Eq.analyser(entree(construire(sem)));
    expect(constat(a, 'tp-horizontal')).toBeNull();
    expect(a.calmes.map((c) => c.cle)).not.toContain('tp-horizontal');
  });
  test('le ratio épaule arrière / avant est écarté : aucune mesure ne le porte', () => {
    const a = Eq.analyser(entree(construire(equilibrees(14))));
    expect(a.constats.concat(a.calmes).map((c) => c.cle).filter((c) => /epaule|anterieur|posterieur/.test(c))).toEqual([]);
    expect(a.calmes.map((c) => c.cle)).toEqual(['tp-horizontal', 'tp-vertical', 'chaine', 'zero']);
  });
});

describe('la fenêtre : 4 semaines et 12 séances, sinon rien', () => {
  const sem = (nSemaines, parSemaine) => {
    const s = {};
    for (let i = 0; i < nSemaines; i++) s[i] = Array.from({ length: parSemaine }, () => ({ routine: 'r-a', exos: { rowing_barre: 1, developpe_couche_barre: 4 } }));
    return s;
  };
  test('3 semaines, 12 séances : rien', () => {
    expect(Eq.analyser(entree(construire(sem(3, 4)))).etat).toBe('peu');
  });
  test('4 semaines, 11 séances : rien', () => {
    const s = sem(4, 3); s[3].pop();
    expect(Eq.analyser(entree(construire(s))).etat).toBe('peu');
  });
  test('4 semaines, 12 séances : la carte se mesure', () => {
    const a = Eq.analyser(entree(construire(sem(4, 3))));
    expect(a.etat).toBe('ok');
    expect(constat(a, 'tp-horizontal').ecart).toBe(true);
  });
  test('les semaines à zéro séance sont exclues de tout calcul : une coupure n’est pas une semaine', () => {
    // 20 semaines d’entraînement, dont 5 semaines vides entre les deux périodes : la fenêtre compte 12 semaines NON NULLES.
    const s = {};
    [0, 1, 2, 3, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].forEach((k) => { s[k] = [{ routine: 'r-a', exos: Object.assign({ rowing_barre: 1, developpe_couche_barre: 4 }, COMPL) }]; });
    const a = Eq.analyser(entree(construire(s)));
    expect(a.etat).toBe('ok');
    expect(a.quand).toBe('Tes 12 dernières semaines · 12 séances');
    // Et la coupure ne défait pas l’habitude : 8 semaines non nulles tenues, malgré les semaines vides.
    expect(constat(a, 'tp-horizontal').habitude.tenu).toBe(8);
    expect(carte(a, 'tp-horizontal')).not.toBeNull();
  });
  test('une marche (sans série de musculation) ne fait pas une semaine d’entraînement', () => {
    const base = construire(sem(4, 3));
    base.seances.push({ id: 'marche', debut: H.iso(H.lundiDe(6)), routine_id: null, gestes: [] });
    base.series.push({ id: 'm1', session_id: 'marche', exercise_slug: 'tapis', type_serie: 'travail', reps: 1 });
    expect(Eq.analyser(entree(base)).quand).toBe('Tes 4 dernières semaines · 12 séances');
  });
});

describe('le repère et la tendance', () => {
  test('le repère est une pratique de coach, jamais un risque de blessure', () => {
    const c = constat(Eq.analyser(rapportHorizontal(50, 100)), 'tp-horizontal');
    expect(c.repere).toMatch(/^En musculation, beaucoup de coachs visent/);
    expect(c.repere).not.toMatch(/blessure|risque|danger/i);
  });
  test('la tendance sur l’année, quand elle existe', () => {
    // 30 semaines : les 12 plus anciennes (k ≥ 26) à 0,33 ; aujourd’hui à 0,5.
    const sem = {};
    for (let i = 0; i < 40; i++) sem[i] = [{ routine: 'r-a', exos: i >= 26 ? { rowing_barre: 1, developpe_couche_barre: 3 } : { rowing_barre: 5, developpe_couche_barre: 10 } }];
    const c = constat(Eq.analyser(entree(construire(sem))), 'tp-horizontal');
    expect(c.ecart).toBe(true);
    expect(c.tendance).toMatch(/^Sur l’année : 0,33 il y a six mois, 0,50 aujourd’hui\.$/);
  });
  test('sans fenêtre valide un an plus tôt, pas de tendance', () => {
    const c = constat(Eq.analyser(rapportHorizontal(50, 100)), 'tp-horizontal');
    expect(c.tendance).toBeNull();
  });
});

describe('un muscle principal à 0 série sur 4 semaines', () => {
  const sansIschios = () => entree(construire(equilibrees(14, { b: () => ({ souleve_de_terre_roumain: 0, leg_curl: 0, hip_thrust: 0 }) })));
  test('les ischios à zéro sur 4 semaines : le constat, avec le fait', () => {
    const a = Eq.analyser(sansIschios());
    const c = constat(a, 'zero:ischio_jambiers');
    expect(c.fait).toBe('0 série d’ischio-jambiers sur tes 4 dernières semaines.');
    expect(c.ecart).toBe(true);
  });
  test('l’épaule arrière et le côté comptent', () => {
    const a = Eq.analyser(entree(construire(equilibrees(14, { a: () => ({ oiseau: 0, elevations_laterales: 0 }) }))));
    expect(constat(a, 'zero:deltoide_posterieur')).not.toBeNull();
    expect(constat(a, 'zero:deltoide_lateral')).not.toBeNull();
    expect(Eq.MUSCLES_PRINCIPAUX).toEqual(expect.arrayContaining(['deltoide_posterieur', 'deltoide_lateral']));
  });
  test('une série il y a 3 semaines suffit : le muscle n’est pas à zéro', () => {
    const base = construire(equilibrees(14, { b: (i) => (i === 3 ? {} : { souleve_de_terre_roumain: 0, leg_curl: 0, hip_thrust: 0 }) }));
    expect(constat(Eq.analyser(entree(base)), 'zero:ischio_jambiers')).toBeNull();
  });
  test('tous les muscles servis : « Aucun sur les 4 dernières semaines »', () => {
    const a = Eq.analyser(entree(construire(equilibrees(14))));
    expect(a.calmes.filter((c) => c.cle === 'zero')[0].texte).toBe('Aucun sur les 4 dernières semaines.');
  });
});

describe('D’où ça vient : chaque cause, en faits', () => {
  // 12 semaines de A (couche 4, rowing 4) et B ; le rowing est le dernier exercice de « Haut A ».
  const R_A = routine('r-a', 'Haut A', { developpe_couche_barre: 4, tractions: 3, developpe_militaire_barre: 3, rowing_barre: 4 });
  const R_B = routine('r-b', 'Haut B', { developpe_incline_halteres: 4, curl: 3 });
  const R_C = routine('r-c', 'Bas', { squat_barre: 4, leg_extension: 3 });
  const A = (rowing, gestes) => ({ routine: 'r-a', gestes: gestes || [], exos: Object.assign({ developpe_couche_barre: 8, tractions: 2, developpe_militaire_barre: 2 }, COMPL, rowing ? { rowing_barre: rowing } : {}) });
  const semaines = (f) => { const s = {}; for (let i = 0; i < 20; i++) s[i] = f(i); return s; };
  const causes = (a) => carte(a, 'tp-horizontal').causes.map((c) => c.texte);

  test('ce que les routines prévoient', () => {
    const a = Eq.analyser(entree(construire(semaines(() => [A(1)])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('Tes routines prévoient 4 séries de tirage pour 8 de poussée par semaine.');
  });
  test('l’exercice sauté et sa place : « en dernier dans Haut A ; il a eu lieu 8 fois sur 12 »', () => {
    const a = Eq.analyser(entree(construire(semaines((i) => [A(i < 8 ? 3 : 0)])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('Rowing Penché (Barre) est en dernier dans « Haut A » : il a eu lieu 8 fois sur 12.');
    const prop = carte(a, 'tp-horizontal').propositions.filter((p) => p.type === 'deplacer')[0];
    expect(prop).toMatchObject({ routine_id: 'r-a', slug: 'rowing_barre', avant: 'tractions' });
    expect(prop.libelle).toBe('Le placer plus tôt dans « Haut A »');
  });
  test('un exercice sauté une seule fois n’est pas une cause (une habitude, pas un accident)', () => {
    const a = Eq.analyser(entree(construire(semaines((i) => [A(i === 0 ? 0 : 1)])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a).join(' ')).not.toMatch(/en dernier/);
  });
  test('« J’ai peu de temps » : l’exercice retiré N fois, par les gestes', () => {
    const g = [{ geste: 'raccourci', retires: ['rowing_barre'] }];
    const a = Eq.analyser(entree(construire(semaines((i) => [A(i < 6 ? 1 : 0, i < 6 ? [] : g)])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('« J’ai peu de temps » a retiré Rowing Penché (Barre) 6 fois sur 12.');
    expect(causes(a).join(' ')).not.toMatch(/en dernier dans/);   // ce que le geste explique n’est pas compté deux fois comme saut
  });
  test('« Machine prise » sans remplaçant : N fois', () => {
    const g = [{ geste: 'machine_prise', slug: 'rowing_barre' }];
    const a = Eq.analyser(entree(construire(semaines((i) => [A(i < 6 ? 1 : 0, i < 6 ? [] : g)])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('« Machine prise » : 6 fois sur Rowing Penché (Barre), sans remplaçant.');
    const p = carte(a, 'tp-horizontal').propositions.filter((x) => x.type === 'remplacer')[0];
    expect(p.libelle).toBe('Un remplaçant pour Rowing Penché (Barre)');
  });
  test('« Machine prise » AVEC un remplaçant n’est pas « sans remplaçant »', () => {
    const g = [{ geste: 'machine_prise', slug: 'rowing_barre', vers: 'rowing_poulie' }];
    const a = Eq.analyser(entree(construire(semaines((i) => [A(0, g)])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a).join(' ')).not.toMatch(/sans remplaçant/);
  });
  test('un remplacement à la main au profit d’un autre exercice', () => {
    const g = [{ geste: 'remplacement', slug: 'rowing_barre', vers: 'curl' }];
    const a = Eq.analyser(entree(construire(semaines((i) => [A(0, g)])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('Rowing Penché (Barre) a été remplacé par Curl Biceps 12 fois.');
  });
  test('un remplaçant du même mouvement est déduit d’une séance sans geste (sans le deviner)', () => {
    const s = semaines((i) => [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 8, tractions: 2, developpe_militaire_barre: 2, rowing_inverse: 1 }, COMPL) }]);
    const a = Eq.analyser(entree(construire(s), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('Rowing Penché (Barre) a été remplacé par Rowing Inversé (Épaules) 12 fois.');
  });
  test('un exercice absent et un autre exercice présent SANS lien de mouvement : un saut, jamais un remplacement', () => {
    const s = semaines(() => [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 8, tractions: 2, developpe_militaire_barre: 2 }, COMPL, { curl: 3 }) }]);
    const a = Eq.analyser(entree(construire(s), { routines: [R_A, R_B, R_C] }));
    expect(causes(a).join(' ')).not.toMatch(/remplacé/);
    expect(causes(a)).toContain('Rowing Penché (Barre) est en dernier dans « Haut A » : il a eu lieu 0 fois sur 12.');
  });
  test('⚠️ aucune cause devinée sur une séance sans gestes : ni « J’ai peu de temps », ni « Machine prise »', () => {
    const a = Eq.analyser(entree(construire(semaines((i) => [A(i < 6 ? 1 : 0, [])])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a).join(' ')).not.toMatch(/J’ai peu de temps|Machine prise/);
  });
  test('un exercice écarté par « J’ai mal » : une variante appuyée, jamais plus de séries', () => {
    const s = semaines((i) => [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 8, tractions: 2, developpe_militaire_barre: 2, rowing_barre: { n: 1, douleur: i < 5 } }, COMPL) }]);
    const a = Eq.analyser(entree(construire(s), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('Rowing Penché (Barre) : « J’ai mal » marqué sur 5 séances.');
    const p = carte(a, 'tp-horizontal').propositions;
    expect(p.filter((x) => x.type === 'remplacer').map((x) => x.libelle)).toContain('Une variante appuyée pour Rowing Penché (Barre)');
    expect(p.some((x) => x.type === 'serie')).toBe(false);
  });
  test('des séries ajoutées en séance d’un côté plus que de l’autre', () => {
    const g = [{ geste: 'ajout_serie', slug: 'developpe_couche_barre', n: 1 }, { geste: 'ajout_serie', slug: 'developpe_couche_barre', n: 1 }];
    const a = Eq.analyser(entree(construire(semaines((i) => [A(1, i < 3 ? g : [])])), { routines: [R_A, R_B, R_C] }));
    expect(causes(a)).toContain('En séance, tu as ajouté 6 séries de poussée et 0 de tirage.');
  });
  test('l’ajout : l’exercice le plus fait du côté qui manque, dans la routine la plus faite qui ne l’a pas', () => {
    const a = Eq.analyser(entree(construire(semaines(() => [A(1), { routine: 'r-b', exos: { developpe_incline_halteres: 2 } }])), { routines: [R_A, R_B, R_C] }));
    // « Haut A » a déjà le rowing ; « Haut B » ne l’a pas : c’est la routine faite qui le reçoit.
    const p = carte(a, 'tp-horizontal').propositions.filter((x) => x.type === 'ajouter')[0];
    expect(p).toMatchObject({ routine_id: 'r-b', slug: 'rowing_barre', series: 1 });
    expect(p.libelle).toBe('Ajouter Rowing Penché (Barre) à « Haut B »');
  });
  // « Bas A » (squat, extension, hip thrust) est faite chaque semaine, avec le haut du corps.
  const HAUT = { developpe_couche_barre: 3, rowing_barre: 3, tractions: 2, developpe_militaire_barre: 2, oiseau: 1, elevations_laterales: 1, curl: 1, extension_triceps: 1 };
  const BAS_A = (i) => ({ routine: 'r-a', exos: Object.assign({ squat_barre: 4, leg_extension: 6, hip_thrust: 1 }, HAUT) });
  test('une séance de la routine non faite, quand elle porte l’exercice en écart', () => {
    // « Bas B » (soulevé, leg curl) n’est faite que 8 semaines sur 12 (les 8 plus récentes).
    const RB = routine('r-b', 'Bas B', { squat_barre: 4, souleve_de_terre_roumain: 3, leg_curl: 3 });
    const RA = routine('r-a', 'Bas A', { squat_barre: 4, leg_extension: 6, hip_thrust: 1 });
    const s = semaines((i) => [BAS_A(i)].concat(i < 8 ? [{ routine: 'r-b', exos: { souleve_de_terre_roumain: 1, leg_curl: 1 } }] : []));
    const a = Eq.analyser(entree(construire(s), { routines: [RA, RB] }));
    const t = carte(a, 'chaine').causes.map((c) => c.texte);
    expect(t).toContain('« Bas B » n’a pas été faite 4 semaines sur 12 : c’est elle qui porte Soulevé de Terre Roumain et Leg Curl Assis.');
    const p = carte(a, 'chaine').propositions;
    expect(p.map((x) => x.libelle)).toEqual(expect.arrayContaining(['Ajouter Soulevé de Terre Roumain à « Bas A »', 'Fusionner Bas A et Bas B']));
    expect(p.filter((x) => x.type === 'fusionner')[0]).toMatchObject({ routine_id: 'r-a', autre_id: 'r-b' });
  });
  test('⚠️ une séance non faite qui ne porte PAS le muscle en écart n’est pas nommée', () => {
    const RB = routine('r-b', 'Bras', { curl: 3, extension_triceps: 3 });
    const RA = routine('r-a', 'Bas A', { squat_barre: 4, leg_extension: 6, hip_thrust: 1 });
    const s = semaines((i) => [BAS_A(i)].concat(i < 6 ? [{ routine: 'r-b', exos: { curl: 3 } }] : []));
    const a = Eq.analyser(entree(construire(s), { routines: [RA, RB] }));
    expect(carte(a, 'chaine')).not.toBeNull();
    expect(carte(a, 'chaine').causes.map((c) => c.texte).join(' ')).not.toMatch(/Bras|n’a pas été faite/);
  });
  test('jamais « tu as manqué », jamais un total ni une durée d’absence', () => {
    const RB = routine('r-b', 'Bas B', { souleve_de_terre_roumain: 3, leg_curl: 3 });
    const RA = routine('r-a', 'Bas A', { squat_barre: 4, leg_extension: 6, hip_thrust: 1 });
    const s = semaines((i) => [BAS_A(i)].concat(i < 8 ? [{ routine: 'r-b', exos: { leg_curl: 1 } }] : []));
    const a = Eq.analyser(entree(construire(s), { routines: [RA, RB] }));
    const tout = JSON.stringify(a.cartes);
    expect(tout).toMatch(/Bas B/);
    expect(tout).not.toMatch(/manqu|absen|depuis \d+ jours|assidu|régularité/i);
  });
  test('la structure bouge : un exercice de plus ou de moins dans la routine ne change pas la règle', () => {
    const six = routine('r-a', 'Haut A', { developpe_couche_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3, extension_triceps: 3, elevations_laterales: 2, rowing_barre: 7 });
    const a = Eq.analyser(entree(construire(semaines((i) => [A(i < 6 ? 1 : 0)])), { routines: [six, R_B, R_C] }));
    expect(causes(a)).toContain('Rowing Penché (Barre) est en dernier dans « Haut A » : il a eu lieu 6 fois sur 12.');
    expect(causes(a)).toContain('Tes routines prévoient 7 séries de tirage pour 8 de poussée par semaine.');
  });
});

describe('le programme du coach : le prévu et le fait', () => {
  const R = routine('r-a', 'Haut A', { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3 });
  const sem = (n) => { const s = {}; for (let i = 0; i < 20; i++) s[i] = [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 4, rowing_barre: n }, COMPL) }]; return s; };
  test('le programme est équilibré, l’écart vient de ce qui a sauté : prévu 1 pour 1, fait 1 pour 2,5', () => {
    const a = Eq.analyser(entree(construire(sem(2)), { routines: [R], programmeDuCoach: true }));
    const c = carte(a, 'tp-horizontal');
    expect(c.fait).toBe('Ton programme prévoit 1 série de tirage pour 1 de poussée. Tu en as fait 1 pour 2.');
    expect(c.etiquettes.a).toBe('Tirage · 24 séries faites sur 48 prévues');
    expect(c.etiquettes.b).toBe('Poussée · 48 sur 48');
    expect(c.coach.malConstruit).toBe(false);
    expect(c.propositions.some((p) => p.type === 'corriger')).toBe(false);
  });
  test('le programme prévu est lui-même sous le seuil : « Je l’ai mal construit : je corrige ton programme ? »', () => {
    const Rm = routine('r-a', 'Haut A', { developpe_couche_barre: 4, rowing_barre: 2 });
    const a = Eq.analyser(entree(construire(sem(2)), { routines: [Rm], programmeDuCoach: true }));
    const c = carte(a, 'tp-horizontal');
    expect(c.coach.malConstruit).toBe(true);
    expect(c.fait).toBe('Ton programme prévoit 1 série de tirage pour 2 de poussée.');
    const p = c.propositions.filter((x) => x.type === 'corriger')[0];
    expect(p.libelle).toBe('Je l’ai mal construit : je corrige ton programme ?');
    expect(p.refait).toBe(true);
  });
  test('un programme de la personne : la carte ne compare pas prévu et fait', () => {
    const c = carte(Eq.analyser(entree(construire(sem(2)), { routines: [R], programmeDuCoach: false })), 'tp-horizontal');
    expect(c.fait).toBe('1 série de tirage pour 2 de poussée.');
    expect(c.coach).toBeUndefined();
  });
});

describe('le réglage décide QUAND le coach parle, jamais ce qu’il constate', () => {
  // Trois écarts à la fois : tirage/poussée à l’horizontale, à la verticale, et la chaîne.
  const trois = (extra) => {
    const s = {};
    for (let i = 0; i < 20; i++) s[i] = [{ routine: 'r-a', exos: { rowing_barre: 1, developpe_couche_barre: 8, tirage_poitrine: 1, developpe_militaire_barre: 8, tractions: 1,
      leg_curl: 1, leg_extension: 8, souleve_de_terre_roumain: 0, squat_barre: 0, oiseau: 1, elevations_laterales: 1, curl: 1, extension_triceps: 1, hip_thrust: 1 } }];
    return entree(construire(s), extra);
  };
  test('Me ménager : une carte ; Normal : deux ; Me pousser : trois', () => {
    expect(Eq.analyser(trois({ reglage: 'prudent' })).cartes).toHaveLength(1);
    expect(Eq.analyser(trois({ reglage: 'normal' })).cartes).toHaveLength(2);
    expect(Eq.analyser(trois({ reglage: 'franc' })).cartes).toHaveLength(3);
    expect(Eq.REGLAGES).toEqual({ prudent: { habitude: 6, cartes: 1, silence: 12 }, normal: { habitude: 5, cartes: 2, silence: 8 }, franc: { habitude: 4, cartes: 3, silence: 4 } });
  });
  test('les faits sont les mêmes quel que soit le réglage', () => {
    const f = (r) => Eq.analyser(trois({ reglage: r })).constats.map((c) => [c.cle, c.fait, c.ecart, c.repere]);
    expect(f('prudent')).toEqual(f('franc'));
    expect(f('normal')).toEqual(f('franc'));
  });
  test('l’habitude : l’écart tenu sur 5 des 8 dernières semaines — Me pousser (4) et Normal (5) parlent, Me ménager (6) se tait', () => {
    // Les 8 semaines les plus récentes sans aucun rowing (écart aux fenêtres 0 à 4), les plus anciennes à 0,8.
    const s = {};
    for (let i = 0; i < 20; i++) s[i] = [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 10, rowing_barre: i < 8 ? 0 : 8, tractions: 2 }, COMPL) }];
    const f = (r) => { const a = Eq.analyser(entree(construire(s), { reglage: r })); return [constat(a, 'tp-horizontal').habitude.tenu, !!carte(a, 'tp-horizontal')]; };
    expect(f('prudent')).toEqual([5, false]);
    expect(f('normal')).toEqual([5, true]);
    expect(f('franc')).toEqual([5, true]);
    // Le constat reste lisible quand la carte se tait : les faits ne changent pas.
    const sil = Eq.analyser(entree(construire(s), { reglage: 'prudent' }));
    expect(constat(sil, 'tp-horizontal').ecart).toBe(true);
    expect(constat(sil, 'tp-horizontal').parle).toBe(false);
  });
  test('un accident n’est pas une habitude : 3 semaines sur 8 ne font pas parler, même en Me pousser', () => {
    const s = {};
    for (let i = 0; i < 24; i++) s[i] = [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 10, rowing_barre: i < 3 ? 0 : 8, tractions: 2 }, COMPL) }];
    // Aucune fenêtre de 12 semaines n’est sous 0,6 avec 3 semaines vides sur 12 : 72/120 = 0,6.
    const a = Eq.analyser(entree(construire(s), { reglage: 'franc' }));
    expect(carte(a, 'tp-horizontal')).toBeNull();
  });
  test('Pas maintenant : la carte se tait la durée du réglage, puis revient', () => {
    const base = (le, r, refus) => trois({ reglage: 'normal', cartes: { 'tp-horizontal': { r: r || 'non', le, refus: refus || 1 } } });
    const dit = (e) => !!Eq.analyser(e).cartes.filter((c) => c.cle === 'tp-horizontal').length;
    // Normal : 8 semaines. Le 28/10 ; refusé le 9/09 (7 semaines) : encore en silence ; le 26/08 (9 semaines) : elle revient.
    expect(Eq.analyser(base('2026-09-09')).constats.filter((c) => c.cle === 'tp-horizontal')[0].silence).toBe(true);
    expect(Eq.analyser(base('2026-08-26')).constats.filter((c) => c.cle === 'tp-horizontal')[0].silence).toBe(false);
    expect(dit(base('2026-09-09'))).toBe(false);
    expect(dit(base('2026-08-26'))).toBe(true);
  });
  test('le silence par réglage : 12, 8 et 4 semaines', () => {
    const cartes = { x: { r: 'non', le: '2026-08-05', refus: 1 } };       // 12 semaines avant le 28/10 (la 12e semaine, tout juste)
    expect(Eq.silenceDe('prudent', cartes.x)).toBe(12);
    expect(Eq.silenceDe('normal', cartes.x)).toBe(8);
    expect(Eq.silenceDe('franc', cartes.x)).toBe(4);
    const il = (reglage, le) => Eq.analyser(trois({ reglage, cartes: { 'tp-horizontal': { r: 'non', le, refus: 1 } } })).constats.filter((c) => c.cle === 'tp-horizontal')[0].silence;
    expect(il('franc', '2026-10-07')).toBe(true);     // 3 semaines : encore (4)
    expect(il('franc', '2026-09-30')).toBe(false);    // 4 semaines : revenue
    expect(il('prudent', '2026-08-12')).toBe(true);   // 11 semaines : encore (12)
    expect(il('prudent', '2026-08-05')).toBe(false);  // 12 semaines : revenue
  });
  test('deux « Pas maintenant » de suite DOUBLENT le silence', () => {
    const r1 = Eq.reponse({}, 'c', 'non', '2026-01-05');
    expect(r1).toEqual({ r: 'non', le: '2026-01-05', refus: 1 });
    const r2 = Eq.reponse({ c: r1 }, 'c', 'non', '2026-03-09');
    expect(r2.refus).toBe(2);
    expect(Eq.silenceDe('normal', r2)).toBe(16);
    expect(Eq.silenceDe('prudent', r2)).toBe(24);
    expect(Eq.silenceDe('franc', r2)).toBe(8);
    // Un « oui » entre les deux remet le compte à zéro.
    expect(Eq.reponse({ c: Eq.reponse({ c: r1 }, 'c', 'oui', '2026-02-02') }, 'c', 'non', '2026-03-09').refus).toBe(1);
    // En situation : 12 semaines après un second refus, Normal se tait encore (16) ; après un seul refus, la carte est revenue.
    const il = (refus, le) => Eq.analyser(trois({ reglage: 'normal', cartes: { 'tp-horizontal': { r: 'non', le, refus } } })).constats.filter((c) => c.cle === 'tp-horizontal')[0].silence;
    expect(il(2, '2026-08-05')).toBe(true);
    expect(il(1, '2026-08-05')).toBe(false);
  });
  test('une carte acceptée repart de zéro (la fenêtre d’habitude recommence après)', () => {
    const e = trois({ reglage: 'franc', cartes: { 'tp-horizontal': { r: 'oui', le: '2026-10-21', refus: 0 } } });
    const a = Eq.analyser(e);
    expect(constat(a, 'tp-horizontal').habitude.tenu).toBeLessThan(4);
    expect(carte(a, 'tp-horizontal')).toBeNull();
    expect(Eq.perimer(['a', 'b', 'c'], 'b', '2026-10-28')).toEqual({ a: { r: 'oui', le: '2026-10-28', refus: 0 }, c: { r: 'oui', le: '2026-10-28', refus: 0 } });
  });
  test('un programme REFAIT fait repartir toutes les cartes (les autres, périmées, ne reviennent qu’avec une habitude neuve)', () => {
    const avant = Eq.analyser(trois({ reglage: 'franc' }));
    expect(avant.cartes).toHaveLength(3);
    const apres = Eq.analyser(trois({ reglage: 'franc', programmeRefaitLe: '2026-10-21' }));
    expect(apres.cartes).toEqual([]);
    expect(apres.constats.length).toBe(avant.constats.length);   // les faits ne changent pas
  });
  test('Juste un carnet : aucune carte, aucune ligne ; les constats restent lisibles', () => {
    const a = Eq.analyser(trois({ intention: 'entretien', reglage: 'franc' }));
    expect(a.etat).toBe('carnet');
    expect(a.cartes).toEqual([]);
    expect(a.ligne).toBeNull();
    expect(a.constats.length).toBeGreaterThan(0);
    expect(constat(a, 'tp-horizontal').fait).toBe('1 série de tirage pour 8 de poussée.');
  });
  test('l’ordre des cartes : les jours, le temps, puis les équilibres et la fréquence, puis l’ordre', () => {
    expect(Eq.ORDRE_DES_FAMILLES).toEqual(['jours', 'temps', 'equilibre', 'frequence', 'ordre']);
  });
  test('un réglage inconnu vaut Normal', () => {
    expect(Eq.analyser(trois({ reglage: 'x' })).reglage).toBe('normal');
  });
});

describe('les priorités, faites ou non', () => {
  const sem = () => { const s = {}; for (let i = 0; i < 20; i++) s[i] = [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 8, tractions: 1, developpe_militaire_barre: 1 }, COMPL) }]; return s; };
  const volume = { grand_dorsal: { place: true, moyenne: 1, max: 5 }, biceps: { place: true, moyenne: 1, max: 5 } };
  test('séries par semaine de chaque priorité, et le couché pour comparer', () => {
    const a = Eq.analyser(entree(construire(sem()), { priorites: ['tractions', 'developpe_militaire_barre', 'jambes'], volume }));
    const c = constat(a, 'priorites');
    expect(c.titre).toBe('Tes priorités, faites ou non');
    expect(c.lignes.map((l) => l.libelle)).toEqual(['Tractions', 'Développé Militaire (Barre)', 'Jambes (toutes)', 'Pour comparer\u00a0: couché']);
    expect(c.lignes[0].texte).toBe('1 série / sem.');
    expect(c.ecart).toBe(true);
  });
  test('pour comparer : le couché, quand il n’est pas lui-même une priorité', () => {
    const c = constat(Eq.analyser(entree(construire(sem()), { priorites: ['tractions'], volume })), 'priorites');
    expect(c.lignes[c.lignes.length - 1]).toMatchObject({ libelle: 'Pour comparer\u00a0: couché', gris: true });
  });
  test('« Ajouter une série de tractions à ta routine ? » passe par la règle existante (la place par muscle)', () => {
    const R = routine('r-a', 'Haut A', { developpe_couche_barre: 4, tractions: 3 });
    const avec = carte(Eq.analyser(entree(construire(sem()), { priorites: ['tractions'], volume, routines: [R] })), 'priorites');
    expect(avec.propositions).toHaveLength(1);
    expect(avec.propositions[0]).toMatchObject({ type: 'serie', routine_id: 'r-a', slug: 'tractions' });
    expect(avec.propositions[0].libelle).toBe('Ajouter une série de tractions à ta routine ?');
    // Sans place (le volume du muscle ne le permet pas) : la carte dit le fait, sans proposition.
    const sans = carte(Eq.analyser(entree(construire(sem()), { priorites: ['tractions'], volume: { grand_dorsal: { place: false, moyenne: 9, max: 5 }, biceps: { place: true } }, routines: [R] })), 'priorites');
    expect(sans.propositions).toEqual([]);
  });
  test('une priorité aussi travaillée que les autres : rien à signaler', () => {
    const a = Eq.analyser(entree(construire(sem()), { priorites: ['developpe_couche_barre'], volume }));
    expect(constat(a, 'priorites')).toBeNull();
  });
});

describe('pureté et voix', () => {
  test('rien n’est modifié : l’entrée est identique après l’analyse, et deux analyses se répondent', () => {
    const e = rapportHorizontal(40, 100, { routines: [H.R_A, H.R_B], priorites: ['tractions'] });
    const avant = JSON.stringify(e);
    const a1 = JSON.stringify(Eq.analyser(e)), a2 = JSON.stringify(Eq.analyser(e));
    expect(JSON.stringify(e)).toBe(avant);
    expect(a1).toBe(a2);
  });
  test('les textes passent les règles de la voix (pas de reproche, de compliment, de « vous », de point décimal)', () => {
    const regles = require('./fixtures/voix-regles-181.json').interdits;
    const lettre = '[\\wÀ-ÿ]';
    const res = regles.map((r) => new RegExp(r.motif.replace(/^\\b/, '(?<!' + lettre + ')').replace(/\\b$/, '(?!' + lettre + ')').replace(/\\w\*/g, lettre + '*'), r.drapeaux));
    const phrases = [];
    const RB = routine('r-b', 'Bas B', { souleve_de_terre_roumain: 3, leg_curl: 3 }), RA = routine('r-a', 'Bas A', { squat_barre: 4, leg_extension: 4 });
    const s = {};
    for (let i = 0; i < 14; i++) s[i] = [{ routine: 'r-a', gestes: [{ geste: 'machine_prise', slug: 'leg_curl' }], exos: { squat_barre: 4, leg_extension: 4, leg_curl: { n: 1, douleur: true } } }].concat(i < 8 ? [{ routine: 'r-b', exos: { leg_curl: 1 } }] : []);
    const a = Eq.analyser(entree(construire(s), { routines: [RA, RB], priorites: ['tractions'] }));
    a.constats.concat(a.cartes).forEach((c) => {
      phrases.push(c.fait, c.repere, c.tendance);
      (c.causes || []).forEach((x) => phrases.push(x.texte));
      (c.propositions || []).forEach((p) => phrases.push(p.libelle));
    });
    a.calmes.forEach((c) => phrases.push(c.texte));
    const ecartees = new Set([4]);   // « cran » : un mot du produit, admis
    const fautes = [];
    phrases.filter(Boolean).forEach((t) => {
      res.forEach((re, i) => {
        if (ecartees.has(i)) return;
        // Le « ? » de fin n’est admis que sur une question de carte (une proposition).
        if (i === 10) return;
        if (re.test(t)) fautes.push([i, t]);
      });
    });
    expect(fautes).toEqual([]);
    expect(phrases.filter(Boolean).length).toBeGreaterThan(5);
    // Seules les propositions posent une question, une seule, à la fin.
    a.cartes.forEach((c) => {
      [c.fait, c.repere].filter(Boolean).forEach((t) => expect(t).not.toMatch(/\?/));
      (c.causes || []).forEach((x) => expect(x.texte).not.toMatch(/\?/));
      (c.propositions || []).forEach((p) => { if (/\?/.test(p.libelle)) expect(p.libelle.match(/\?/g)).toHaveLength(1); });
    });
  });
  test('une proposition est toujours un geste de l’utilisateur : aucune ne porte une écriture', () => {
    const e = rapportHorizontal(40, 100, { routines: [H.R_A, H.R_B] });
    JSON.stringify(Eq.analyser(e));
    expect(Object.keys(Eq).filter((k) => /ecrire|poser|enregistrer/i.test(k))).toEqual([]);
  });
});
