/** @jest-environment node */
//
// 60-4 / 60-6 — LE GÉNÉRATEUR « CONSTRUIS-LE-MOI » (QUESTIONNAIRE-COACH-V2 §5 bis), rejoué contre ses cas.
//
// Le fichier de cas `tests/unit/fixtures/cas-60-6-generateur.json` fait foi (référence `gen60b.py`) : 32 programmes,
// 78 « Je n'en veux pas » (dont un geste deux fois de suite sur une place aux séries changées), 30 cartes. Un cas qui
// semble faux se rapporte ; il ne se corrige pas ici en silence.
//
// La forme du catalogue du cas — slug → [équipement, principaux, secondaires] — est celle de la base ; le module lit
// celle de l'app — slug → { equipement, muscles_primaires, muscles_secondaires } — et le test convertit.
const fs = require('fs');
const path = require('path');

const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));

let G, Profil;
beforeAll(() => {
  require('../../v2/js/modele.js');
  require('../../v2/js/semaine.js');
  Profil = require('../../v2/js/profil.js');
  G = require('../../v2/js/generateur.js');
});

const catalogue = () => {
  const c = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
  });
  return c;
};

// Les 8 champs du fichier de cas, dans l'ordre de `format_exercice`.
const champs = (x) => [x.exercise_slug, x.motif, x.role, x.series, x.reps, x.prioritaire, x.menage, x.barre_fixe];
const vue = (cat, rt) => ({ nom: rt.nom, pourquoi: G.pourquoi(cat, rt), exercices: rt.exercices.map(champs) });
const clone = (o) => JSON.parse(JSON.stringify(o));

// Ce que le fichier de cas décrit par `entree` : les noms de l'app (menager, ecartes, priorites, faits).
const entreeDe = (c) => clone(c.entree);
const entreeDeSans = (id) => entreeDe(CAS.generer.filter((x) => x.id === id)[0]);

describe('60-4 — le format du fichier de cas', () => {
  test('les 8 champs sont ceux que le module rend, dans cet ordre', () => {
    expect(CAS.format_exercice).toEqual(['exercise_slug', 'motif', 'role', 'series', 'reps', 'prioritaire', 'menage', 'barre_fixe']);
  });
});

describe('60-6 — generer : les 32 programmes du fichier de cas, à l’identique', () => {
  CAS.generer.forEach((c) => {
    test(c.id + ' — l’ordre des routines et des exercices, les 8 champs, la ligne « pourquoi »', () => {
      const cat = catalogue();
      const rs = G.generer(cat, entreeDe(c));
      expect(rs.map((rt) => vue(cat, rt))).toEqual(c.attendu);
    });
  });
});

describe('60-6 — neVeuxPas : les 78 gestes du fichier de cas', () => {
  const programmes = {};
  const base = (id) => {
    if (!programmes[id]) {
      const c = CAS.generer.filter((x) => x.id === id)[0];
      programmes[id] = { entree: entreeDe(c), routines: G.generer(catalogue(), entreeDe(c)) };
    }
    return programmes[id];
  };

  CAS.ne_veux_pas.forEach((c) => {
    test(c.id + ' — seule la routine touchée change, les autres sont inchangées, les écartés sont ceux du cas', () => {
      const cat = catalogue();
      const { entree, routines } = base(c.programme);
      let rs = clone(routines);
      let p = clone(entree);
      let touchee;
      if (c.series_avant) {
        // La personne a changé les séries de la place ; le geste les garde — deux fois de suite.
        rs[c.series_avant.routine].exercices[c.series_avant.exercice].series = c.series_avant.series;
        c.gestes.forEach(([r, k]) => {
          const sortie = G.neVeuxPas(cat, rs, p, r, k);
          rs = sortie.routines;
          p = Object.assign({}, p, { ecartes: sortie.ecartes });
          touchee = r;
        });
      } else {
        const sortie = G.neVeuxPas(cat, rs, p, c.routine, c.exercice);
        rs = sortie.routines;
        p = Object.assign({}, p, { ecartes: sortie.ecartes });
        touchee = c.routine;
      }
      expect(vue(cat, rs[touchee])).toEqual(c.attendu_routine);
      rs.forEach((rt, i) => { if (i !== touchee) expect(rt).toEqual(routines[i]); });
      expect(p.ecartes.slice().sort()).toEqual(c.ecartes.slice().sort());
    });
  });

  test('rien n’est modifié en place : les routines reçues sont celles d’avant le geste', () => {
    const cat = catalogue();
    const { entree, routines } = base('neuf_4j_les_deux');
    const avant = clone(routines), avantEntree = clone(entree);
    G.neVeuxPas(cat, routines, entree, 0, 0);
    expect(routines).toEqual(avant);
    expect(entree).toEqual(avantEntree);
  });
});

