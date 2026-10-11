//
// 60-4 (4/7) — L'APERÇU DU PROGRAMME CONSTRUIT ET SA CRÉATION (QUESTIONNAIRE-COACH-V2 §5 bis).
//
//   · le moteur : la cible de durée du programme (G8, MOTEUR §9.18) et le « ≈ 69 min » ;
//   · le générateur : « Remplacer » (SEULE la place change), les mentions sous un exercice, les phrases du haut ;
//   · le rendu : une carte par séance, le nom, la durée, la ligne « pourquoi », séries × reps, « Créer ces N routines » ;
//   · les gestes (`app.js`, rejoués dans un bac `vm` avec les VRAIS modules) : RIEN n'est écrit à l'ouverture ;
//     « Je n'en veux pas » change une place et écrit l'écarté au geste ; « Créer » passe par le chemin de 8a (le
//     dossier « Mon programme », jamais de charge ni de chauffe), puis écrit le dossier et la date ; deux taps ne
//     créent pas deux fois ; une panne au milieu garde le même dossier et ne recrée rien.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
const Moteur = require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
const Routines = require('../../v2/js/routines.js');
const Profil = require('../../v2/js/profil.js');
const Generateur = require('../../v2/js/generateur.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
const cas = (id) => CAS.generer.find((c) => c.id === id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const texte = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const NBSP = ' ';

// Le catalogue de l'app (slug, nom, mesure, équipement, muscles), tiré de celui du fichier de cas.
const CATALOGUE = Object.keys(CAS.catalogue).map((slug) => {
  const [equipement, primaires, secondaires] = CAS.catalogue[slug];
  return { slug, nom: slug.replace(/_/g, ' '), mesure: 'charge_reps', equipement,
           muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
});
const INDEX = Modele.indexerExercices(CATALOGUE);
const nom = (slug) => Modele.nommer(INDEX, slug);
const cat = () => {
  const c = {};
  CATALOGUE.forEach((e) => { c[e.slug] = { equipement: e.equipement, muscles_primaires: e.muscles_primaires.slice(),
                                           muscles_secondaires: e.muscles_secondaires.slice() }; });
  return c;
};

// ═══ LE MOTEUR ══════════════════════════════════════════════════════════════
describe('le moteur : la cible de durée du programme (G8) et le « ≈ N min »', () => {
  test('« C’est mon maximum », « Moins en ce moment » et « Ça varie » tiennent la durée déclarée ; « J’ai de la marge » ou rien : pas de raccourci', () => {
    expect(Moteur.cibleDuProgramme('max', 60)).toBe(60);
    expect(Moteur.cibleDuProgramme('moins', 45)).toBe(45);
    expect(Moteur.cibleDuProgramme('varie', 75)).toBe(75);
    expect(Moteur.cibleDuProgramme('marge', 60)).toBeNull();
    expect(Moteur.cibleDuProgramme(null, 60)).toBeNull();
    expect(Moteur.cibleDuProgramme(undefined, 60)).toBeNull();
  });

  test('il faut une durée déclarée valide (10 à 300, entière) ; « Juste un carnet » se tait', () => {
    expect(Moteur.cibleDuProgramme('max', null)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 5)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 301)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 62.5)).toBeNull();
    expect(Moteur.cibleDuProgramme('max', '75')).toBe(75);
    expect(Moteur.cibleDuProgramme('max', 60, 'entretien')).toBeNull();
    expect(Moteur.cibleDuProgramme('max', 60, 'progresser')).toBe(60);
  });

  test('« ≈ 69 min », insécables, arrondi à la minute comme les autres phrases de durée', () => {
    expect(Moteur.texteDureeCourte(4140)).toBe('≈' + NBSP + '69' + NBSP + 'min');
    expect(Moteur.texteDureeCourte(3610)).toBe('≈' + NBSP + '60' + NBSP + 'min');
    expect(Moteur.texteDureeEstimee(4140)).toBe('Environ 69 min (estimation)');
  });
});

// ═══ LE GÉNÉRATEUR : ce que le coach dit de l'aperçu ════════════════════════
describe('le générateur : « Remplacer », les mentions et les phrases', () => {
  const entree = () => Object.assign({ faits: {}, priorites: [], menager: [], ecartes: [] }, clone(cas('neuf_4j_les_deux').entree));

  test('« Remplacer » : SEULE la place touchée change — les séries restent, les reps suivent le nouvel exercice, rien ne s’écarte', () => {
    const c = cat(), e = entree();
    const avant = Generateur.generer(c, e);
    const copie = clone(avant);
    const apres = Generateur.remplacePar(c, avant, e, 0, 0, 'developpe_couche_haltere');
    expect(avant).toEqual(copie);                                   // rien n'est modifié en place
    const x = apres[0].exercices[0], v = avant[0].exercices[0];
    expect(x.exercise_slug).toBe('developpe_couche_haltere');
    expect(x.series).toBe(v.series);
    expect(x.motif).toBe('couche');
    expect(x.reps).toBe(9);                                         // lourd seulement à la barre : un principal hors barre prend les reps d'un secondaire
    expect(v.reps).toBe(5);
    // Les autres places, les autres séances : identiques.
    expect(apres[0].exercices.slice(1)).toEqual(avant[0].exercices.slice(1));
    expect(apres.slice(1)).toEqual(avant.slice(1));
    expect(e.ecartes).toEqual([]);
  });

  test('un slug hors catalogue, une place inconnue : rien ne change', () => {
    const c = cat(), e = entree(), avant = Generateur.generer(c, e);
    expect(Generateur.remplacePar(c, avant, e, 0, 0, 'inconnu')).toEqual(avant);
    expect(Generateur.remplacePar(c, avant, e, 9, 0, 'developpe_couche_haltere')).toEqual(avant);
    expect(Generateur.remplacePar(c, avant, e, 0, 99, 'developpe_couche_haltere')).toEqual(avant);
  });

  test('les mentions sous un exercice : « sans série lourde · ton genou », « demande une barre fixe » (hors des salles)', () => {
    const genou = { menager: ['genou'], materiel: 'salle_complete' };
    expect(Generateur.mentionsDeLigne({ motif: 'squat', barre_fixe: false }, genou)).toEqual(['sans série lourde · ton genou']);
    expect(Generateur.mentionsDeLigne({ motif: 'couche', barre_fixe: false }, genou)).toEqual([]);
    expect(Generateur.mentionsDeLigne({ motif: 'squat' }, { menager: ['genou', 'dos'] }))
      .toEqual(['sans série lourde · ton genou et ton dos']);
    expect(Generateur.mentionsDeLigne({ motif: 'hip_thrust' }, { menager: ['hanche'] })).toEqual(['sans série lourde · ta hanche']);
    expect(Generateur.mentionsDeLigne({ motif: 'tirage_vertical', barre_fixe: true }, { materiel: 'poids_du_corps' }))
      .toEqual(['demande une barre fixe']);
    expect(Generateur.mentionsDeLigne({ motif: 'tirage_vertical', barre_fixe: true }, { materiel: 'salle_complete' })).toEqual([]);
    expect(Generateur.mentionsDeLigne({ motif: 'rowing', barre_fixe: true }, { menager: ['dos'], materiel: 'poids_du_corps' }))
      .toEqual(['sans série lourde · ton dos', 'demande une barre fixe']);
    // R3 (60-5) : la condition est l'EXERCICE, jamais l'étiquette du matériel.
    expect(Generateur.mentionsDeLigne({ motif: 'tirage_vertical', barre_fixe: true }, { materiel: 'maison_equipee' })).toEqual(['demande une barre fixe']);
    expect(Generateur.mentionsDeLigne({ motif: 'tirage_vertical', barre_fixe: true }, { materiel: 'maison_minimal' })).toEqual(['demande une barre fixe']);
    expect(Generateur.mentionsDeLigne({ motif: 'tirage_vertical', barre_fixe: true }, { materiel: 'salle_basique' })).toEqual([]);
    expect(Generateur.mentionsDeLigne({ motif: 'rowing', barre_fixe: false }, { materiel: 'maison_equipee' })).toEqual([]);
    expect(Generateur.mentionsDeLigne({ motif: 'rowing', barre_fixe: false }, { materiel: 'poids_du_corps' })).toEqual([]);
  });

  test('les phrases du haut : le nombre de séances, une phrase par zone, la barre fixe — au mot près', () => {
    const c = cat();
    const e = Object.assign(entree(), { menager: ['genou'] });
    const rts = Generateur.generer(c, e);
    const p = Generateur.phrasesDeLApercu(rts, e, nom);
    expect(p.titre).toBe('4 séances par semaine.');
    expect(p.zones.length).toBe(1);
    expect(p.zones[0]).toMatch(/^Tu ménages ton genou : .+, sans série lourde\. Toutes leurs séries restent\.$/);
    expect(p.zones[0]).toContain(nom('squat_barre'));
    expect(p.barreFixe).toBe('');
    // Le dos ajoute la limite du soulevé quand le programme en porte un.
    const d = Object.assign(entree(), { menager: ['dos'] });
    const pd = Generateur.phrasesDeLApercu(Generateur.generer(c, d), d, nom);
    expect(pd.zones[0]).toMatch(/^Tu ménages ton dos : .+, sans série lourde\. Toutes leurs séries restent ; 8 répétitions au plus au soulevé\.$/);
    // Aucune zone : aucune phrase.
    expect(Generateur.phrasesDeLApercu(rts, entree(), nom).zones).toEqual([]);
    // Le total du programme, quand toutes les séances ne sont pas à créer.
    expect(Generateur.phrasesDeLApercu(rts.slice(2), e, nom, 4).titre).toBe('4 séances par semaine.');
  });

  test('la barre fixe : une phrase quand le programme contient une traction ou un rowing inversé, « demande » / « demandent »', () => {
    const c = cat();
    const e = Object.assign(clone(cas('neuf_3j_poids_du_corps').entree), { faits: {}, priorites: [], menager: [], ecartes: [] });
    const rts = Generateur.generer(c, e);
    const p = Generateur.phrasesDeLApercu(rts, e, nom);
    const fixes = [];
    rts.forEach((rt) => rt.exercices.forEach((x) => { if (x.barre_fixe && fixes.indexOf(nom(x.exercise_slug)) < 0) fixes.push(nom(x.exercise_slug)); }));
    if (fixes.length) {
      expect(p.barreFixe).toBe(fixes.join(' et ') + (fixes.length > 1 ? ' demandent' : ' demande') +
        ' une barre fixe. Sans barre : touche-le, puis Remplacer.');
    } else {
      expect(p.barreFixe).toBe('');
    }
    expect(Generateur.phrasesDeLApercu(rts, Object.assign({}, e, { materiel: 'salle_complete' }), nom).barreFixe).toBe('');
  });

  // ═══ R3 (60-5) : LA BARRE FIXE SE DIT SELON L'EXERCICE, PAS SELON LE MATÉRIEL ══════════════════════════════
  // « tractions » et « rowing_inverse » (`BARRE_FIXE`) : la phrase et la mention s'affichent dès que le programme en
  // contient un, pour tout matériel sauf les deux salles.
  describe('la barre fixe : l’exercice présent décide, jamais l’étiquette du matériel (R3)', () => {
    const avec = (materiel, extra) => {
      const e = Object.assign(clone(cas('neuf_4j_les_deux').entree), { faits: {}, priorites: [], menager: [], ecartes: [] }, extra || {}, { materiel });
      return { e, rts: Generateur.generer(cat(), e) };
    };
    const fixes = (rts) => [].concat.apply([], rts.map((rt) => rt.exercices.filter((x) => x.barre_fixe).map((x) => x.exercise_slug)));

    test('⚠️ DISCRIMINANT — maison équipée avec une traction : la phrase, et la mention sous la ligne', () => {
      const { e, rts } = avec('maison_equipee');
      expect(fixes(rts)).toEqual(['tractions']);
      const p = Generateur.phrasesDeLApercu(rts, e, nom);
      expect(p.barreFixe).toBe(nom('tractions') + ' demande une barre fixe. Sans barre : touche-le, puis Remplacer.');
      const ligne = [].concat.apply([], rts.map((rt) => rt.exercices)).find((x) => x.exercise_slug === 'tractions');
      expect(Generateur.mentionsDeLigne(ligne, e)).toEqual(['demande une barre fixe']);
    });

    test('⚠️ DISCRIMINANT — maison équipée SANS traction (rowing aux haltères) : pas de phrase, pas de mention', () => {
      const { e, rts } = avec('maison_equipee', { ecartes: ['tractions', 'rowing_inverse'] });
      expect(fixes(rts)).toEqual([]);
      expect(Generateur.phrasesDeLApercu(rts, e, nom).barreFixe).toBe('');
      rts.forEach((rt) => rt.exercices.forEach((x) => expect(Generateur.mentionsDeLigne(x, e)).toEqual([])));
      const noms = [].concat.apply([], rts.map((rt) => rt.exercices.map((x) => x.exercise_slug)));
      expect(noms).toContain('rowing_haltere');
    });

    test('les salles : jamais, même avec une traction au programme', () => {
      ['salle_complete', 'salle_basique'].forEach((m) => {
        const { e, rts } = avec(m);
        expect(fixes(rts)).toContain('tractions');
        expect(Generateur.phrasesDeLApercu(rts, e, nom).barreFixe).toBe('');
        [].concat.apply([], rts.map((rt) => rt.exercices)).forEach((x) => expect(Generateur.mentionsDeLigne(x, e)).toEqual([]));
      });
    });

    test('poids du corps (rowing inversé + tractions) : « demandent », au pluriel — comme avant', () => {
      const { e, rts } = avec('poids_du_corps');
      expect(fixes(rts).sort()).toEqual(['rowing_inverse', 'tractions']);
      expect(Generateur.phrasesDeLApercu(rts, e, nom).barreFixe).toBe(
        nom('rowing_inverse') + ' et ' + nom('tractions') + ' demandent une barre fixe. Sans barre : touche-le, puis Remplacer.');
    });

    test('⚠️ DISCRIMINANT (60-6, S5) — matériel non renseigné avec une traction : PAS de phrase, pas de mention', () => {
      [null, '', undefined].forEach((vide) => {
        const { e, rts } = avec(vide);
        expect(fixes(rts)).toEqual(['tractions']);                      // la traction est bien au programme : le chemin est joué
        expect(Generateur.phrasesDeLApercu(rts, e, nom).barreFixe).toBe('');
        [].concat.apply([], rts.map((rt) => rt.exercices)).forEach((x) => expect(Generateur.mentionsDeLigne(x, e)).toEqual([]));
      });
    });

    test('⚠️ DISCRIMINANT (60-6, S5) — les MÊMES routines avec « maison équipée » au lieu de « non renseigné » : la phrase se dit', () => {
      const { e, rts } = avec(null);
      expect(Generateur.phrasesDeLApercu(rts, e, nom).barreFixe).toBe('');
      const maison = Object.assign({}, e, { materiel: 'maison_equipee' });
      expect(Generateur.phrasesDeLApercu(rts, maison, nom).barreFixe).toContain('demande une barre fixe');
      const ligne = [].concat.apply([], rts.map((rt) => rt.exercices)).find((x) => x.exercise_slug === 'tractions');
      expect(Generateur.mentionsDeLigne(ligne, e)).toEqual([]);
      expect(Generateur.mentionsDeLigne(ligne, maison)).toEqual(['demande une barre fixe']);
    });

    test('une traction posée par « Remplacer » en maison équipée : la mention suit (l’exercice, pas la place)', () => {
      const { e, rts } = avec('maison_equipee', { ecartes: ['tractions'] });
      const i = rts[0].exercices.findIndex((x) => x.motif === 'tirage_vertical');
      const apres = Generateur.remplacePar(cat(), rts, e, 0, i, 'tractions');
      expect(apres[0].exercices[i].barre_fixe).toBe(true);
      expect(Generateur.mentionsDeLigne(apres[0].exercices[i], e)).toEqual(['demande une barre fixe']);
      expect(Generateur.phrasesDeLApercu(apres, e, nom).barreFixe).toContain(nom('tractions') + ' demande une barre fixe');
    });
  });
});

