/** @jest-environment node */
//
// 66D — LE GÉNÉRATEUR V2, LA FIN (QUESTIONNAIRE-COACH-V2 §5 quater.4-5). `Generateur.completer` (avec ses refus),
// `ranger` et `associer` rejouent les seize cas de la référence (`fixtures/gen66d.py`, `fixtures/cas-66d-generateur.json`)
// À L'IDENTIQUE ; les quinze de 66C restent ceux de `v2-completer.test.js` (le nouveau `gen66c.py` n'y change rien).
// Un écart se rapporte : il ne se corrige pas dans le cas.
//
// Puis les invariants des supersets (`verifierAssociation`, V6 à V9) : vides sur les huit sorties d'`associer`, et
// chacun MORD SEUL sur une sortie trafiquée. Puis la pureté, `habiller`, « Ce que j'ai changé » sur Léa, et la
// création : une paire s'écrit en superset (`Routines.routineDeduite`).

const fs = require('fs');
const path = require('path');

global.self = global;
require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Moteur = require('../../v2/js/moteur.js');
const Routines = require('../../v2/js/routines.js');
const G = require('../../v2/js/generateur.js');

const DONNEES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66d-generateur.json'), 'utf8'));
const DONNEES_66C = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66c-generateur.json'), 'utf8'));
const copie = (x) => JSON.parse(JSON.stringify(x));
const entreeDe = (c) => copie(Object.assign({}, c.entree, { catalogue: DONNEES.catalogue }));
const cas = (nom) => DONNEES.cas.filter((c) => c.nom === nom)[0];
const DE = (fonction) => DONNEES.cas.filter((c) => c.fonction === fonction);
const identite = (s) => s;
const routine = (s, nom) => s.routines.filter((r) => r.nom === nom)[0];
const ligne = (s, nom, slug) => routine(s, nom).exercices.filter((x) => x.exercise_slug === slug)[0];

describe('66D — les seize cas de la référence, à l’identique', () => {
  test('le fichier a seize cas : quatre `completer` avec refus, quatre `ranger`, huit `associer`', () => {
    expect(DONNEES.reference).toMatch(/^gen66d\.py /);
    expect(DONNEES.cas.map((c) => c.nom)).toEqual(['refus-muscle-lea', 'refus-reprise-lea',
      'refus-reprise-sans-remplacement', 'refus-tirage', 'ranger-lea', 'ranger-isolation-avant-les-isolations',
      'ranger-tronc-a-la-fin', 'ranger-jamais-avant-le-premier', 'associer-sans-manque-de-temps', 'associer-lea',
      'associer-haut', 'associer-tient-deja', 'associer-jamais-une-barre', 'associer-jambes', 'associer-refus',
      'associer-meme-classe']);
    expect([DE('completer').length, DE('ranger').length, DE('associer').length]).toEqual([4, 4, 8]);
    DONNEES.cas.forEach((c) => {
      expect([c.nom, typeof c.pourquoi === 'string' && c.pourquoi.length > 0, !!c.entree, !!c.attendu])
        .toEqual([c.nom, true, true, true]);
    });
  });

  DONNEES.cas.forEach((c) => {
    test(c.fonction + ' · ' + c.nom + ' — ' + c.pourquoi, () => {
      expect(G[c.fonction](entreeDe(c))).toEqual(c.attendu);
    });
  });

  test('les refus de `completer` tiennent ses invariants (V1-V5)', () => {
    DE('completer').forEach((c) => {
      const e = entreeDe(c);
      expect([c.nom, G.verifierComplement(e, G.completer(e))]).toEqual([c.nom, []]);
    });
  });

  test('sans refus, le complément de Léa est celui de 66C ; refuser un muscle ne le comble plus', () => {
    const c = cas('refus-muscle-lea');
    const sans = Object.assign(entreeDe(c), { refus: undefined });
    const lea66 = DONNEES_66C.cas.filter((x) => x.nom === 'reel-lea')[0].attendu;
    expect(G.completer(sans).journal).toEqual(lea66.journal);
    const avec = G.completer(entreeDe(c));
    expect(c.entree.refus).toEqual({ muscles: ['pectoraux'] });
    expect(avec.journal.some((j) => j.muscle === 'pectoraux')).toBe(false);
  });

  test('`ecartes` : un exercice écarté n’est jamais ajouté — le couché haltère de Léa, et rien ne le remplace pour lui', () => {
    const e = Object.assign(entreeDe(cas('refus-muscle-lea')), { refus: undefined, ecartes: ['developpe_couche_haltere'] });
    const s = G.completer(e);
    expect(s.routines.some((r) => r.exercices.some((x) => x.exercise_slug === 'developpe_couche_haltere'))).toBe(false);
    expect(G.verifierComplement(e, s)).toEqual([]);
  });
});