describe('60-4 — carteCycles : les 30 cas du fichier', () => {
  CAS.carte_cycles.forEach((c, i) => {
    test('cas ' + (i + 1) + ' — ' + c.objectif + ', ' + c.jours_depuis_creation + ' j, ' + c.seances_du_dossier + ' séances', () => {
      expect(G.carteCycles({ objectif: c.objectif, joursDepuisCreation: c.jours_depuis_creation,
        seancesDuDossier: c.seances_du_dossier, estProgramme: c.est_programme, carnet: c.carnet, dejaVue: c.deja_vue }))
        .toBe(c.attendu);
    });
  });

  test('sans entrée, la carte ne s’affiche pas', () => {
    expect(G.carteCycles()).toBe(false);
    expect(G.carteCycles({})).toBe(false);
  });
});

// ── LA FIXTURE DÉCLENCHE VRAIMENT CHAQUE CHEMIN ────────────────────────────────
// Un test qui ne teste pas ce qu'il prétend est pire qu'aucun test : chaque règle ci-dessous se prouve sur un cas du
// fichier, pas sur un cas écrit pour la circonstance.
describe('60-4 — chaque chemin de la règle est joué par un cas du fichier', () => {
  const cat = catalogue();
  const programme = (id) => {
    const c = CAS.generer.filter((x) => x.id === id)[0];
    return G.generer(cat, entreeDe(c));
  };
  const exercices = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices));

  test('le MOTIF VOISIN : un exercice hors de la liste de son motif (des pompes à la place d’un incliné)', () => {
    const e = exercices(programme('neuf_3j_poids_du_corps')).filter((x) => x.motif === 'incline')[0];
    expect(e.exercise_slug).toBe('pompes_declinees');                       // l’incliné au poids du corps existe…
    const sortie = G.neVeuxPas(cat, programme('neuf_3j_poids_du_corps'), { jours: 3, materiel: 'poids_du_corps' }, 2, 0);
    const neuf = sortie.routines[2].exercices[0];
    expect(neuf.motif).toBe('incline');
    expect(G.MOTIFS.incline).not.toContain(neuf.exercise_slug);             // …l’écarter fait passer au voisin (couché)
    expect(G.MOTIFS.couche).toContain(neuf.exercise_slug);
  });

  test('« DÉJÀ PRIS » : un exercice revient dans la semaine plutôt qu’un muscle sans travail', () => {
    const vus = {};
    exercices(programme('neuf_3j_poids_du_corps')).forEach((x) => { vus[x.exercise_slug] = (vus[x.exercise_slug] || 0) + 1; });
    expect(vus.step_up).toBeGreaterThan(1);
  });

  test('LA PLACE QUI SAUTE : une routine a moins d’exercices que son gabarit', () => {
    const rs = programme('neuf_3j_poids_du_corps');
    const places = G.GABARITS[3].map((rt) => rt[1].length);
    expect(rs.map((rt) => rt.exercices.length)).not.toEqual(places);
    expect(rs[1].exercices.length).toBeLessThan(places[1]);
  });

  test('LA VARIANTE DOUCE du dos : belt squat, barre hexagonale, rowing poitrine appuyée', () => {
    const slugs = exercices(programme('neuf_4j_les_deux_dos')).map((x) => x.exercise_slug);
    ['belt_squat_machine', 'souleve_de_terre_barre_hex', 'rowing_incline_poitrine_haltere'].forEach((s) => {
      expect(slugs).toContain(s);
    });
    // Sans zone à ménager, ce ne sont pas les premiers choix.
    const sans = exercices(programme('neuf_4j_les_deux')).map((x) => x.exercise_slug);
    expect(sans).not.toContain('belt_squat_machine');
    expect(sans).not.toContain('souleve_de_terre_barre_hex');
  });

  test('LA CHARNIÈRE À 8 au plus, même quand l’objectif la voudrait à 9 ou plus', () => {
    const forme = exercices(programme('melodie_3j_forme_genou')).filter((x) => x.motif === 'charniere')[0];
    expect(forme.reps).toBe(8);                                             // forme : un principal à 9, plafonné
    const minimal = exercices(programme('neuf_3j_forme_maison_minimal')).filter((x) => x.motif === 'charniere')[0];
    expect(minimal.reps).toBe(8);                                           // hors barre : 12 → 8
    exercices(CAS.generer.map((c) => G.generer(cat, entreeDe(c))).reduce((t, rs) => t.concat(rs), []))
      .filter((x) => x.motif === 'charniere').forEach((x) => expect(x.reps).toBeLessThanOrEqual(8));
  });

  test('L’ÉLASTIQUE D’ABORD au poids du corps, avant tractions et rowing inversé', () => {
    const slugs = exercices(programme('neuf_2j_poids_du_corps')).map((x) => x.exercise_slug);
    expect(slugs).toEqual(expect.arrayContaining(['rowing_elastique', 'tirage_vertical_elastique']));
    expect(slugs).not.toContain('tractions');
    expect(slugs).not.toContain('rowing_inverse');
  });

  test('LA BARRE FIXE : exclue en maison minimale, présente avec sa mention au poids du corps', () => {
    const minimal = exercices(programme('neuf_3j_forme_maison_minimal')).map((x) => x.exercise_slug);
    expect(minimal).not.toContain('tractions');
    expect(minimal).not.toContain('rowing_inverse');
    const corps = exercices(programme('neuf_3j_poids_du_corps'));
    expect(corps.filter((x) => x.barre_fixe).map((x) => x.exercise_slug)).toEqual(['rowing_inverse']);
  });

  test('L’EXERCICE DÉJÀ FAIT HORS MATÉRIEL est gardé (la presse d’une maison équipée), jamais rétrogradé', () => {
    const slugs = exercices(programme('maison_equipee_4j_force_presse_faite')).map((x) => x.exercise_slug);
    expect(slugs).toContain('presse_a_cuisses');                            // machine : hors d’une maison équipée
    const sans = G.generer(cat, { jours: 4, objectif: 'force', materiel: 'maison_equipee' });
    expect(exercices(sans).map((x) => x.exercise_slug)).not.toContain('presse_a_cuisses');
  });

  test('L’HISTORIQUE ordonne les candidats : le plus fait d’abord', () => {
    // Léa a fait 8 développés couchés aux haltères et 1 à la barre : l’haltère passe devant.
    const lea = exercices(programme('lea_4j_muscle_prio_jambes')).filter((x) => x.motif === 'couche' && x.role === 'P')[0];
    expect(lea.exercise_slug).toBe('developpe_couche_haltere');
  });

  test('LES PRIORITÉS : un exercice prioritaire passe en tête et gagne une série, même en sèche', () => {
    const rs = programme('aurel_5j_les_deux_seche');
    const bas = rs[1].exercices;
    expect(bas[0].exercise_slug).toBe('squat_barre');
    expect(bas[0].prioritaire).toBe(true);
    expect(bas[0].series).toBe(5);
  });

  test('UN MUSCLE PRIORITAIRE ne gagne pas sa série en sèche, mais la gagne hors sèche', () => {
    const entree = { jours: 4, objectif: 'muscle', materiel: 'salle_complete', priorites: ['poitrine'] };
    const hors = G.generer(cat, Object.assign({ phase: 'masse' }, entree));
    const seche = G.generer(cat, Object.assign({ phase: 'seche' }, entree));
    const incline = (rs) => exercices(rs).filter((x) => x.motif === 'incline')[0];
    expect(incline(hors).series).toBe(incline(seche).series + 1);
  });
});