// ═══ LE RENDU ═══════════════════════════════════════════════════════════════
describe('le rendu de l’aperçu', () => {
  const vue = (extra) => Object.assign({
    titre: '4 séances par semaine.',
    voix: ['Je te propose tes charges à chaque séance. Touche un exercice pour le changer.', 'Tu ménages ton genou : Squat, sans série lourde. Toutes leurs séries restent.'],
    routines: [
      { nom: 'Haut A', duree: '≈' + NBSP + '69' + NBSP + 'min', pourquoi: 'Poitrine 10 · Dos 6 séries',
        exercices: [{ nom: 'Développé couché', series: '4' + NBSP + '×' + NBSP + '5', mentions: [], neuf: false },
                    { nom: 'Squat', series: '4' + NBSP + '×' + NBSP + '9', mentions: ['sans série lourde · ton genou'], neuf: true }] },
      { nom: 'Bas A', duree: '≈' + NBSP + '50' + NBSP + 'min', pourquoi: '', exercices: [] }
    ],
    erreur: '', enCours: false, libelleCreer: 'Créer ces 2 routines',
    surExercice: () => {}, surCreer: () => {}, surPasMaintenant: () => {}
  }, extra);

  test('le titre, la voix du coach, une carte par séance, chaque exercice en bouton avec séries × reps', () => {
    const cible = document.createElement('div');
    Rendu().rendreApercuProgramme(cible, vue());
    expect(texte(cible.querySelector('.feuille-t'))).toBe('4 séances par semaine.');
    expect(Array.from(cible.querySelectorAll('.q-voix')).map(texte)).toEqual([
      'Je te propose tes charges à chaque séance. Touche un exercice pour le changer.',
      'Tu ménages ton genou : Squat, sans série lourde. Toutes leurs séries restent.']);
    const cartes = cible.querySelectorAll('.ap-routine');
    expect(cartes.length).toBe(2);
    expect(texte(cartes[0].querySelector('.ap-nom'))).toBe('Haut A');
    expect(cartes[0].querySelector('.ap-duree').textContent).toBe('≈' + NBSP + '69' + NBSP + 'min');
    expect(texte(cartes[0].querySelector('.ap-pourquoi'))).toBe('Poitrine 10 · Dos 6 séries');
    expect(cartes[1].querySelector('.ap-pourquoi')).toBeNull();
    const ex = cartes[0].querySelectorAll('.ap-ex');
    expect(Array.from(ex).map((b) => [texte(b.querySelector('.ap-ex-nom')), texte(b.querySelector('.ap-ex-series'))]))
      .toEqual([['Développé couché', '4 × 5'], ['Squat', '4 × 9']]);
    expect(texte(ex[1].querySelector('.ap-ex-mention'))).toBe('sans série lourde · ton genou');
    expect(ex[1].classList.contains('neuf')).toBe(true);
    expect(ex[0].classList.contains('neuf')).toBe(false);
  });

  test('toucher un exercice rend ses indices ; « Créer ces N routines » et « Pas maintenant » sont les deux boutons du pied', () => {
    const cible = document.createElement('div');
    const touches = []; let cree = 0, ferme = 0;
    Rendu().rendreApercuProgramme(cible, vue({ surExercice: (i, k) => touches.push([i, k]), surCreer: () => { cree++; },
      surPasMaintenant: () => { ferme++; } }));
    cible.querySelectorAll('.ap-routine')[0].querySelectorAll('.ap-ex')[1].click();
    expect(touches).toEqual([[0, 1]]);
    const pied = cible.querySelector('.feuille-menu');
    expect(Array.from(pied.querySelectorAll('button')).map(texte)).toEqual(['Créer ces 2 routines', 'Pas maintenant']);
    pied.querySelectorAll('button')[0].click();
    pied.querySelectorAll('button')[1].click();
    expect([cree, ferme]).toEqual([1, 1]);
  });

  test('66D — « Ce que j’ai changé · N » : une ligne par changement, « Retirer » / « Remettre » rendent leur indice ; sans ligne, aucun bloc', () => {
    const cible = document.createElement('div');
    const touches = [];
    Rendu().rendreApercuProgramme(cible, vue({
      changements: { titre: 'Ce que j’ai changé · 1', lignes: [
        { texte: 'DOS A revient.', retire: false, libelle: 'Retirer' },
        { texte: 'Pectoraux : rien d’ajouté.', retire: true, libelle: 'Remettre' }] },
      surChangement: (n) => touches.push(n) }));
    const bloc = cible.querySelector('.ap-changements');
    expect(texte(bloc.querySelector('.ap-chg-titre'))).toBe('Ce que j’ai changé · 1');
    const lignes = bloc.querySelectorAll('.ap-chg');
    expect(Array.from(lignes).map((l) => [texte(l.querySelector('.ap-chg-texte')), texte(l.querySelector('button')),
      l.classList.contains('retire')])).toEqual([['DOS A revient.', 'Retirer', false], ['Pectoraux : rien d’ajouté.', 'Remettre', true]]);
    lignes[1].querySelector('button').click();
    lignes[0].querySelector('button').click();
    expect(touches).toEqual([1, 0]);
    // Le bloc vient après la voix et avant les cartes.
    const ordre = Array.from(cible.children).map((n) => n.className);
    expect(ordre.indexOf('ap-changements')).toBeGreaterThan(ordre.lastIndexOf('q-voix apercu-voix'));
    expect(ordre.indexOf('ap-changements')).toBeLessThan(ordre.indexOf('apercu-programme'));
    const sans = document.createElement('div');
    Rendu().rendreApercuProgramme(sans, vue({ changements: null }));
    expect(sans.querySelector('.ap-changements')).toBeNull();
    Rendu().rendreApercuProgramme(sans, vue({ changements: { titre: 'Ce que j’ai changé · 0', lignes: [] } }));
    expect(sans.querySelector('.ap-changements')).toBeNull();
  });

  test('66D — une séance reprise porte « ◆ reprise » (hors du nom) ; deux voisins au même `paire` : un bloc « Superset », les indices gardés', () => {
    const cible = document.createElement('div');
    const touches = [];
    const ex = (nom, paire, neuf) => ({ nom, series: '3' + NBSP + '×' + NBSP + '10', mentions: [], neuf: !!neuf, paire });
    Rendu().rendreApercuProgramme(cible, vue({
      routines: [{ nom: 'DOS B', reprise: true, duree: '≈' + NBSP + '51' + NBSP + 'min', pourquoi: '',
        exercices: [ex('Tractions', null), ex('Rowing poulie assis', 1), ex('Développé couché haltère', 1, true),
                    ex('Extension triceps poulie', null, true), ex('Curl', 2)] }],
      surExercice: (i, k) => touches.push([i, k]) }));
    const carte = cible.querySelector('.ap-routine');
    expect(texte(carte.querySelector('.ap-nom'))).toBe('DOS B');
    expect(texte(carte.querySelector('.ap-reprise'))).toBe('◆ reprise');
    const paires = carte.querySelectorAll('.ap-paire');
    expect(paires.length).toBe(1);                          // le « Curl » seul de son groupe n'est pas une paire
    expect(texte(paires[0].querySelector('.ap-paire-t'))).toBe('Superset');
    expect(Array.from(paires[0].querySelectorAll('.ap-ex-nom')).map(texte)).toEqual(['Rowing poulie assis', 'Développé couché haltère']);
    expect(paires[0].querySelectorAll('.ap-ex')[1].classList.contains('neuf')).toBe(true);
    expect(Array.from(carte.querySelectorAll('.ap-ex-nom')).map(texte)).toEqual(['Tractions', 'Rowing poulie assis',
      'Développé couché haltère', 'Extension triceps poulie', 'Curl']);
    paires[0].querySelectorAll('.ap-ex')[1].click();
    carte.querySelectorAll('.ap-ex')[3].click();
    expect(touches).toEqual([[0, 2], [0, 3]]);
    const sansReprise = document.createElement('div');
    Rendu().rendreApercuProgramme(sansReprise, vue());
    expect(sansReprise.querySelector('.ap-reprise')).toBeNull();
    expect(sansReprise.querySelector('.ap-paire')).toBeNull();
  });

  test('66D — le bouton « Retirer » se touche au doigt (44 px), et les styles de l’aperçu v2 existent', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
    expect(css).toMatch(/\.ap-chg-geste\{[^}]*min-height:44px/);
    ['.ap-changements{', '.ap-chg.retire{', '.ap-reprise{', '.ap-paire{', '.ap-paire-t{', '.ap-ex.neuf .ap-ex-nom::before{']
      .forEach((sel) => expect([sel, css.indexOf(sel) >= 0]).toEqual([sel, true]));
  });

  test('pendant l’écriture : « Création… », éteint ; l’erreur est dite', () => {
    const cible = document.createElement('div');
    Rendu().rendreApercuProgramme(cible, vue({ enCours: true, erreur: 'Pas de réseau : rien n’a été enregistré.' }));
    const creer = cible.querySelector('.apercu-creer');
    expect(texte(creer)).toBe('Création…');
    expect(creer.disabled).toBe(true);
    expect(texte(cible.querySelector('.erreur'))).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(cible.querySelector('.erreur').getAttribute('role')).toBe('alert');
  });
});