describe('66D — verifierAssociation : les invariants V6 à V9', () => {
  test('vide sur les huit sorties d’`associer`', () => {
    DE('associer').forEach((c) => {
      const e = entreeDe(c);
      expect([c.nom, G.verifierAssociation(e, G.associer(e))]).toEqual([c.nom, []]);
    });
  });

  test('V6 — une ligne changée se voit (une série de moins au rowing de Léa)', () => {
    const e = entreeDe(cas('associer-lea'));
    const t = copie(G.associer(e));
    ligne(t, 'DOS B', 'rowing_poulie_assis').series -= 1;
    expect(G.verifierAssociation(e, t)).toEqual(['V6 une ligne changée']);
  });

  test('V7 — une paire non contiguë se voit (le curl remonté avant le rowing)', () => {
    const e = entreeDe(cas('associer-haut'));
    const t = copie(G.associer(e));
    const ex = routine(t, 'Haut').exercices;
    const curl = ex.splice(ex.findIndex((x) => x.exercise_slug === 'curl_biceps_haltere'), 1)[0];
    ex.splice(ex.findIndex((x) => x.exercise_slug === 'rowing_poulie_assis'), 0, curl);
    expect(G.verifierAssociation(e, t)).toEqual(['V7 une paire non contiguë']);
  });

  test('V7 — un superset sans manque de temps se voit (curl et extension, antagonistes, contigus)', () => {
    const e = entreeDe(cas('associer-sans-manque-de-temps'));
    const t = copie(G.associer(e));
    ligne(t, 'Haut', 'curl_biceps_haltere').groupe_superset = 1;
    ligne(t, 'Haut', 'extension_triceps_poulie_haute').groupe_superset = 1;
    expect(G.verifierAssociation(e, t)).toEqual(['V7 un superset sans manque de temps']);
  });

  test('V8 — une barre lourde en superset se voit (le couché à la barre et le rowing, antagonistes)', () => {
    const e = entreeDe(cas('associer-jamais-une-barre'));
    const t = copie(G.associer(e));
    ligne(t, 'Lourd', 'developpe_couche_barre').groupe_superset = 1;
    ligne(t, 'Lourd', 'rowing_poulie_assis').groupe_superset = 1;
    expect(G.verifierAssociation(e, t)).toEqual(['V8 une barre lourde en superset']);
  });

  test('V9 — une paire non antagoniste se voit (le rowing et le curl : tirage et biceps)', () => {
    const e = entreeDe(cas('associer-tient-deja'));
    const t = copie(G.associer(e));
    ligne(t, 'Haut', 'rowing_poulie_assis').groupe_superset = 1;
    ligne(t, 'Haut', 'curl_biceps_haltere').groupe_superset = 1;
    expect(G.verifierAssociation(e, t)).toEqual(['V9 une paire non antagoniste']);
  });

  test('le repos du superset est celui du moteur (`DUREE_PAR_DEFAUT.reposSuperset`), jamais recopié', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/generateur.js'), 'utf8');
    expect(src).toMatch(/Moteur\.DUREE_PAR_DEFAUT\.reposSuperset/);
    expect(src).toMatch(/Moteur\.dureeEstimee\(S\)/);
    // Léa : 3 séries × (120 − 15) s de gain, la durée relue par l'estimation du moteur.
    const s = G.associer(entreeDe(cas('associer-lea')));
    const sup = s.journal.filter((j) => j.type === 'superset')[0];
    expect(sup.gain_s).toBe(3 * (120 - Moteur.DUREE_PAR_DEFAUT.reposSuperset));
  });
});