// ── 60-6 : LES QUATRE RÈGLES, CHACUNE SUR UN CAS DU FICHIER ────────────────────
// (Un test qui ne teste pas ce qu'il prétend est pire qu'aucun : chaque règle se prouve par une DIFFÉRENCE — le même
// profil avec et sans la condition — ou sur un cas qui ne s'explique que par elle.)
describe('60-6 — chaque règle des défauts G1 à G4 est jouée par un cas du fichier', () => {
  const cat = catalogue();
  const cas = (id) => CAS.generer.filter((x) => x.id === id)[0];
  const programme = (id, surcharge) => G.generer(cat, Object.assign(entreeDe(cas(id)), surcharge || {}));
  const exercices = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices));
  const slugs = (rs) => exercices(rs).map((x) => x.exercise_slug);
  const sans = (id, ...cles) => { const e = entreeDe(cas(id)); cles.forEach((k) => { delete e[k]; }); return e; };

  test('G1 — le gabarit de 2 jours : le couché dans les DEUX séances, des mollets, ni élévations ni triceps en direct', () => {
    const rs = programme('deux_jours_force_salle_complete');
    expect(rs.map((rt) => rt.nom)).toEqual(['Corps entier A', 'Corps entier B']);
    rs.forEach((rt) => expect(rt.exercices.map((x) => x.motif)).toContain('couche'));
    const motifs = exercices(rs).map((x) => x.motif);
    expect(motifs).toContain('mollets');
    expect(motifs).not.toContain('elev_lat');
    expect(motifs).not.toContain('triceps');
    expect(G.GABARITS[2].map((rt) => rt[1].map((pl) => pl[0] + ':' + pl[1]))).toEqual([
      ['squat:P', 'couche:P', 'rowing:S', 'jambes_tendues:S', 'mollets:I', 'abdos:T'],
      ['charniere:P', 'militaire:P', 'tirage_vertical:S', 'presse:S', 'couche:S', 'curl:I']]);
  });

  test('G2 — jamais deux fois le même exercice dans une séance : la place saute (maison minimale)', () => {
    const rs = programme('maison_minimale_4j_muscle_sans_doublon');
    rs.forEach((rt) => {
      const noms = rt.exercices.map((x) => x.exercise_slug);
      expect(new Set(noms).size).toBe(noms.length);
    });
    // Le chemin est vraiment pris : « Bas A » a perdu des places, et le roumain n'y est qu'une fois (il était le
    // dernier recours des places « jambes tendues » ET « leg curl »).
    const bas = rs[1];
    expect(bas.exercices.length).toBeLessThan(G.GABARITS[4][1][1].length);
    expect(bas.exercices.filter((x) => x.exercise_slug === 'souleve_de_terre_roumain_haltere')).toHaveLength(1);
    // Le même exercice peut, lui, revenir dans la semaine (ailleurs) plutôt qu'un muscle sans travail.
    expect(slugs(rs).filter((x) => x === 'souleve_de_terre_roumain_haltere').length).toBeGreaterThan(1);
  });

  test('G2/S6 — « Je n’en veux pas » ne reprend jamais un exercice de la séance : les 78 gestes du fichier', () => {
    let touches = 0;
    CAS.ne_veux_pas.forEach((c) => {
      if (c.series_avant) return;
      const noms = c.attendu_routine.exercices.map((x) => x[0]);
      expect(new Set(noms).size).toBe(noms.length);
      touches++;
    });
    expect(touches).toBeGreaterThan(70);
  });

  test('G2/S6 — la place saute quand son seul remplaçant est déjà dans la séance (rien ne se répète)', () => {
    const c = CAS.ne_veux_pas.filter((x) => x.id === 'maison_minimale_4j_muscle_sans_doublon/1-2')[0];
    const rs = programme('maison_minimale_4j_muscle_sans_doublon');
    const p = entreeDeSans(c.programme);
    const sortie = G.neVeuxPas(cat, rs, p, c.routine, c.exercice);
    const noms = sortie.routines[c.routine].exercices.map((x) => x.exercise_slug);
    expect(new Set(noms).size).toBe(noms.length);
    expect(noms).not.toContain('step_up');
  });

  test('G2/S6 — le repli de « Je n’en veux pas » n’accepte pas un exercice de la séance : la place saute (rien ne se répète)', () => {
    // Aucun des 78 gestes du fichier n'atteint ce repli (la mutation « neVeuxPas reprend un exercice de la séance » y
    // survivait) : le cas est donc construit, et il est celui de la référence (`gen60b.py ne_veux_pas`, rejoué à la main :
    // la séance perd la place, l'exercice rejoint les écartés). Le seul candidat du motif est déjà dans la séance.
    const mini = { pompes: cat.pompes, developpe_couche_haltere: cat.developpe_couche_haltere };
    const ligneDe = (slug, role) => ({ exercise_slug: slug, motif: 'couche', role, series: 3, reps: 9, prioritaire: false,
      menage: false, barre_fixe: false });
    const routines = [{ nom: 'S', exercices: [ligneDe('pompes', 'P'), ligneDe('developpe_couche_haltere', 'S')] }];
    const sortie = G.neVeuxPas(mini, routines, { jours: 2, materiel: null, ecartes: [] }, 0, 1);
    expect(sortie.routines[0].exercices.map((x) => x.exercise_slug)).toEqual(['pompes']);
    expect(sortie.ecartes).toEqual(['developpe_couche_haltere']);
    // Hors de la séance, le même candidat est repris : c'est bien la séance qui l'exclut, pas le catalogue.
    const autre = [{ nom: 'S', exercices: [ligneDe('developpe_couche_haltere', 'S')] }, { nom: 'T', exercices: [ligneDe('pompes', 'P')] }];
    const ailleurs = G.neVeuxPas(mini, autre, { jours: 2, materiel: null, ecartes: [] }, 0, 0);
    expect(ailleurs.routines[0].exercices.map((x) => x.exercise_slug)).toEqual(['pompes']);
  });

  test('G3 — débutant : ni tractions ni relevé de genoux suspendu d’emblée ; le même profil à « 1 à 3 ans » les a', () => {
    const debutant = slugs(programme('debutant_3j_forme_salle_complete'));
    const un_an = slugs(programme('un_an_3j_forme_salle_complete'));
    G.PDC_LOURD.forEach((s) => expect(debutant).not.toContain(s));
    expect(un_an).toEqual(expect.arrayContaining(['tractions', 'releve_de_genoux_suspendu']));
    // Le reste est le même profil : la seule différence est l'ancienneté.
    expect(entreeDe(cas('debutant_3j_forme_salle_complete'))).toEqual(Object.assign(entreeDe(cas('un_an_3j_forme_salle_complete')), { anciennete: 'moins_1_an' }));
  });

  test('G3 — un débutant qui a DÉJÀ fait les tractions les garde (l’historique l’emporte) ; pas le relevé de genoux', () => {
    const e = slugs(programme('debutant_4j_muscle_avec_tractions_faites'));
    expect(e).toContain('tractions');
    expect(e).not.toContain('releve_de_genoux_suspendu');
    // Sans l’historique, les mêmes jours et le même objectif n’auraient pas de tractions.
    expect(slugs(programme('debutant_4j_muscle_avec_tractions_faites', { faits: {} }))).not.toContain('tractions');
  });

  test('G3 — ancienneté absente, null ou inconnue : pas débutant (le programme est celui d’un assidu)', () => {
    const assidu = programme('un_an_3j_forme_salle_complete');
    [undefined, null, '', 'inconnue', '3_a_5_ans', 'plus_5_ans'].forEach((a) => {
      expect(programme('un_an_3j_forme_salle_complete', { anciennete: a })).toEqual(assidu);
    });
    expect(programme('un_an_3j_forme_salle_complete', { anciennete: 'moins_1_an' })).not.toEqual(assidu);
  });

  test('G3 — le dernier recours : quand rien d’autre n’existe, le débutant a les tractions (la place ne reste pas vide)', () => {
    const peu = {};
    ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre', 'presse_a_cuisses',
     'tractions', 'souleve_de_terre_roumain_barre', 'developpe_couche_haltere'].forEach((slug) => { peu[slug] = cat[slug]; });
    const rs = G.generer(peu, { jours: 2, objectif: 'muscle', materiel: 'salle_complete', anciennete: 'moins_1_an' });
    expect(slugs(rs)).toContain('tractions');
    // Dès qu’un autre tirage existe au catalogue, il passe devant.
    const avec = Object.assign({ tirage_poitrine_poulie: cat.tirage_poitrine_poulie }, peu);
    expect(slugs(G.generer(avec, { jours: 2, objectif: 'muscle', materiel: 'salle_complete', anciennete: 'moins_1_an' })))
      .not.toContain('tractions');
  });

  test('G3/S6 — « Je n’en veux pas » sur le tirage d’un débutant ne donne jamais des tractions', () => {
    const c = CAS.ne_veux_pas.filter((x) => x.id === 'debutant_3j_forme_salle_complete/1-2')[0];
    const rs = programme('debutant_3j_forme_salle_complete');
    const p = entreeDe(cas('debutant_3j_forme_salle_complete'));
    expect(rs[1].exercices[2].exercise_slug).toBe('tirage_poitrine_poulie');
    const sortie = G.neVeuxPas(cat, rs, p, 1, 2);
    expect(sortie.routines[1].exercices[2].exercise_slug).not.toBe('tractions');
    expect(sortie.routines[1].exercices.map((x) => x.exercise_slug)).toEqual(c.attendu_routine.exercices.map((x) => x[0]));
    // Le niveau de l'ENTRÉE est ce qui décide : le même geste, sur le même programme, avec une autre ancienneté,
    // tombe sur les tractions (premier choix du motif).
    const assidu = G.neVeuxPas(cat, rs, Object.assign({}, p, { anciennete: '1_a_3_ans' }), 1, 2);
    expect(assidu.routines[1].exercices[2].exercise_slug).toBe('tractions');
  });

  test('G4 — la priorité « Tronc » donne une série d’abdos de plus (3 au lieu de 2)', () => {
    const avec = exercices(programme('quatre_jours_muscle_prio_tronc')).filter((x) => x.role === 'T');
    const base = exercices(G.generer(cat, sans('quatre_jours_muscle_prio_tronc', 'priorites'))).filter((x) => x.role === 'T');
    expect(avec.length).toBeGreaterThan(0);
    expect(avec.map((x) => x.series)).toEqual(base.map((x) => x.series + 1));
    expect(avec.map((x) => x.series)).toEqual([3, 3]);
  });

  test('G4 — « Épaules » à 2 jours : le militaire, seul principal de sa zone, gagne sa série (3 → 4)', () => {
    const militaire = (rs) => exercices(rs).filter((x) => x.motif === 'militaire')[0];
    const base = G.generer(cat, sans('deux_jours_muscle_prio_epaules', 'priorites'));
    expect(militaire(base).series).toBe(3);
    expect(militaire(programme('deux_jours_muscle_prio_epaules')).series).toBe(4);
  });

  test('G4 — « Jambes » à 3 jours : le squat (principal) ne monte pas, sa zone a d’autres places ; les secondaires et isolations, si', () => {
    const avec = exercices(programme('trois_jours_force_prio_jambes'));
    const base = exercices(G.generer(cat, sans('trois_jours_force_prio_jambes', 'priorites')));
    const ligne = (xs, slug) => xs.filter((x) => x.exercise_slug === slug)[0];
    expect(ligne(avec, 'squat_barre').series).toBe(ligne(base, 'squat_barre').series);
    expect(ligne(avec, 'souleve_de_terre_barre').series).toBe(ligne(base, 'souleve_de_terre_barre').series);
    expect(ligne(avec, 'presse_a_cuisses').series).toBe(ligne(base, 'presse_a_cuisses').series + 1);
    expect(ligne(avec, 'extension_jambes').series).toBe(ligne(base, 'extension_jambes').series + 1);
  });

  test('G4 — en sèche, une priorité de ZONE ne change rien ; celle d’un EXERCICE donne toujours sa série', () => {
    const zone = programme('quatre_jours_muscle_seche_prio_bras');
    expect(zone).toEqual(G.generer(cat, sans('quatre_jours_muscle_seche_prio_bras', 'priorites')));
    const curl = exercices(programme('quatre_jours_muscle_seche_prio_exercice')).filter((x) => x.exercise_slug === 'curl_biceps_barre_ez')[0];
    expect(curl.prioritaire).toBe(true);
    expect(curl.series).toBe(4);
    // Hors sèche, la même priorité de zone, elle, change le programme (le test ci-dessus ne serait pas discriminant sinon).
    expect(G.generer(cat, Object.assign(sans('quatre_jours_muscle_seche_prio_bras'), { priorites: ['bras'], phase: 'maintien' })))
      .not.toEqual(zone);
  });
});