// ═══ LES GESTES (`app.js`) ══════════════════════════════════════════════════
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(n) {
  const m = APP.match(new RegExp('^  (async )?function ' + n + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + n);
  return m[0];
}
const FONCTIONS = ['freresDe', 'cousinsDe', 'brouillonDeStructure', 'creerRoutineNeuve', 'creerDansUnDossier', 'ouvrirBibliothequeSur',
  'rangSuivantBibliotheque', 'nomsReserves', 'messageVerdict',
  'entreeDuProgramme', 'aUnHistorique', 'cibleDuProgrammeConstruit', 'structureDuProgramme', 'assemblerLeProgramme',
  'basculerChangement', 'ligneDeRetouche', 'deduiteDuProgramme', 'fondreLesVoisins', 'raccourcirLeProgramme', 'lectureDuProgramme',
  'seriesFois', 'rendreApercuDuProgramme', 'ouvrirApercuProgramme', 'ouvrirExerciceDuProgramme',
  'ecarterDansLeProgramme', 'remplacerDansLeProgramme', 'poserDansLeProgramme', 'versLeCatalogueDuProgramme',
  'creerLeProgramme'];

function bac(options) {
  const o = options || {};
  const journal = { routines: [], exercices: [], series: [], feuilles: [], voile: 0, ferme: 0, saisie: 0, chargements: 0,
                    profil: [], catalogue: [], confirmer: [], choix: [], machine: [], rendreSaisie: 0, seriesDe: {}, supprimees: [] };
  let n = 0;
  const Donnees = {
    creerRoutine: async (ligne) => {
      if (o.panne && o.panne(journal.routines.length)) throw new Error('Failed to fetch');
      journal.routines.push(ligne);
      return Object.assign({ id: 'r' + (++n) }, ligne);
    },
    insererExercices: async (lignes) => {
      if (o.panneExercices && o.panneExercices(journal.exercices.length)) throw new Error('Failed to fetch');
      journal.exercices.push(lignes);
    },
    remplacerSeriesRoutine: async (id, lignes) => { journal.series.push(lignes); journal.seriesDe[id] = lignes; },
    supprimerExercices: async () => {}, majExercice: async () => {},
    supprimerRoutine: async (id) => {
      if (o.suppressionHS && o.suppressionHS()) throw new Error('Failed to fetch');
      journal.supprimees.push(id);
    }
  };
  const profil = Object.assign({ seances_par_semaine: 4, objectif: 'les_deux', phase: null, materiel: 'salle_complete',
    priorites: null, zones_a_menager: null, exercices_ecartes: null, temps_reponse: null, duree_seance_min: null,
    intention: 'progresser' }, o.profil || {});
  const ctx = {
    Routines, Modele, Moteur, Profil, Generateur: o.generateur || Generateur, Donnees,
    Seance: o.freres ? { freresProposes: () => o.freres.map((f) => Object.assign({ deja_dans_la_seance: false }, f)) } : { freresProposes: () => [] },
    Rendu: {
      rendreApercuProgramme: (c, v) => { journal.feuilles.push(v); ctx.__vue = v; },
      rendreFeuilleChoix: (c, v) => { journal.choix.push(v); ctx.__choix = v; },
      rendreFeuilleMachinePrise: (c, v) => { journal.machine.push(v); ctx.__machine = v; },
      rendreFeuilleConfirmer: (c, v) => { journal.confirmer.push(v); }
    },
    // 66D — sans historique par défaut (`habitudes` nul) : le gabarit, comme en 60-4.
    faits: { historiqueDesExercices: () => (o.faits || {}), habitudes: () => o.habitudes || null,
             programmeDeduit: () => o.deduit || [], derniereSeance: () => o.derniere || null },
    Semaine: globalThis.THSemaine,
    Questionnaire: { joursValides: (n) => typeof n === 'number' && n >= 2 && n <= 6 && Math.floor(n) === n },
    volumeDuCoach: () => o.volume || {},
    corpus: () => ({}),
    catalogueIndexe: () => INDEX,
    local: { exercices: o.catalogueVide ? [] : CATALOGUE },
    profil,
    // Le vrai `poserProfil` met `profil` à jour AVANT son premier `await` et ne rejette jamais : hors ligne, l'envoi
    // échoue et le drapeau reste levé, mais l'état local garde le geste.
    poserProfil: (champs) => {
      journal.profil.push(clone(champs));
      Object.assign(ctx.profil, champs);
      return Promise.resolve();
    },
    routines: o.nonLues ? [] : (o.routines || []).slice(),
    etatRoutines: o.nonLues ? { code: 'echec', message: 'Pas de réseau.' } : { code: 'ok' },
    chargerRoutines: async () => {
      journal.chargements++;
      if (o.chargementHS && o.chargementHS()) { ctx.etatRoutines = { code: 'echec', message: 'Pas de réseau.' }; return false; }
      if (o.retenirRechargement && journal.chargements > 0) await new Promise((r) => { ctx.__lacher = r; });
      ctx.etatRoutines = { code: 'ok' };
      ctx.routines = (o.routines || []).concat(journal.routines.map((l, i) => Object.assign({ id: 'r' + (i + 1), exercices: [] }, l))
        .filter((r) => journal.supprimees.indexOf(r.id) < 0));
      return true;
    },
    sessionActive: { user: { id: 'u1' } },
    uuid: () => 'id-' + Math.random().toString(16).slice(2),
    enregistrementEnCours: false,
    construit: null,
    DOSSIER_DU_PROGRAMME: /var DOSSIER_DU_PROGRAMME = '([^']+)'/.exec(APP)[1],
    faitsDesFreres: () => ({}),
    horsDuMateriel: () => null,
    ouvrirCatalogue: (a, r, apercu) => { journal.catalogue.push({ a, r, apercu }); ctx.__catalogue = apercu; },
    $: (id) => ({ id, querySelectorAll: () => [] }),
    voileOuvert: null,
    ouvrirVoile: (noeud, apres) => { journal.voile++; ctx.voileOuvert = noeud; ctx.__apres = apres; },
    fermerVoile: () => { journal.ferme++; ctx.voileOuvert = null; const a = ctx.__apres; ctx.__apres = null; if (a) a(); },
    dossiersReplies: {}, memoriserDossiersReplies: () => {},
    afficherSaisie: async () => { journal.saisie++; },
    rendreSaisie: () => { journal.rendreSaisie++; },
    vues: { saisie: { hidden: false } },
    seance: null,
    Date, Math, Promise, Object
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  return { ctx, journal, vue: () => ctx.__vue, appel: (code) => vm.runInContext(code, ctx) };
}

const NOMS_4J = ['Haut A', 'Bas A', 'Haut B', 'Bas B'];