describe('66D — ranger, associer, habiller et changementsDeLApercu sont pures', () => {
  test('l’entrée n’est pas modifiée (copie profonde comparée avant et après)', () => {
    DE('ranger').concat(DE('associer')).forEach((c) => {
      const e = entreeDe(c);
      const avant = copie(e);
      G[c.fonction](e);
      expect([c.nom, e]).toEqual([c.nom, avant]);
    });
    const l = { exercise_slug: 'souleve_de_terre_roumain_barre', series: 3, reps: 10, chauffes: 1 };
    const p = { objectif: 'muscle', menager: ['dos'], priorites: [] };
    const [l0, p0] = [copie(l), copie(p)];
    G.habiller(DONNEES.catalogue, l, p);
    expect([l, p]).toEqual([l0, p0]);
    const jc = copie(cas('ranger-lea').entree.journal), ja = copie(cas('associer-lea').attendu.journal);
    const refus = { muscles: ['pectoraux'], reprises: [], tirage: false, paires: [] };
    const avant = copie([jc, ja, refus]);
    G.changementsDeLApercu(jc, ja, refus, identite);
    expect([jc, ja, refus]).toEqual(avant);
  });
});

describe('66D — habiller : une ligne déduite devient une place, par les règles du gabarit', () => {
  const p = { objectif: 'les_deux', menager: [], priorites: [] };
  test('le rôle d’après le rang : barre lourde P, polyarticulaire S, isolation I, tronc T ; ses séries et ses chauffes restent', () => {
    const h = (slug) => G.habiller(DONNEES.catalogue, { exercise_slug: slug, series: 4, reps: 6, chauffes: 2 }, p);
    expect(['squat_barre', 'presse_a_cuisses', 'leg_curl_assis', 'releve_de_jambes_allonge'].map((s) => h(s).role))
      .toEqual(['P', 'S', 'I', 'T']);
    expect(h('squat_barre')).toEqual({ exercise_slug: 'squat_barre', motif: 'squat', role: 'P', series: 4, reps: 6,
      prioritaire: false, menage: false, barre_fixe: false, chauffes: 2 });
    expect(h('tractions').barre_fixe).toBe(true);
    expect(G.habiller(DONNEES.catalogue, { exercise_slug: 'squat_barre', series: 3, reps: 5 }, p).chauffes).toBe(0);
  });

  test('ménagée : au moins les reps d’un secondaire (jamais moins que les siennes) ; la charnière bornée à 8', () => {
    const menager = { objectif: 'les_deux', menager: ['genou'], priorites: [] };
    const sq = G.habiller(DONNEES.catalogue, { exercise_slug: 'squat_barre', series: 4, reps: 5, chauffes: 2 }, menager);
    expect([sq.menage, sq.reps, sq.series]).toEqual([true, G.REPS.les_deux[1], 4]);
    const haut = G.habiller(DONNEES.catalogue, { exercise_slug: 'squat_barre', series: 4, reps: 15, chauffes: 0 }, menager);
    expect(haut.reps).toBe(15);
    const sdt = G.habiller(DONNEES.catalogue, { exercise_slug: 'souleve_de_terre_barre', series: 3, reps: 12 }, p);
    expect([sdt.motif, sdt.reps]).toEqual(['charniere', G.CHARNIERE_MAX]);
    // Des reps inconnues (aucune habitude) restent inconnues.
    expect(G.habiller(DONNEES.catalogue, { exercise_slug: 'squat_barre', series: 3, reps: null }, menager).reps).toBe(null);
  });
});