// ── LES BORNES ET LES APPELANTS HOSTILES ──────────────────────────────────────
describe('60-4 — generer ne lève jamais devant une entrée inattendue', () => {
  const cat = catalogue();

  test('les jours sont bornés de 2 à 6, et un nombre illisible tombe sur 3', () => {
    expect(G.bornerJours(1)).toBe(2);
    expect(G.bornerJours(7)).toBe(6);
    expect(G.bornerJours('4')).toBe(4);
    expect(G.bornerJours(3.9)).toBe(3);
    expect(G.bornerJours(undefined)).toBe(3);
    expect(G.bornerJours(NaN)).toBe(3);
    expect(G.generer(cat, { jours: null, materiel: 'salle_complete' })).toHaveLength(3);
  });

  test('un objectif inconnu prend les reps de « Muscle » ; une zone à ménager inconnue ne retire rien', () => {
    const muscle = G.generer(cat, { jours: 4, objectif: 'muscle', materiel: 'salle_complete' });
    expect(G.generer(cat, { jours: 4, objectif: 'inconnu', materiel: 'salle_complete' })).toEqual(muscle);
    expect(G.generer(cat, { jours: 4, objectif: 'muscle', materiel: 'salle_complete', menager: ['nuque'] })).toEqual(muscle);
  });

  test('sans matériel renseigné, rien n’est filtré : comme une salle complète', () => {
    const salle = G.generer(cat, { jours: 4, objectif: 'muscle', materiel: 'salle_complete' });
    expect(G.generer(cat, { jours: 4, objectif: 'muscle' })).toEqual(salle);
    expect(G.generer(cat, { jours: 4, objectif: 'muscle', materiel: 'inconnu' })).toEqual(salle);
  });

  test('un catalogue vide : des routines vides, pas d’exception', () => {
    const rs = G.generer({}, { jours: 4, materiel: 'salle_complete' });
    expect(rs).toHaveLength(4);
    rs.forEach((rt) => expect(rt.exercices).toEqual([]));
    expect(G.pourquoi({}, rs[0])).toBe('');
  });

  test('un muscle hors du radar tombe dans « Hors zone », à la fin, jamais rattaché au hasard', () => {
    const c = { x: { equipement: 'aucun', muscles_primaires: ['cardio'], muscles_secondaires: [] },
                y: { equipement: 'aucun', muscles_primaires: ['pectoraux'], muscles_secondaires: [] } };
    const rt = { nom: 'Z', exercices: [{ exercise_slug: 'x', series: 5 }, { exercise_slug: 'y', series: 3 }] };
    expect(G.pourquoi(c, rt)).toBe('Hors zone 5 · Poitrine 3 séries');
  });

  test('neVeuxPas sur une place qui n’existe pas rend les routines telles quelles', () => {
    const rs = G.generer(cat, { jours: 4, materiel: 'salle_complete' });
    const sortie = G.neVeuxPas(cat, rs, { jours: 4, ecartes: ['a'] }, 9, 9);
    expect(sortie.routines).toEqual(rs);
    expect(sortie.ecartes).toEqual(['a']);
  });

  test('écarter deux fois le même exercice ne le met qu’une fois dans les écartés', () => {
    const rs = G.generer(cat, { jours: 4, materiel: 'salle_complete' });
    const sortie = G.neVeuxPas(cat, rs, { jours: 4, materiel: 'salle_complete', ecartes: ['squat_barre'] }, 1, 0);
    expect(sortie.ecartes.filter((s) => s === 'squat_barre')).toHaveLength(1);
  });
});