describe('les gestes : ouvrir l’aperçu', () => {
  test('les 4 séances du générateur, leur nom, leur ligne « pourquoi » (celle du fichier de cas) ; RIEN n’est écrit', async () => {
    const b = bac({ profil: { objectif: 'les_deux' } });
    await b.appel('ouvrirApercuProgramme()');
    const v = b.vue();
    expect(v.titre).toBe('Ton programme de départ : 4 séances par semaine.');
    expect(v.routines.map((r) => r.nom)).toEqual(NOMS_4J);
    const attendu = cas('neuf_4j_les_deux').attendu;
    expect(v.routines.map((r) => r.pourquoi)).toEqual(attendu.map((r) => r.pourquoi));
    expect(v.routines[0].exercices.map((x) => x.nom)).toEqual(attendu[0].exercices.map((e) => nom(e[0])));
    expect(v.routines[0].exercices[0].series).toBe('4' + NBSP + '×' + NBSP + '5');
    expect(v.routines.every((r) => /^≈ \d+ min$/.test(r.duree))).toBe(true);
    expect(v.libelleCreer).toBe('Créer ces 4 routines');
    expect(v.voix[0]).toBe('Je te propose tes charges à chaque séance. Touche un exercice pour le changer.');
    expect(b.journal.voile).toBe(1);
    expect(b.journal.routines).toEqual([]);
    expect(b.journal.profil).toEqual([]);
  });

  test('les jours viennent du profil (bornés) : 6 jours, 2 jours ; sans réponse, 3', async () => {
    for (const [jours, attendu] of [[6, 6], [2, 2], [9, 6], [1, 2], [null, 3]]) {
      const b = bac({ profil: { seances_par_semaine: jours } });
      await b.appel('ouvrirApercuProgramme()');
      expect(b.vue().routines.length).toBe(attendu);
    }
  });

  test('la zone à ménager vient du profil : la phrase du haut et la mention sous l’exercice', async () => {
    const b = bac({ profil: { zones_a_menager: ['genou'], objectif: 'force' } });
    await b.appel('ouvrirApercuProgramme()');
    const v = b.vue();
    expect(v.voix.length).toBe(2);
    expect(v.voix[1]).toMatch(/^Tu ménages ton genou : .+, sans série lourde\. Toutes leurs séries restent\.$/);
    const mentions = [].concat.apply([], v.routines.map((r) => r.exercices.map((x) => x.mentions.join('|'))));
    expect(mentions).toContain('sans série lourde · ton genou');
  });

  test('un exercice écarté du profil n’est pas proposé', async () => {
    const b = bac({ profil: { exercices_ecartes: ['developpe_couche_barre'] } });
    await b.appel('ouvrirApercuProgramme()');
    const noms = [].concat.apply([], b.vue().routines.map((r) => r.exercices.map((x) => x.nom)));
    expect(noms).not.toContain(nom('developpe_couche_barre'));
  });

  test('le catalogue n’est pas arrivé : on ne montre pas un programme vide', async () => {
    const b = bac({ catalogueVide: true });
    await b.appel('ouvrirApercuProgramme()');
    expect(b.journal.feuilles).toEqual([]);
    expect(b.journal.confirmer.length).toBe(1);
    expect(b.journal.confirmer[0].titre).toBe('Le catalogue arrive');
    expect(b.ctx.construit).toBeNull();
  });

  test('« Pas maintenant » ferme sans rien écrire', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surPasMaintenant();
    expect(b.ctx.construit).toBeNull();
    expect(b.journal.routines).toEqual([]);
    expect(b.journal.profil).toEqual([]);
  });
});

describe('les gestes : le niveau, les 2 jours et la priorité « Tronc » (60-6)', () => {
  const noms = (b) => [].concat.apply([], b.vue().routines.map((r) => r.exercices.map((x) => x.nom)));
  const ouvrir = async (profil) => {
    const b = bac({ profil });
    await b.appel('ouvrirApercuProgramme()');
    return b;
  };

  test('⚠️ DISCRIMINANT — « moins d’un an » : ni tractions ni relevé de genoux suspendu ; « 1 à 3 ans » : ils reviennent', async () => {
    const debutant = noms(await ouvrir({ seances_par_semaine: 3, objectif: 'forme', anciennete: 'moins_1_an' }));
    expect(debutant).not.toContain(nom('tractions'));
    expect(debutant).not.toContain(nom('releve_de_genoux_suspendu'));
    const assidu = noms(await ouvrir({ seances_par_semaine: 3, objectif: 'forme', anciennete: '1_a_3_ans' }));
    expect(assidu).toContain(nom('tractions'));
    expect(assidu).toContain(nom('releve_de_genoux_suspendu'));
  });

  test('l’ancienneté non répondue n’est pas « débutant »', async () => {
    const nulle = noms(await ouvrir({ seances_par_semaine: 3, objectif: 'forme', anciennete: null }));
    expect(nulle).toContain(nom('tractions'));
  });

  test('un débutant qui a déjà fait les tractions les garde', async () => {
    const b = bac({ profil: { seances_par_semaine: 4, objectif: 'muscle', anciennete: 'moins_1_an' }, faits: { tractions: 20 } });
    await b.appel('ouvrirApercuProgramme()');
    expect(noms(b)).toContain(nom('tractions'));
  });

  test('« Je n’en veux pas » sur le tirage d’un débutant ne donne jamais des tractions', async () => {
    const b = await ouvrir({ seances_par_semaine: 3, objectif: 'forme', anciennete: 'moins_1_an' });
    const r = b.vue().routines.findIndex((rt) => rt.exercices.some((x) => x.nom === nom('tirage_poitrine_poulie')));
    const k = b.vue().routines[r].exercices.findIndex((x) => x.nom === nom('tirage_poitrine_poulie'));
    expect(r).toBeGreaterThanOrEqual(0);
    b.vue().surExercice(r, k);
    b.ctx.__choix.surChoix('refuser');
    expect(noms(b)).not.toContain(nom('tractions'));
    expect(b.vue().routines[r].exercices[k].nom).not.toBe(nom('tirage_poitrine_poulie'));
  });

  test('2 jours : « Corps entier A » et « Corps entier B », du couché dans les deux', async () => {
    const b = await ouvrir({ seances_par_semaine: 2, objectif: 'force' });
    const rts = b.vue().routines;
    expect(rts.map((r) => r.nom)).toEqual(['Corps entier A', 'Corps entier B']);
    rts.forEach((r) => expect(r.exercices.some((x) => /developpe couche/.test(x.nom) && !/incline/.test(x.nom))).toBe(true));
  });

  test('la priorité « Tronc » : 3 séries d’abdos dans la séance du bas (2 sans elle)', async () => {
    const abdos = (b) => b.vue().routines[1].exercices.filter((x) => x.nom === nom('releve_de_genoux_suspendu') || x.nom === nom('crunch_poulie'))[0];
    const avec = await ouvrir({ seances_par_semaine: 4, objectif: 'muscle', priorites: ['tronc'] });
    const sans = await ouvrir({ seances_par_semaine: 4, objectif: 'muscle' });
    expect(abdos(avec).series).toBe('3' + NBSP + '×' + NBSP + '15');
    expect(abdos(sans).series).toBe('2' + NBSP + '×' + NBSP + '15');
  });
});

describe('les gestes : le temps (G8)', () => {
  const duree = (v) => v.routines.map((r) => Number(/(\d+)/.exec(r.duree)[1]));
  const series = (v) => v.routines.map((r) => r.exercices.reduce((t, x) => t + Number(/^(\d+)/.exec(x.series)[1]), 0));

  test('« J’ai de la marge » : rien n’est raccourci, même avec une durée déclarée', async () => {
    const a = bac({ profil: { temps_reponse: 'marge', duree_seance_min: 30 } });
    await a.appel('ouvrirApercuProgramme()');
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    expect(series(a.vue())).toEqual(series(b.vue()));
    expect(duree(a.vue())).toEqual(duree(b.vue()));
  });

  test('« C’est mon maximum » + 45 min : chaque séance passe par le raccourci — moins de séries, jamais plus longue, les muscles gardés', async () => {
    const plein = bac();
    await plein.appel('ouvrirApercuProgramme()');
    const court = bac({ profil: { temps_reponse: 'max', duree_seance_min: 45 } });
    await court.appel('ouvrirApercuProgramme()');
    const d0 = duree(plein.vue()), d1 = duree(court.vue());
    d1.forEach((m, i) => { expect(m).toBeLessThanOrEqual(d0[i]); });
    expect(d1.some((m, i) => m < d0[i])).toBe(true);
    expect(series(court.vue()).reduce((a, c) => a + c, 0)).toBeLessThan(series(plein.vue()).reduce((a, c) => a + c, 0));
    expect(court.vue().routines.length).toBe(4);
    // Chaque séance garde son premier exercice (jamais retiré).
    court.vue().routines.forEach((r, i) => { expect(r.exercices[0].nom).toBe(plein.vue().routines[i].exercices[0].nom); });
  });

  test('« Moins en ce moment » et « Ça varie » raccourcissent de même ; sans durée déclarée, jamais', async () => {
    for (const t of ['moins', 'varie']) {
      const plein = bac();
      await plein.appel('ouvrirApercuProgramme()');
      const court = bac({ profil: { temps_reponse: t, duree_seance_min: 45 } });
      await court.appel('ouvrirApercuProgramme()');
      expect(series(court.vue()).reduce((a, c) => a + c, 0)).toBeLessThan(series(plein.vue()).reduce((a, c) => a + c, 0));
    }
    const sans = bac({ profil: { temps_reponse: 'max', duree_seance_min: null } });
    await sans.appel('ouvrirApercuProgramme()');
    const plein = bac();
    await plein.appel('ouvrirApercuProgramme()');
    expect(series(sans.vue())).toEqual(series(plein.vue()));
  });

  test('« Juste un carnet » : le coach se tait, rien n’est raccourci', async () => {
    const carnet = bac({ profil: { temps_reponse: 'max', duree_seance_min: 30, intention: 'entretien' } });
    await carnet.appel('ouvrirApercuProgramme()');
    const plein = bac();
    await plein.appel('ouvrirApercuProgramme()');
    expect(series(carnet.vue())).toEqual(series(plein.vue()));
  });
});