describe('66D — « Ce que j’ai changé » (changementsDeLApercu), au mot près', () => {
  const lea = () => DONNEES_66C.cas.filter((x) => x.nom === 'reel-lea')[0];
  const complLea = () => G.completer(Object.assign(copie(lea().entree), { catalogue: DONNEES_66C.catalogue }));
  const assocLea = () => G.associer(entreeDe(cas('associer-lea'))).journal;

  test('Léa (son complément, puis `associer-lea`) : quatre lignes, dans l’ordre des journaux', () => {
    const l = G.changementsDeLApercu(complLea().journal, assocLea(), {}, identite);
    expect(l.map((x) => x.texte)).toEqual(['DOS A revient.', 'developpe_couche_haltere 3 × 10 dans DOS B.',
      'extension_triceps_poulie_haute 2 × 10 dans DOS B.',
      'rowing_poulie_assis et developpe_couche_haltere en superset dans DOS B : ≈ 5 min de moins.']);
    expect(l.map((x) => x.cle)).toEqual(['reprise:DOS A', 'muscle:pectoraux', 'muscle:triceps',
      'paire:DOS B:rowing_poulie_assis:developpe_couche_haltere']);
    expect(l.every((x) => x.retire === false)).toBe(true);
  });

  test('le refus `muscle:pectoraux` (cas `refus-muscle-lea`) : la dernière ligne « Pectoraux : rien d’ajouté. », retirée', () => {
    const c = cas('refus-muscle-lea');
    const compl = G.completer(entreeDe(c));
    const l = G.changementsDeLApercu(compl.journal, assocLea(), c.entree.refus, identite);
    expect(l[l.length - 1]).toEqual({ cle: 'muscle:pectoraux', texte: 'Pectoraux : rien d’ajouté.', retire: true });
    expect(Semaine.libelleMuscle('pectoraux')).toBe('Pectoraux');
    expect(l.slice(0, -1).map((x) => x.texte)).toEqual(['DOS A revient.',
      'extension_triceps_poulie_haute 3 × 10 dans DOS B.', 'developpe_arnold_haltere 2 × 10 dans DOS B.',
      'rowing_poulie_assis et developpe_couche_haltere en superset dans DOS B : ≈ 5 min de moins.']);
  });

  test('les séries d’un même exercice pour une même clé en une ligne (`de` le premier, `a` le dernier) ; les refus à la fin, dans l’ordre', () => {
    const jc = [{ type: 'serie', motif: 'habitude', muscle: 'biceps', routine: 'Haut', exercise_slug: 'curl', de: 2, a: 3 },
      { type: 'serie', motif: 'tirage', muscle: 'grand_dorsal', routine: 'Haut', exercise_slug: 'rowing', de: 3, a: 4 },
      { type: 'serie', motif: 'habitude', muscle: 'biceps', routine: 'Haut', exercise_slug: 'curl', de: 3, a: 4 },
      { type: 'exercice', motif: 'tirage', muscle: 'haut_du_dos', routine: 'Haut', exercise_slug: 'face_pull', series: 2, reps: null }];
    const refus = { muscles: ['triceps'], reprises: ['Bas : B'], tirage: true, paires: [['Haut : A', 'Tractions', 'Couché']] };
    const nommer = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    expect(G.changementsDeLApercu(jc, [], refus, nommer)).toEqual([
      { cle: 'muscle:biceps', texte: 'Curl : 2 → 4 séries dans Haut.', retire: false },
      { cle: 'tirage', texte: 'Rowing : 3 → 4 séries dans Haut.', retire: false },
      { cle: 'tirage', texte: 'Face_pull 2 séries dans Haut.', retire: false },
      { cle: 'muscle:triceps', texte: 'Triceps : rien d’ajouté.', retire: true },
      { cle: 'reprise:Bas : B', texte: 'Bas : B ne revient pas.', retire: true },
      { cle: 'tirage', texte: 'Tirage : rien d’ajouté.', retire: true },
      { cle: 'paire:Haut : A:Tractions:Couché', texte: 'Tractions et couché en séries classiques.', retire: true }
    ]);
  });
});