// ── CÂBLER, JAMAIS DUPLIQUER ──────────────────────────────────────────────────
describe('60-4 — le module lit la table du matériel et les zones du radar, il ne les recopie pas', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../v2/js/generateur.js'), 'utf8')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

  test('la table du matériel de 60-1 est lue (`equipementsDe`), pas recopiée', () => {
    expect(src).toMatch(/THProfil\.equipementsDe\(/);
    ['maison_equipee', 'poids_du_corps'].forEach((m) => {
      // `poids_du_corps` apparaît pour l’élastique d’abord ; les autres valeurs de la table n’ont rien à faire ici.
      // (60-5, R3 : `salle_complete` et `salle_basique` y sont nommées — c'est le texte de la règle de la barre fixe,
      // pas la table du matériel ; leur existence au profil est gardée juste après.)
      if (m !== 'poids_du_corps') expect(src).not.toContain("'" + m + "'");
    });
    expect(src).not.toMatch(/'machine_smith'|'kettlebell'|'disque'/);
  });

  test('60-5 (R3) — les deux salles que la règle de la barre fixe nomme sont des matériels du profil', () => {
    const cles = Profil.MATERIELS.map((m) => m.cle);
    ['salle_complete', 'salle_basique'].forEach((m) => expect(cles).toContain(m));
    expect(src).toContain("var SALLES = ['salle_complete', 'salle_basique'];");
  });

  test('les zones et leurs libellés sont ceux du radar (`THSemaine.ZONES`), pas une liste à part', () => {
    expect(src).toMatch(/THSemaine\.ZONES/);
    expect(src).toMatch(/THSemaine\.zoneDuMuscle\(/);
    ['Poitrine', 'Épaules', 'Jambes', 'Tronc'].forEach((l) => expect(src).not.toContain("'" + l + "'"));
    // 66A : les tables de la relecture (QUESTIONNAIRE §5 ter) nomment des muscles — `MUSCLES` (l'ordre de la sèche),
    // `MUSCLES_SUIVIS`, `TIRAGE`. Hors d'elles, aucun nom de muscle : la table des zones reste celle du radar.
    const debut = src.indexOf('var BARRES = '), fin = src.indexOf('var EPS_RELECTURE');
    expect(debut > 0 && fin > debut).toBe(true);
    expect(src.slice(0, debut) + src.slice(fin)).not.toContain("'deltoide_lateral'");
    expect(src.slice(debut, fin)).toContain("'deltoide_lateral'");
    // … et ce sont les muscles du radar : tous, sans un de plus.
    const radar = globalThis.THSemaine.ZONES.reduce((l, z) => l.concat(z.muscles), []);
    expect(G.MUSCLES.slice().sort()).toEqual(radar.slice().sort());
    expect(G.MUSCLES_SUIVIS.filter((m) => G.MUSCLES.indexOf(m) < 0)).toEqual([]);
  });

  test('les zones à ménager que le générateur charge sont les cinq du profil', () => {
    expect(Object.keys(G.CHARGE_ZONE).sort()).toEqual(['coude', 'dos', 'epaule', 'genou', 'hanche']);
    // Le profil les valide : `zones_a_menager` ⊆ ces cinq clés (v2_065).
    expect(Profil.ZONES_A_MENAGER.map((z) => z.cle).sort()).toEqual(Object.keys(G.CHARGE_ZONE).sort());
  });

  test('le module ne touche ni au DOM, ni au réseau, ni au stockage', () => {
    expect(src).not.toMatch(/document\.|window\.|localStorage|fetch\(|XMLHttpRequest|Supabase|THDonnees|THClient/);
  });

  test('aucune charge, aucune chauffe, aucun repos : les lignes rendues n’en portent pas', () => {
    const cat = catalogue();
    G.generer(cat, { jours: 5, objectif: 'les_deux', materiel: 'salle_complete' }).forEach((rt) => {
      rt.exercices.forEach((x) => {
        expect(Object.keys(x).sort()).toEqual(['barre_fixe', 'exercise_slug', 'menage', 'motif', 'prioritaire', 'reps', 'role', 'series']);
      });
    });
  });
});