describe('les gestes : « Je n’en veux pas »', () => {
  const ouvrir = async (options) => {
    const b = bac(options);
    await b.appel('ouvrirApercuProgramme()');
    return b;
  };

  test('toucher un exercice ouvre la feuille : « Je n’en veux pas », « Remplacer », « Annuler » — les phrases de la spec', async () => {
    const b = await ouvrir();
    b.vue().surExercice(0, 0);
    const c = b.ctx.__choix;
    expect(c.titre).toBe(nom('developpe_couche_barre'));
    expect(c.aide).toBe('Haut A · 4' + NBSP + '×' + NBSP + '5');
    expect(c.options.map((o) => [o.cle, o.libelle, o.sous])).toEqual([
      ['refuser', 'Je n’en veux pas', 'Je le remplace par un exercice du même mouvement, et je ne te le proposerai plus.'],
      ['remplacer', 'Remplacer', 'Tu choisis dans le catalogue. La ligne de la séance se met à jour.']]);
    c.surAnnuler();
    expect(b.vue().titre).toBe('Ton programme de départ : 4 séances par semaine.');           // l'aperçu est revenu
    expect(b.journal.profil).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — SEULE la place touchée change : les autres séances restent identiques, les séries de la place aussi', async () => {
    const b = await ouvrir();
    const avant = clone(b.vue().routines);
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    const apres = b.vue().routines;
    expect(apres[0].exercices[0].nom).not.toBe(avant[0].exercices[0].nom);
    expect(apres[0].exercices[0].series).toBe(avant[0].exercices[0].series.replace(/×\u00a05/, '×\u00a09'));   // les mêmes séries ; les reps suivent l'exercice (plus à la barre)
    expect(apres[0].exercices.slice(1)).toEqual(avant[0].exercices.slice(1));
    expect(apres.slice(1).map((r) => [r.nom, r.pourquoi, r.exercices.map((x) => x.nom)]))
      .toEqual(avant.slice(1).map((r) => [r.nom, r.pourquoi, r.exercices.map((x) => x.nom)]));
  });

  test('l’écarté est écrit AU GESTE par le chemin du profil ; la phrase du coach le dit ; l’exercice neuf est marqué', async () => {
    const b = await ouvrir();
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['developpe_couche_barre'] }]);
    const v = b.vue();
    const neuf = v.routines[0].exercices[0].nom;
    expect(v.voix[v.voix.length - 1]).toBe(nom('developpe_couche_barre') + ' est remplacé par ' + neuf + '. Je ne te le proposerai plus.');
    expect(v.routines[0].exercices[0].neuf).toBe(true);
    expect(v.routines[0].exercices.slice(1).every((x) => !x.neuf)).toBe(true);
    expect(b.journal.routines).toEqual([]);                        // rien d'autre n'est écrit
  });

  test('un second refus s’ajoute : les écartés restent dans l’ordre où on les a écartés', async () => {
    const b = await ouvrir();
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    expect(b.journal.profil.length).toBe(2);
    expect(b.journal.profil[1].exercices_ecartes.length).toBe(2);
    expect(b.journal.profil[1].exercices_ecartes[0]).toBe('developpe_couche_barre');
  });

  test('le geste est gardé dans le profil LOCAL au moment du geste (le vrai `poserProfil` ne rejette jamais ; hors ligne, seul l’envoi attend)', async () => {
    const b = await ouvrir();
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    expect(b.ctx.profil.exercices_ecartes).toEqual(['developpe_couche_barre']);       // le profil local est à jour sans attendre l'envoi
    expect(b.vue().routines[0].exercices[0].nom).not.toBe(nom('developpe_couche_barre'));
  });

  test('une place sans remplaçant disparaît, et la phrase le dit', async () => {
    // Le catalogue réduit à un seul exercice du motif : le refus ne trouve rien.
    const b = await ouvrir({ profil: { materiel: 'poids_du_corps', objectif: 'forme', seances_par_semaine: 2 } });
    const v0 = b.vue();
    const k = v0.routines[0].exercices.length - 1;
    // On écarte jusqu'à épuisement du motif de la dernière place.
    let guard = 0;
    while (guard++ < 12 && b.vue().routines[0].exercices.length === k + 1) {
      b.vue().surExercice(0, k);
      b.ctx.__choix.surChoix('refuser');
    }
    const phrase = b.vue().voix[b.vue().voix.length - 1];
    expect(phrase).toMatch(/Je ne te le proposerai plus\.$/);
    expect(b.vue().routines[0].exercices.length).toBeLessThanOrEqual(k + 1);
  });
});

describe('les gestes : « Remplacer »', () => {
  test('la feuille de l’éditeur : les frères, « Chercher dans le catalogue » ; un frère prend la place, rien ne s’écarte', async () => {
    const b = bac({ freres: [{ slug: 'developpe_couche_haltere', fait: null }] });
    await b.appel('ouvrirApercuProgramme()');
    const avant = clone(b.vue().routines);
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('remplacer');
    const m = b.ctx.__machine;
    expect(m.titre).toBe('Remplacer');
    expect(m.nom).toBe(nom('developpe_couche_barre'));
    expect(m.chercher).toBe('Chercher dans le catalogue');
    expect(m.freres.map((f) => f.nom)).toEqual([nom('developpe_couche_haltere')]);
    m.freres[0].surChoisir();
    const apres = b.vue().routines;
    expect(apres[0].exercices[0].nom).toBe(nom('developpe_couche_haltere'));
    expect(apres[0].exercices[0].neuf).toBe(true);
    expect(apres[0].exercices.slice(1)).toEqual(avant[0].exercices.slice(1));
    expect(b.journal.profil).toEqual([]);                          // « Remplacer » n'écarte rien
  });

  test('le catalogue : l’aperçu reste en mémoire, le choix prend la place, la fermeture rouvre l’aperçu', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(1, 0);
    b.ctx.__choix.surChoix('remplacer');
    b.ctx.__machine.surCatalogue();
    expect(b.journal.catalogue.length).toBe(1);
    const apercu = b.ctx.__catalogue;
    expect([apercu.i, apercu.k]).toEqual([1, 0]);
    expect(b.ctx.construit).not.toBeNull();
    // L'ouverture du catalogue ferme le voile de l'aperçu : il ne perd pas son état.
    b.ctx.fermerVoile();
    expect(b.ctx.construit).not.toBeNull();
    // La fermeture du catalogue rouvre l'aperçu.
    const voiles = b.journal.voile;
    apercu.retour();
    expect(b.journal.voile).toBe(voiles + 1);
    expect(b.vue().titre).toBe('Ton programme de départ : 4 séances par semaine.');
    // Puis le choix prend la place.
    b.appel("poserDansLeProgramme(1, 0, 'squat_barre')");
    expect(b.vue().routines[1].exercices[0].nom).toBe(nom('squat_barre'));
  });

  test('fermer l’aperçu après le catalogue (retour) puis « Pas maintenant » : l’état est libéré', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 1);
    b.ctx.__choix.surChoix('remplacer');
    b.ctx.__machine.surCatalogue();
    b.ctx.fermerVoile();
    b.ctx.__catalogue.retour();
    b.vue().surPasMaintenant();
    expect(b.ctx.construit).toBeNull();
  });
});

describe('les gestes : « Créer ces N routines »', () => {
  const creees = (b) => b.journal.routines.map((l) => [l.nom, l.dossier, l.rang]);

  test('chaque séance, dans l’ordre, dans « Mon programme », par le chemin de « Créer la routine » : jamais de charge, jamais de chauffe', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const attendu = cas('neuf_4j_les_deux').attendu;
    await b.vue().surCreer();
    expect(creees(b)).toEqual([['Haut A', 'Mon programme', 0], ['Bas A', 'Mon programme', 1], ['Haut B', 'Mon programme', 2], ['Bas B', 'Mon programme', 3]]);
    const toutes = [].concat.apply([], b.journal.series);
    expect(toutes.every((l) => l.charge_cible_kg === null)).toBe(true);
    expect(toutes.every((l) => l.type_serie === 'travail')).toBe(true);
    // Les séries × reps de l'aperçu sont celles de la première routine écrite (son premier exercice : 4 × 5).
    const premier = b.journal.series[0];
    expect(premier.length).toBe(attendu[0].exercices[0][3]);
    expect(premier.every((l) => l.reps_visees === attendu[0].exercices[0][4])).toBe(true);
    expect(b.journal.exercices[0].length).toBe(attendu[0].exercices.length);
    // Puis : le dossier réel et la date, au profil ; la bibliothèque s'ouvre dessus.
    expect(b.journal.profil.length).toBe(1);
    expect(b.journal.profil[0].programme_construit_dossier).toBe('Mon programme');
    expect(b.journal.profil[0].programme_construit_le).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(b.journal.ferme).toBe(1);
    expect(b.journal.saisie).toBe(1);
    expect(b.ctx.construit).toBeNull();
  });

  test('⚠️ DISCRIMINANT — la durée montrée est celle de la structure ÉCRITE (les repos de la création, sans les recalculer ailleurs)', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const montrees = b.vue().routines.map((r) => Number(/(\d+)/.exec(r.duree)[1]));
    await b.vue().surCreer();
    // La durée, relue sur les lignes ÉCRITES : les exercices (repos, superset) et leurs séries.
    const reecrites = b.journal.routines.map((_, i) => {
      const exos = b.journal.exercices[i].slice().sort((x, y) => x.rang - y.rang);
      const struct = Moteur.structureDeRoutine(exos.map((e) => ({
        exercise_slug: e.exercise_slug, repos_cible_s: e.repos_cible_s, groupe_superset: e.groupe_superset,
        series: b.journal.seriesDe[e.id]
      })), INDEX);
      return Math.round(Moteur.dureeEstimee(struct) / 60);
    });
    expect(montrees.length).toBe(4);
    montrees.forEach((m) => { expect(m).toBeGreaterThan(0); });
    expect(reecrites).toEqual(montrees);
  });

  test('« Mon programme » existe déjà : « Mon programme (2) » ; un nom déjà pris : « (2) »', async () => {
    const b = bac({ routines: [{ id: 'x', nom: 'Haut A', dossier: 'Mon programme', rang: 4, exercices: [] }] });
    await b.appel('ouvrirApercuProgramme()');
    expect(b.vue().routines[0].nom).toBe('Haut A (2)');           // l'aperçu dit le nom qui sera ÉCRIT
    await b.vue().surCreer();
    expect(creees(b)[0]).toEqual(['Haut A (2)', 'Mon programme (2)', 5]);
    expect(b.journal.profil[0].programme_construit_dossier).toBe('Mon programme (2)');
  });

  test('⚠️ DISCRIMINANT — deux taps rapides n’écrivent pas deux fois', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const creer = b.vue().surCreer;
    await Promise.all([creer(), creer()]);
    expect(b.journal.routines.length).toBe(4);
    expect(b.journal.profil.length).toBe(1);
  });

  test('une panne au milieu : les créées quittent l’aperçu, l’erreur est dite, la reprise reste dans le MÊME dossier et ne recrée rien', async () => {
    let coupe = true;
    const b = bac({ panne: (deja) => coupe && deja === 2 });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    expect(creees(b).map((c) => c[0])).toEqual(['Haut A', 'Bas A']);
    const v = b.vue();
    expect(v.erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(v.routines.map((r) => r.nom)).toEqual(['Haut B', 'Bas B']);
    expect(v.titre).toBe('Ton programme de départ : 4 séances par semaine.');               // le programme reste de 4 séances
    expect(v.libelleCreer).toBe('Créer ces 2 routines');
    expect(b.journal.ferme).toBe(0);
    // Le dossier et la date partent dès la PREMIÈRE routine créée : un programme à moitié écrit, abandonné, garde sa trace.
    expect(b.journal.profil.length).toBe(1);
    expect(b.journal.profil[0].programme_construit_dossier).toBe('Mon programme');
    const dateDuProfil = b.journal.profil[0].programme_construit_le;
    expect(b.journal.rendreSaisie).toBe(1);                        // la bibliothèque derrière montre déjà ce qui est créé
    coupe = false;
    await b.vue().surCreer();
    expect(creees(b).map((c) => [c[0], c[1]])).toEqual([['Haut A', 'Mon programme'], ['Bas A', 'Mon programme'],
      ['Haut B', 'Mon programme'], ['Bas B', 'Mon programme']]);
    expect(b.journal.profil.length).toBe(1);                       // pas réécrit à la reprise : la date reste celle de la création
    expect(b.ctx.profil.programme_construit_le).toBe(dateDuProfil);
    expect(b.journal.ferme).toBe(1);
  });

  test('hors ligne : rien n’est écrit, l’aperçu reste ouvert avec le message', async () => {
    const b = bac({ panne: () => true });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    expect(b.journal.routines).toEqual([]);
    expect(b.vue().erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(b.vue().routines.length).toBe(4);
    expect(b.journal.profil).toEqual([]);
    expect(b.journal.ferme).toBe(0);
  });

  test('un exercice refusé avant « Créer » n’est pas dans les routines écrites', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    const neuf = b.vue().routines[0].exercices[0].nom;
    await b.vue().surCreer();
    const premiers = b.journal.exercices[0].slice().sort((x, y) => x.rang - y.rang);
    expect(premiers.map((e) => e.exercise_slug)).not.toContain('developpe_couche_barre');
    expect(nom(premiers[0].exercise_slug)).toBe(neuf);
  });

  test('la fermeture pendant l’écriture : rien n’est ramené, mais le dossier et la date s’écrivent quand même', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const p = b.vue().surCreer();
    b.ctx.fermerVoile();
    await p;
    expect(b.journal.routines.length).toBe(4);
    expect(b.journal.profil.length).toBe(1);
    expect(b.journal.saisie).toBe(0);                              // on n'a ramené personne dans la bibliothèque
  });
});