describe('66D — la création : une paire s’écrit en superset (`Routines.routineDeduite`)', () => {
  const CATALOGUE = [
    { slug: 'rowing_poulie_assis', nom: 'Rowing poulie assis', mesure: 'charge_reps',
      muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps', 'haut_du_dos'] },
    { slug: 'developpe_couche_haltere', nom: 'Développé couché haltère', mesure: 'charge_reps',
      muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
    { slug: 'extension_triceps_poulie_haute', nom: 'Extension triceps poulie', mesure: 'charge_reps',
      muscles_primaires: ['triceps'], muscles_secondaires: [] }
  ];
  const opts = { exercices: CATALOGUE, routines: [], existants: [] };

  test('deux exercices au même `groupe_superset`, le premier sans repos (celui du superset), ses chauffes gardées', () => {
    const r = Routines.routineDeduite({ nom: 'DOS B', exercices: [
      { exercise_slug: 'rowing_poulie_assis', series: 3, reps: 10, chauffes: 1, groupe_superset: 1 },
      { exercise_slug: 'developpe_couche_haltere', series: 3, reps: 10, chauffes: 0, groupe_superset: 1 },
      { exercise_slug: 'extension_triceps_poulie_haute', series: 2, reps: 10, chauffes: 0, groupe_superset: null }
    ] }, opts);
    expect(r.exercices.map((e) => [e.exercise_slug, e.groupe_superset])).toEqual([
      ['rowing_poulie_assis', 1], ['developpe_couche_haltere', 1], ['extension_triceps_poulie_haute', null]]);
    expect(r.exercices.map((e) => [e.repos_cible_s, e.repos_origine])).toEqual([
      [null, 'superset'], [120, 'par défaut'], [90, 'par défaut']]);
    expect(r.exercices[0].series.map((s) => s.type_serie)).toEqual(['echauffement', 'travail', 'travail', 'travail']);
    // La structure qui en sort : le premier membre porte le repos du superset (MOTEUR §9.18).
    const S = Moteur.structureDeRoutine(r.exercices.map((e) => Object.assign({}, e, { series: e.series.map(Routines.enSaisie) })),
      Object.fromEntries(CATALOGUE.map((x) => [x.slug, x])));
    expect(S.map((x) => x.repos)).toEqual([null, 120, 90]);
  });

  test('sans paire, rien ne change : chaque exercice son bloc, son repos', () => {
    const sans = Routines.routineDeduite({ nom: 'DOS B', exercices: [
      { exercise_slug: 'rowing_poulie_assis', series: 3, reps: 10, chauffes: 0 },
      { exercise_slug: 'developpe_couche_haltere', series: 3, reps: 10, chauffes: 0 }] }, opts);
    const nuls = Routines.routineDeduite({ nom: 'DOS B', exercices: [
      { exercise_slug: 'rowing_poulie_assis', series: 3, reps: 10, chauffes: 0, groupe_superset: null },
      { exercise_slug: 'developpe_couche_haltere', series: 3, reps: 10, chauffes: 0, groupe_superset: null }] }, opts);
    expect(nuls).toEqual(sans);
    // Le rowing, premier polyarticulaire, reprend son repos de 180 s ; le couché, 120 s.
    expect(sans.exercices.map((e) => [e.groupe_superset, e.repos_cible_s])).toEqual([[null, 180], [null, 120]]);
  });
});

// 66D bis — LES NOMBRES D'UNE LIGNE SONT CEUX DE LA CARTE (VOIX : un libellé ne contredit jamais son chiffre). Les
// cartes sont celles de l'aperçu, après le raccourci de la durée : chaque test leur retire des séries et lit la ligne.
describe('66D bis — « Ce que j’ai changé » lit la carte, pas le journal', () => {
  const ajout = { type: 'exercice', motif: 'habitude', muscle: 'deltoide_lateral', routine: 'Haut',
    exercise_slug: 'elevation', series: 2, reps: 15 };
  const plus = [{ type: 'serie', motif: 'tirage', muscle: 'grand_dorsal', routine: 'Haut', exercise_slug: 'rowing', de: 3, a: 4 },
                { type: 'serie', motif: 'tirage', muscle: 'grand_dorsal', routine: 'Haut', exercise_slug: 'rowing', de: 4, a: 5 }];
  const paire = { type: 'superset', routine: 'Haut', a: 'rowing', b: 'couche', gain_s: 315 };
  const carte = (rowing, elevation, groupeCouche) => [{ nom: 'Haut', exercices: [
    { exercise_slug: 'rowing', series: rowing, reps: 10, groupe_superset: 1 },
    { exercise_slug: 'couche', series: 3, reps: 10, groupe_superset: groupeCouche === undefined ? 1 : groupeCouche }]
    .concat(elevation ? [{ exercise_slug: 'elevation', series: elevation, reps: 15, groupe_superset: null }] : []) }];
  const textes = (cartes) => G.changementsDeLApercu([plus[0], plus[1], ajout], [paire], {}, identite, cartes).map((l) => l.texte);

  test('⚠️ DISCRIMINANT — un ajout 2 × 15 que la carte montre à 1 × 15 : « … 1 × 15 dans … » ; une série de plus 3 → 5 ramenée à 4 : « 3 → 4 séries »', () => {
    expect(textes(carte(4, 1))).toEqual(['rowing : 3 → 4 séries dans Haut.', 'elevation 1 × 15 dans Haut.',
      'rowing et couche en superset dans Haut : ≈ 5 min de moins.']);
    // Sans le raccourci, les nombres sont ceux du journal (la carte les montre aussi).
    expect(textes(carte(5, 2))).toEqual(['rowing : 3 → 5 séries dans Haut.', 'elevation 2 × 15 dans Haut.',
      'rowing et couche en superset dans Haut : ≈ 5 min de moins.']);
  });

  test('une série de plus ramenée à `de`, un ajout retiré par le raccourci : pas de ligne — N diminue', () => {
    expect(textes(carte(3, 0))).toEqual(['rowing et couche en superset dans Haut : ≈ 5 min de moins.']);
    expect(G.changementsDeLApercu([plus[0], plus[1], ajout], [], {}, identite, carte(3, 0))).toEqual([]);
  });

  test('une paire dont le raccourci a défait le superset n’est plus dite ; reprise et refus inchangés', () => {
    const l = G.changementsDeLApercu([{ type: 'reprise', routine: 'Bas' }], [paire], { muscles: ['biceps'] }, identite,
      carte(5, 2, null));
    expect(l.map((x) => [x.cle, x.texte, x.retire])).toEqual([['reprise:Bas', 'Bas revient.', false],
      ['muscle:biceps', 'Biceps : rien d’ajouté.', true]]);
  });

  test('Léa (`associer-lea` puis le raccourci de l’app) : chaque nombre dit est celui de la carte', () => {
    const lea = DONNEES_66C.cas.filter((x) => x.nom === 'reel-lea')[0];
    const compl = G.completer(Object.assign(copie(lea.entree), { catalogue: DONNEES_66C.catalogue }));
    const assoc = G.associer(entreeDe(cas('associer-lea')));
    // La carte : la sortie d'`associer`, l'extension du triceps raccourcie à une série.
    const cartes = copie(assoc.routines);
    routine({ routines: cartes }, 'DOS B').exercices.filter((x) => x.exercise_slug === 'extension_triceps_poulie_haute')[0].series = 1;
    expect(G.changementsDeLApercu(compl.journal, assoc.journal, {}, identite, cartes).map((x) => x.texte)).toEqual([
      'DOS A revient.', 'developpe_couche_haltere 3 × 10 dans DOS B.', 'extension_triceps_poulie_haute 1 × 10 dans DOS B.',
      'rowing_poulie_assis et developpe_couche_haltere en superset dans DOS B : ≈ 5 min de moins.']);
  });
});