// ═══ LA REVUE ADVERSE DE 60-4 ═══════════════════════════════════════════════
describe('revue adverse — la fenêtre du rechargement final', () => {
  const tic = () => new Promise((r) => setTimeout(r, 0));

  test('⚠️ DISCRIMINANT — pendant le rechargement, l’aperçu reste « en cours » : ni second « Créer », ni exercice touchable, rien écrit deux fois', async () => {
    const b = bac({ retenirRechargement: true });
    await b.appel('ouvrirApercuProgramme()');
    const creer = b.vue().surCreer;
    const p = creer();
    for (let n = 0; n < 80 && !b.ctx.__lacher; n++) await tic();
    expect(b.ctx.__lacher).toBeDefined();                            // les quatre routines sont écrites, la bibliothèque se relit
    expect(b.ctx.construit.enCours).toBe(true);
    expect(b.ctx.construit.faites.filter(Boolean).length).toBe(4);   // posées routine par routine, pas après le retour
    const choix = b.journal.choix.length;
    b.vue().surExercice(0, 0);                                       // ignoré
    expect(b.journal.choix.length).toBe(choix);
    await creer();                                                   // ignoré : rien ne s'écrit une seconde fois
    expect(b.journal.routines.length).toBe(4);
    b.ctx.__lacher();
    await p;
    expect(b.journal.routines.length).toBe(4);
    expect(b.journal.ferme).toBe(1);
  });
});

describe('revue adverse — une routine ORPHELINE est défaite à la reprise', () => {
  test('⚠️ DISCRIMINANT — la coupure tombe après la routine, l’annulation échoue aussi : la reprise la défait, puis recrée sous les noms d’origine', async () => {
    let coupe = true;
    const b = bac({ panneExercices: (n) => coupe && n === 0, suppressionHS: () => coupe });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    expect(b.journal.routines.length).toBe(1);                       // « Haut A » existe en base, incomplète
    expect(b.journal.supprimees).toEqual([]);
    // Le message ne se contredit pas : l'orpheline se défait toute seule à la reprise.
    expect(b.vue().erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(b.vue().routines.length).toBe(4);
    expect(b.ctx.construit.faites.filter(Boolean).length).toBe(0);
    coupe = false;
    await b.vue().surCreer();
    expect(b.journal.supprimees).toEqual(['r1']);                    // l'orpheline est défaite…
    expect(b.journal.routines.slice(1).map((l) => l.nom)).toEqual(['Haut A', 'Bas A', 'Haut B', 'Bas B']);   // …donc aucun « (2) »
    expect(b.journal.routines.slice(1).every((l) => l.dossier === 'Mon programme')).toBe(true);
    expect(b.journal.ferme).toBe(1);
  });

  test('l’orpheline ne peut toujours pas être défaite (réseau mort) : elle reste à défaire, rien n’avance, aucun doublon', async () => {
    const b = bac({ panneExercices: (n) => n === 0, suppressionHS: () => true, chargementHS: () => b.journal.chargements > 1 });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    const avant = b.journal.routines.length;
    await b.vue().surCreer();
    expect(b.journal.routines.length).toBe(avant);                   // rien de recréé tant que l'orpheline vit
    expect(b.ctx.construit.orphelines).toEqual(['r1']);
    expect(b.vue().erreur).toBe('Pas de réseau : rien n’a été enregistré.');
  });
});

describe('revue adverse — le dossier et le profil', () => {
  test('⚠️ DISCRIMINANT — hors ligne dès l’ouverture : rien n’est écrit, le dossier n’est pas figé sur une bibliothèque vide', async () => {
    let hs = true;
    const existante = { id: 'x', nom: 'Haut A', dossier: 'Mon programme', rang: 0, exercices: [] };
    const b = bac({ nonLues: true, routines: [existante], chargementHS: () => hs });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    expect(b.journal.routines).toEqual([]);
    expect(b.vue().erreur).toBe('Pas de réseau : rien n’a été enregistré.');
    expect(b.ctx.construit.dossier).toBeNull();                      // pas figé sur « Mon programme »
    hs = false;
    await b.vue().surCreer();
    expect(b.journal.routines.every((l) => l.dossier === 'Mon programme (2)')).toBe(true);   // l'existant est vu : un NOUVEAU dossier
    expect(b.journal.routines.map((l) => l.nom)).toEqual(['Haut A (2)', 'Bas A', 'Haut B', 'Bas B']);
    expect(b.ctx.profil.programme_construit_dossier).toBe('Mon programme (2)');
  });

  test('le profil reçoit le dossier dès la première routine créée, avant la fin de l’écriture', async () => {
    const b = bac({ panne: (deja) => deja === 1 });
    await b.appel('ouvrirApercuProgramme()');
    await b.vue().surCreer();
    expect(b.journal.routines.length).toBe(1);
    expect(b.ctx.profil.programme_construit_dossier).toBe('Mon programme');
    expect(b.ctx.profil.programme_construit_le).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('revue adverse — l’aperçu : sorties, séances vidées, remplaçant déjà là, écartés vivants', () => {
  test('« Remplacer » a un « Annuler » qui revient à l’aperçu, tel quel', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('remplacer');
    expect(typeof b.ctx.__machine.surAnnuler).toBe('function');
    const rendus = b.journal.feuilles.length;
    b.ctx.__machine.surAnnuler();
    expect(b.journal.feuilles.length).toBe(rendus + 1);
    expect(b.vue().titre).toBe('Ton programme de départ : 4 séances par semaine.');
    expect(b.journal.profil).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — une séance VIDÉE par les refus sort du programme : jamais « ≈ 0 min », jamais une routine vide écrite', async () => {
    const vide = Object.assign({}, Generateur, {
      neVeuxPas: (cat, rts, e, r, k) => { const res = Generateur.neVeuxPas(cat, rts, e, r, k); if (r === 0) res.routines[0].exercices = []; return res; }
    });
    const b = bac({ generateur: vide });
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    const v = b.vue();
    expect(v.routines.map((r) => r.nom)).toEqual(['Bas A', 'Haut B', 'Bas B']);
    expect(v.titre).toBe('Ton programme de départ : 3 séances par semaine.');
    expect(v.routines.every((r) => r.exercices.length > 0 && !/≈\u00a00\u00a0min/.test(r.duree))).toBe(true);
    expect(v.libelleCreer).toBe('Créer ces 3 routines');
    await v.surCreer();
    expect(b.journal.routines.map((l) => l.nom)).toEqual(['Bas A', 'Haut B', 'Bas B']);
  });

  test('toutes les séances vidées, une à une : l’aperçu se ferme au dernier refus, rien n’est écrit', async () => {
    const vide = Object.assign({}, Generateur, {
      neVeuxPas: (cat, rts, e, r, k) => { const res = Generateur.neVeuxPas(cat, rts, e, r, k); res.routines[r].exercices = []; return res; }
    });
    const b = bac({ generateur: vide });
    await b.appel('ouvrirApercuProgramme()');
    for (let n = 0; n < 3; n++) {
      b.vue().surExercice(0, 0);
      b.ctx.__choix.surChoix('refuser');
      expect(b.journal.ferme).toBe(0);
    }
    expect(b.vue().routines.length).toBe(1);
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    expect(b.journal.ferme).toBe(1);
    expect(b.journal.routines).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — « Remplacer » par un exercice DÉJÀ dans la séance : rien ne change (pas de séries additionnées), le coach le dit', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    const avant = clone(b.vue().routines);
    const autre = b.ctx.construit.routines[0].exercices[1].exercise_slug;
    b.appel("poserDansLeProgramme(0, 0, '" + autre + "')");
    const apres = b.vue();
    expect(apres.routines[0].exercices.map((x) => [x.nom, x.series])).toEqual(avant[0].exercices.map((x) => [x.nom, x.series]));
    expect(apres.voix[apres.voix.length - 1]).toBe(nom(autre) + ' est déjà dans cette séance.');
    expect(apres.routines[0].exercices.every((x) => !x.neuf)).toBe(true);
  });

  test('⚠️ DISCRIMINANT — un écarté ajouté au profil depuis l’ouverture (un autre appareil) n’est PAS effacé par un refus', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.ctx.profil.exercices_ecartes = ['curl_marteau_haltere'];       // arrivé après l'ouverture
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['curl_marteau_haltere', 'developpe_couche_barre'] }]);
  });
});

describe('revue adverse — la phrase de zone ne ment pas, le motif suit l’exercice', () => {
  const entree = () => Object.assign({ faits: {}, priorites: [], menager: [], ecartes: [] }, clone(cas('neuf_4j_les_deux').entree));

  test('⚠️ DISCRIMINANT — une ligne ménagée qui porte des séries coupées (posée par « Remplacer » sur une place raccourcie) : « Toutes leurs séries restent » n’est pas dite', () => {
    const c = cat(), e = Object.assign(entree(), { menager: ['genou'] });
    const rts = Generateur.generer(c, e);
    const entier = Generateur.phrasesDeLApercu(rts, e, nom).zones[0];
    expect(entier).toMatch(/Toutes leurs séries restent\.$/);
    // Une des lignes ménagées perd des séries (le raccourci de la durée).
    const coupe = clone(rts);
    coupe.forEach((rt) => rt.exercices.forEach((x) => { if (x.motif === 'quad_iso') { x.raccourcie = true; x.series = 1; } }));
    const phrase = Generateur.phrasesDeLApercu(coupe, e, nom).zones[0];
    expect(phrase).toMatch(/^Tu ménages ton genou : .+, sans série lourde\.$/);
    expect(phrase).not.toMatch(/Toutes/);
  });

  test('la limite du soulevé reste dite quand les séries sont coupées', () => {
    const c = cat(), e = Object.assign(entree(), { menager: ['dos'] });
    const rts = clone(Generateur.generer(c, e));
    rts.forEach((rt) => rt.exercices.forEach((x) => { if (x.motif === 'rowing') x.raccourcie = true; }));
    const phrase = Generateur.phrasesDeLApercu(rts, e, nom).zones[0];
    expect(phrase).toMatch(/sans série lourde\. 8 répétitions au plus au soulevé\.$/);
  });

  test('un seul exercice ménagé : « Toutes ses séries restent » (l’accord)', () => {
    const e = { menager: ['coude'] };
    const rts = [{ nom: 'A', exercices: [{ exercise_slug: 'extension_triceps_poulie_haute', motif: 'triceps' }] }];
    expect(Generateur.phrasesDeLApercu(rts, e, nom).zones[0]).toBe(
      'Tu ménages ton coude : ' + nom('extension_triceps_poulie_haute') + ', sans série lourde. Toutes ses séries restent.');
  });

  test('⚠️ DISCRIMINANT — « Remplacer » : le motif SUIT l’exercice (la mention se lit sur ce qu’il charge, pas sur la place)', () => {
    const c = cat(), e = Object.assign(entree(), { menager: ['genou'] });
    const rts = Generateur.generer(c, e);
    // Un développé couché posé sur la place du squat : plus de mention « genou ».
    const iSquat = rts[1].exercices.findIndex((x) => x.motif === 'squat');
    const sansGenou = Generateur.remplacePar(c, rts, e, 1, iSquat, 'developpe_couche_barre');
    expect(sansGenou[1].exercices[iSquat].motif).toBe('couche');
    expect(sansGenou[1].exercices[iSquat].menage).toBe(false);
    expect(Generateur.mentionsDeLigne(sansGenou[1].exercices[iSquat], e)).toEqual([]);
    // Un squat posé sur la place du couché : la mention « genou » apparaît.
    const iCouche = rts[0].exercices.findIndex((x) => x.motif === 'couche');
    const avecGenou = Generateur.remplacePar(c, rts, e, 0, iCouche, 'squat_barre');
    expect(avecGenou[0].exercices[iCouche].motif).toBe('squat');
    expect(Generateur.mentionsDeLigne(avecGenou[0].exercices[iCouche], e)).toEqual(['sans série lourde · ton genou']);
    // Un candidat de la place reste sur la place (le haltère reste « couche »).
    expect(Generateur.remplacePar(c, rts, e, 0, iCouche, 'developpe_couche_haltere')[0].exercices[iCouche].motif).toBe('couche');
  });

  // ═══ R4/R6 (60-5) : LE RACCOURCI DE LA DURÉE NE COUPE JAMAIS UN EXERCICE MÉNAGÉ ═════════════════════════════
  describe('l’aperçu : G8 + zone à ménager — le temps se prend ailleurs', () => {
    const PROFIL = { zones_a_menager: ['genou'], objectif: 'force', temps_reponse: 'max', duree_seance_min: 30 };
    const lignes = (rts) => [].concat.apply([], rts.map((rt) => rt.exercices));
    const ouvrir = async (profil) => { const b = bac({ profil }); await b.appel('ouvrirApercuProgramme()'); return b; };
    // Le programme TEL QUE LE GÉNÉRATEUR L'ÉCRIT, avant le raccourci : la référence des séries.
    const complet = (b) => Generateur.generer(cat(), b.ctx.construit.entree);
    const seriesDe = (rts) => { const m = {}; rts.forEach((rt, i) => rt.exercices.forEach((x) => { m[i + ':' + x.exercise_slug] = x.series; })); return m; };

    test('⚠️ DISCRIMINANT — genou ménagé, durée visée courte : le squat et la presse gardent leurs séries, les autres coupent', async () => {
      const b = await ouvrir(PROFIL);
      const ref = seriesDe(complet(b)), apres = seriesDe(b.ctx.construit.routines);
      const menages = [], autres = [];
      b.ctx.construit.routines.forEach((rt, i) => rt.exercices.forEach((x) => (x.menage ? menages : autres).push([i + ':' + x.exercise_slug, x])));
      expect(menages.length).toBeGreaterThan(0);
      expect(menages.map(([k]) => k).some((k) => /squat|presse/.test(k))).toBe(true);
      menages.forEach(([k]) => expect(apres[k]).toBe(ref[k]));                        // aucune série d'un ménagé n'est coupée
      expect(autres.some(([k]) => apres[k] < ref[k])).toBe(true);                     // le temps se prend sur les autres
      // Sans zone à ménager, les mêmes lignes SERAIENT coupées : le test discrimine.
      const sans = await ouvrir(Object.assign({}, PROFIL, { zones_a_menager: null }));
      const refSans = seriesDe(complet(sans)), apresSans = seriesDe(sans.ctx.construit.routines);
      expect(Object.keys(apresSans).some((k) => /squat|presse|extension/.test(k) && apresSans[k] < refSans[k])).toBe(true);
    });

    test('la phrase du haut dit « Toutes leurs séries restent » — avec raison — et aucune ligne ménagée n’est marquée coupée', async () => {
      const b = await ouvrir(PROFIL);
      expect(b.vue().voix[1]).toMatch(/^Tu ménages ton genou : .+, sans série lourde\. Toutes leurs séries restent\.$/);
      expect(lignes(b.ctx.construit.routines).filter((x) => x.menage && x.raccourcie)).toEqual([]);
    });

    test('⚠️ la cible inatteignable (20 min) : les ménagés restent entiers, la durée AFFICHÉE est la durée réelle, jamais la cible', async () => {
      const b = await ouvrir(Object.assign({}, PROFIL, { duree_seance_min: 20 }));
      const ref = seriesDe(complet(b)), apres = seriesDe(b.ctx.construit.routines);
      b.ctx.construit.routines.forEach((rt, i) => rt.exercices.forEach((x) => { if (x.menage) expect(apres[i + ':' + x.exercise_slug]).toBe(ref[i + ':' + x.exercise_slug]); }));
      const minutes = b.vue().routines.map((r) => Number(/(\d+)/.exec(r.duree)[1]));
      // Une séance de jambes avec squat, presse et leur travail entier ne tient pas en 20 min : la carte le dit.
      expect(Math.max.apply(null, minutes)).toBeGreaterThan(20);
      b.vue().routines.forEach((r) => expect(r.duree).toMatch(/^≈[\u00a0 ]\d+[\u00a0 ]min$/));
    });

    test('une zone qui ne touche aucun exercice du programme : le raccourci est celui de toujours', async () => {
      const coude = await ouvrir(Object.assign({}, PROFIL, { zones_a_menager: ['coude'] }));
      const sans = await ouvrir(Object.assign({}, PROFIL, { zones_a_menager: null }));
      const pris = (b) => b.ctx.construit.routines.map((rt) => rt.exercices.filter((x) => !x.menage).map((x) => [x.exercise_slug, x.series]));
      expect(coude.ctx.construit.routines.some((rt) => rt.exercices.some((x) => x.menage))).toBe(true);
      // Sur les lignes que la zone « coude » ne charge pas, rien ne diffère d'une personne sans zone, hors le temps rendu aux ménagées.
      expect(pris(coude).length).toBe(pris(sans).length);
    });

    test('« J’ai de la marge » : aucun raccourci, aucune exemption à faire — rien ne change', async () => {
      const b = await ouvrir(Object.assign({}, PROFIL, { temps_reponse: 'marge' }));
      expect(seriesDe(b.ctx.construit.routines)).toEqual(seriesDe(complet(b)));
    });

    test('⚠️ « Remplacer » met sur une place DÉJÀ raccourcie un exercice ménagé : la ligne garde ses séries coupées, la phrase ne promet plus « toutes »', async () => {
      const b = await ouvrir(PROFIL);
      // Une place non ménagée dont les séries ont été coupées pour le temps.
      let r = -1, k = -1;
      b.ctx.construit.routines.forEach((rt, i) => rt.exercices.forEach((x, j) => { if (r < 0 && x.raccourcie && !x.menage) { r = i; k = j; } }));
      expect(r).toBeGreaterThanOrEqual(0);
      const coupees = b.ctx.construit.routines[r].exercices[k].series;
      b.appel("poserDansLeProgramme(" + r + ", " + k + ", 'extension_jambes')");
      const nouvelle = b.ctx.construit.routines[r].exercices[k];
      expect(nouvelle.exercise_slug).toBe('extension_jambes');
      expect(nouvelle.menage).toBe(true);                                             // le motif suit l'exercice : il charge le genou
      expect(nouvelle.series).toBe(coupees);                                          // elle garde les séries de la place, coupées
      expect(nouvelle.raccourcie).toBe(true);
      expect(b.vue().voix[1]).not.toMatch(/Toutes/);
      expect(b.vue().voix[1]).toMatch(/^Tu ménages ton genou : .+, sans série lourde\.$/);
    });
  });

  test('le marqueur « neuf » suit le SLUG, pas l’indice (une fusion de voisins ne le déplace pas)', async () => {
    const b = bac();
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    const neuf = b.vue().routines[0].exercices.filter((x) => x.neuf);
    expect(neuf.length).toBe(1);
    expect(Object.keys(b.ctx.construit.neuf)[0]).toMatch(/^0:[a-z_]+$/);
  });

  test('le nom de la feuille d’un exercice est le nom ÉCRIT de la séance (« Haut A (2) » quand « Haut A » existe)', async () => {
    const b = bac({ routines: [{ id: 'x', nom: 'Haut A', dossier: null, rang: 0, exercices: [] }] });
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 0);
    expect(b.ctx.__choix.aide).toMatch(/^Haut A \(2\) · /);
  });

  test('« Je n’en veux pas » sans remplaçant : une phrase sans genre (« sort de ton programme »)', async () => {
    const aucun = Object.assign({}, Generateur, {
      neVeuxPas: (cat2, rts, e2, r, k) => { const res = Generateur.neVeuxPas(cat2, rts, e2, r, k); res.routines[r].exercices.splice(k, 1); return res; }
    });
    const b = bac({ generateur: aucun });
    await b.appel('ouvrirApercuProgramme()');
    const ancien = b.vue().routines[0].exercices[0].nom;
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('refuser');
    const v = b.vue();
    expect(v.voix[v.voix.length - 1]).toBe(ancien + ' sort de ton programme. Je ne te le proposerai plus.');
  });
});

describe('revue adverse — « Remplacer » dans l’aperçu range les écartés en fin de liste, avec leur mention', () => {
  test('⚠️ DISCRIMINANT — la VRAIE liste (`freresDe`) : le frère écarté passe en dernier et porte `ecarte`, les autres non', async () => {
    const b = bac({ freres: [{ slug: 'developpe_couche_haltere', fait: null }, { slug: 'chest_press_machine', fait: null },
                             { slug: 'pompes', fait: null }],
                    profil: { exercices_ecartes: ['developpe_couche_haltere'] } });
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surExercice(0, 0);
    b.ctx.__choix.surChoix('remplacer');
    const freres = b.ctx.__machine.freres;
    expect(freres.map((f) => [f.nom, !!f.ecarte])).toEqual([
      [nom('chest_press_machine'), false], [nom('pompes'), false], [nom('developpe_couche_haltere'), true]]);
    freres[2].surChoisir();                                              // un écarté se choisit encore : jamais caché
    expect(b.vue().routines[0].exercices[0].nom).toBe(nom('developpe_couche_haltere'));
  });
});

// ═══ 66D — « CONSTRUIS-LE-MOI » AVEC UN HISTORIQUE (QUESTIONNAIRE-COACH-V2 §5 quater.5) ════════════════════════
// Un historique forgé : deux séances déduites (« Haut », cochée ; « Bas », décochée — elle revient), des habitudes,
// un muscle avec son fait du coach. Les règles sont celles du générateur (leurs cas sont dans `v2-generateur-fin`) :
// ici, le CÂBLAGE — le choix, l'assemblage, « Retirer » / « Remettre », les retouches, la création.
const HISTORIQUE = () => ({
  habitudes: { seances_par_semaine: 2, taille_de_seance: 16, reps: {}, series: {} },
  deduit: [
    { nom: 'Haut', fois: 8, derniere: '2026-10-01', cochee: true, exercices: [
      { exercise_slug: 'developpe_couche_barre', series: 4, reps: 6, chauffes: 2 },
      { exercise_slug: 'rowing_poulie_assis', series: 3, reps: 10, chauffes: 0 },
      { exercise_slug: 'developpe_couche_haltere', series: 3, reps: 10, chauffes: 0 },
      { exercise_slug: 'curl_biceps_haltere', series: 3, reps: 12, chauffes: 0 },
      { exercise_slug: 'extension_triceps_poulie_haute', series: 3, reps: 12, chauffes: 0 }] },
    { nom: 'Bas', fois: 5, derniere: '2026-08-20', cochee: false, exercices: [
      { exercise_slug: 'squat_barre', series: 4, reps: 5, chauffes: 2 },
      { exercise_slug: 'presse_a_cuisses', series: 3, reps: 10, chauffes: 0 },
      { exercise_slug: 'leg_curl_assis', series: 3, reps: 12, chauffes: 0 }] }],
  derniere: '2026-10-01T18:00:00.000Z',
  volume: { pectoraux: { moyenne: 6, seuil: 6, max: 9, fenetres: 8 } }
});

describe('66D — « Construis-le-moi » avec un historique : le choix, l’aperçu, Retirer / Remettre', () => {
  test('le programme déduit complété : le titre, la voix des 12 semaines, « Ce que j’ai changé · 2 », la reprise marquée ; rien n’est écrit', async () => {
    const b = bac(HISTORIQUE());
    await b.appel('ouvrirApercuProgramme()');
    const v = b.vue();
    expect(v.titre).toBe('2 séances par semaine.');
    expect(v.voix.slice(0, 2)).toEqual(['Ce sont tes séances des 12 dernières semaines.',
      'Je te propose tes charges à chaque séance. Touche un exercice pour le changer.']);
    // « Bas » revient (G3) ; le tirage rattrape la poussée (G5 : 3 séries de rowing pour 7 de couché) jusqu'à 5 séries.
    expect(v.changements).toEqual({ titre: 'Ce que j’ai changé · 2',
      lignes: [{ texte: 'Bas revient.', retire: false, libelle: 'Retirer' },
               { texte: nom('rowing_poulie_assis') + ' : 3 → 5 séries dans Haut.', retire: false, libelle: 'Retirer' }] });
    expect(v.routines.map((r) => [r.nom, r.reprise])).toEqual([['Haut', false], ['Bas', true]]);
    expect(v.routines[0].exercices.map((x) => x.nom)).toEqual(['developpe_couche_barre', 'rowing_poulie_assis',
      'developpe_couche_haltere', 'curl_biceps_haltere', 'extension_triceps_poulie_haute'].map(nom));
    expect(b.journal.routines).toEqual([]);
    expect(b.journal.profil).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — sans habitudes, sans séance déduite ou sans aucun fait du coach : le gabarit, « Ton programme de départ »', async () => {
    for (const manque of [{ habitudes: null }, { deduit: [] }, { volume: { pectoraux: null } }]) {
      const b = bac(Object.assign(HISTORIQUE(), manque));
      await b.appel('ouvrirApercuProgramme()');
      expect([JSON.stringify(manque), b.vue().titre, b.vue().changements]).toEqual(
        [JSON.stringify(manque), 'Ton programme de départ : 4 séances par semaine.', null]);
    }
  });

  test('le fait du coach se lit jusqu’à la semaine de la DERNIÈRE séance comprise : `avant` = le lundi qui suit', async () => {
    const vus = [];
    const b = bac(HISTORIQUE());
    b.ctx.volumeDuCoach = (avant) => { vus.push(avant); return HISTORIQUE().volume; };
    await b.appel('ouvrirApercuProgramme()');
    // La dernière séance, le jeudi 1er octobre 2026 : sa semaine commence le lundi 28 septembre ; `avant` est le 5 octobre.
    expect(vus.length).toBe(1);
    const d = new Date(vus[0]);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getDay()]).toEqual([2026, 10, 5, 1]);
  });

  test('« Retirer » puis « Remettre » : la reprise refusée ne revient pas, aucune autre à sa place ; rien n’est écrit', async () => {
    const b = bac(HISTORIQUE());
    await b.appel('ouvrirApercuProgramme()');
    b.vue().surChangement(0);
    let v = b.vue();
    expect(v.routines.map((r) => r.nom)).toEqual(['Haut']);
    // La ligne retirée passe à la fin, avec « Remettre ».
    expect(v.changements.titre).toBe('Ce que j’ai changé · 1');
    expect(v.changements.lignes.map((l) => [l.texte, l.libelle])).toEqual([
      [nom('rowing_poulie_assis') + ' : 3 → 5 séries dans Haut.', 'Retirer'], ['Bas ne revient pas.', 'Remettre']]);
    expect(v.titre).toBe('1 séance par semaine.');
    b.vue().surChangement(1);
    v = b.vue();
    expect(v.routines.map((r) => r.nom)).toEqual(['Haut', 'Bas']);
    expect(v.changements.lignes.map((l) => [l.texte, l.retire])).toEqual([['Bas revient.', false],
      [nom('rowing_poulie_assis') + ' : 3 → 5 séries dans Haut.', false]]);
    expect(b.journal.profil).toEqual([]);
    expect(b.journal.routines).toEqual([]);
  });

  test('« Je n’en veux pas » survit à un « Retirer » : la retouche est réappliquée, l’écarté écrit une fois, au geste', async () => {
    const b = bac(HISTORIQUE());
    await b.appel('ouvrirApercuProgramme()');
    const k = b.vue().routines[0].exercices.findIndex((x) => x.nom === nom('curl_biceps_haltere'));
    b.vue().surExercice(0, k);
    b.ctx.__choix.surChoix('refuser');
    const remplace = b.vue().routines[0].exercices[k];
    expect(remplace.nom).not.toBe(nom('curl_biceps_haltere'));
    expect(remplace.neuf).toBe(true);
    expect(b.journal.profil).toEqual([{ exercices_ecartes: ['curl_biceps_haltere'] }]);
    b.vue().surChangement(0);                                            // « Bas revient. » → retirée
    const v = b.vue();
    expect(v.routines.map((r) => r.nom)).toEqual(['Haut']);
    expect(v.routines[0].exercices[k].nom).toBe(remplace.nom);
    expect(v.routines[0].exercices.some((x) => x.nom === nom('curl_biceps_haltere'))).toBe(false);
    expect(b.journal.profil.length).toBe(1);
  });

  test('le temps manque (« C’est mon maximum », 40 min) : les paires antagonistes, groupées ; la création les écrit en superset, les chauffes gardées', async () => {
    const b = bac(Object.assign(HISTORIQUE(), { profil: { temps_reponse: 'max', duree_seance_min: 40 } }));
    await b.appel('ouvrirApercuProgramme()');
    const v = b.vue();
    const haut = v.routines[0].exercices.map((x) => [x.nom, x.paire]);
    // Jamais la barre lourde (le couché à la barre, premier) ; chaque paire, deux voisins au même groupe.
    expect(haut[0]).toEqual([nom('developpe_couche_barre'), null]);
    const groupes = haut.filter((x) => x[1] !== null).map((x) => x[1]);
    expect(groupes.length).toBeGreaterThanOrEqual(2);
    expect(v.changements.lignes.some((l) => / en superset dans Haut : ≈ \d+ min de moins\.$/.test(l.texte))).toBe(true);
    await b.vue().surCreer();
    const exos = b.journal.exercices[0].slice().sort((x, y) => x.rang - y.rang);
    const paires = {};
    exos.forEach((e) => { if (e.groupe_superset !== null) (paires[e.groupe_superset] = paires[e.groupe_superset] || []).push(e); });
    expect(Object.keys(paires).length).toBeGreaterThanOrEqual(1);
    Object.keys(paires).forEach((g) => {
      expect(paires[g].length).toBe(2);
      expect(paires[g][0].repos_cible_s).toBe(null);                  // le membre non final : le repos du superset
      expect(paires[g][1].repos_cible_s).toBeGreaterThan(0);
    });
    // Les chauffes de la personne restent : deux au couché à la barre.
    const couche = exos.find((e) => e.exercise_slug === 'developpe_couche_barre');
    expect(b.journal.seriesDe[couche.id].filter((s) => s.type_serie === 'echauffement').length).toBe(2);
  });
});
