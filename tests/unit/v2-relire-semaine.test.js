/** @jest-environment node */
//
// 66A — « LE COACH RELIT TA SEMAINE » (QUESTIONNAIRE-COACH-V2 §5 ter) : `Generateur.relireSemaine` rejoue les dix cas
// de la référence (`fixtures/relire66.py`, `fixtures/cas-66-relire.json`) À L'IDENTIQUE — Aurélien et Alexis au
// 10/10/2026, et huit synthétiques. Un écart se rapporte : il ne se corrige pas dans le cas.
//
// Puis ses invariants (`verifierRelecture`, R1 à R4) : vides sur les dix cas, et chacun MORD sur une sortie trafiquée.
// Puis sa pureté : l'entrée n'est pas touchée (la sèche retire des séries sur une copie).
//
// Environnement node, fuseau Europe/Paris (`jest.globalSetup.js`) : « lundi », « le 14 sept. » se disent en jours
// du calendrier local.

const fs = require('fs');
const path = require('path');

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const G = require('../../v2/js/generateur.js');

const DONNEES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66-relire.json'), 'utf8'));
const SOURCE = fs.readFileSync(path.join(__dirname, '../../v2/js/generateur.js'), 'utf8');

// L'entrée d'un cas : le catalogue commun du fichier, comme `main()` de la référence.
const entreeDe = (cas) => JSON.parse(JSON.stringify(Object.assign({}, cas.entree, { catalogue: DONNEES.catalogue })));
const cas = (nom) => DONNEES.cas.filter((c) => c.nom === nom)[0];
const relu = (nom) => { const e = entreeDe(cas(nom)); return { e, s: G.relireSemaine(e) }; };
const copie = (x) => JSON.parse(JSON.stringify(x));

describe('66A — relireSemaine : les dix cas de la référence, à l’identique', () => {
  test('le fichier a dix cas, chacun avec son nom, son pourquoi, son entrée et son attendu', () => {
    expect(DONNEES.reference).toBe('relire66.py');
    expect(DONNEES.cas.map((c) => c.nom)).toEqual(['aurel-seche-avant', 'aurel-seche-apres', 'alexis-maintien',
      'femme-force-deja-priorite', 'muscle-retards-par-muscle', 'sexe-inconnu', 'constats', 'seche-deux-muscles',
      'sans-barre', 'priorite-deplacements']);
    DONNEES.cas.forEach((c) => {
      expect([c.nom, typeof c.pourquoi === 'string' && c.pourquoi.length > 0, !!c.entree, !!c.attendu])
        .toEqual([c.nom, true, true, true]);
    });
  });

  DONNEES.cas.forEach((c) => {
    test(c.nom + ' — ' + c.pourquoi, () => {
      expect(G.relireSemaine(entreeDe(c))).toEqual(c.attendu);
    });
  });

  test('Aurélien en sèche : les mollets, 9 séries pour 6,4 → 3 séries retirées, mardi 4 → 2, vendredi 3 → 2', () => {
    const { s } = relu('aurel-seche-avant');
    const p = s.semaine.propositions;
    expect(p.map((x) => x.muscle)).toEqual(['mollets']);
    expect(p[0].phrase).toBe('En sèche, tes mollets dépassent ton plus haut volume habituel : 9 séries par semaine pour 6,4.');
    expect(p[0].question).toBe('Retirer 3 séries ? Tes barres ne bougent pas.');
    expect(p[0].lignes.map((l) => [l.de, l.a])).toEqual([[4, 2], [3, 2]]);
    // Son squat vaut 1,04 fois son couché : en retard.
    expect(s.historique.barres.filter((b) => b.retard).map((b) => b.slug)).toEqual(['squat_barre']);
    expect(s.historique.ratio.phrase).toMatch(/^Ton squat vaut 1,04 fois ton couché\./);
    // Après son geste : plus de proposition.
    expect(relu('aurel-seche-apres').s.semaine.propositions).toEqual([]);
  });

  test('Alexis : hors sèche, aucun retrait ; 1,32 → pas de retard ; le militaire de plus de 12 mois « pas encore dépassé »', () => {
    const { s } = relu('alexis-maintien');
    expect(s.semaine.propositions).toEqual([]);
    expect(s.historique.ratio).toBeNull();
    const militaire = s.historique.barres.filter((b) => b.slug === 'developpe_militaire_barre')[0];
    expect(militaire.detail).toMatch(/^octobre 2025, pas encore dépassé · /);
  });
});

describe('66A — verifierRelecture : les invariants R1 à R4', () => {
  test('vide sur les dix cas', () => {
    DONNEES.cas.forEach((c) => {
      const e = entreeDe(c);
      expect([c.nom, G.verifierRelecture(e, G.relireSemaine(e))]).toEqual([c.nom, []]);
    });
  });

  test('R1 — un retrait qui AJOUTE une série se voit ; un retrait qui vide un exercice aussi', () => {
    const { e, s } = relu('aurel-seche-avant');
    const ajoute = copie(s);
    ajoute.semaine.propositions[0].lignes[0].a = ajoute.semaine.propositions[0].lignes[0].de + 1;
    expect(G.verifierRelecture(e, ajoute)).toEqual(['R1 une proposition de sèche ajoute ou vide un exercice']);
    const vide = copie(s);
    vide.semaine.propositions[0].lignes[1].a = 0;
    expect(G.verifierRelecture(e, vide)).toEqual(['R1 une proposition de sèche ajoute ou vide un exercice']);
  });

  test('R2 — un retrait hors sèche se voit', () => {
    const { e, s } = relu('aurel-seche-avant');
    const maintien = copie(e);
    maintien.profil.phase = 'maintien';
    expect(G.verifierRelecture(maintien, s)).toEqual(['R2 retrait hors sèche']);
  });

  test('R3 — une proposition sans « non » se voit', () => {
    const { e, s } = relu('aurel-seche-avant');
    const sansNon = copie(s);
    delete sansNon.semaine.propositions[0].non;
    expect(G.verifierRelecture(e, sansNon)).toEqual(['R3 une proposition sans « oui » ni « non »']);
  });

  test('R3 — la priorité de « Ton historique » sans « non » se voit aussi (66A bis)', () => {
    const { e, s } = relu('aurel-seche-avant');
    expect(s.historique.ratio.proposition.type).toBe('priorite');
    const sansNon = copie(s);
    delete sansNon.historique.ratio.proposition.non;
    expect(G.verifierRelecture(e, sansNon)).toEqual(['R3 une proposition sans « oui » ni « non »']);
    const sansOui = copie(s);
    sansOui.historique.ratio.proposition.oui = '';
    expect(G.verifierRelecture(e, sansOui)).toEqual(['R3 une proposition sans « oui » ni « non »']);
  });

  test('R4 — un repère de ratio avec l’objectif Muscle se voit', () => {
    const { e, s } = relu('muscle-retards-par-muscle');
    expect(s.historique.ratio).toBeNull();
    const avecRatio = copie(s);
    avecRatio.historique.ratio = copie(relu('aurel-seche-avant').s.historique.ratio);
    expect(G.verifierRelecture(e, avecRatio)).toEqual(['R4 un repère de ratio hors Force / Les deux']);
  });
});

describe('66A — relireSemaine est pure', () => {
  test('l’entrée n’est pas modifiée (copie profonde comparée avant et après), sur les dix cas', () => {
    DONNEES.cas.forEach((c) => {
      const e = entreeDe(c);
      const avant = copie(e);
      G.relireSemaine(e);
      G.verifierRelecture(e, G.relireSemaine(e));
      expect([c.nom, e]).toEqual([c.nom, avant]);
    });
  });

  test('`aujourdhui` en date locale (l’instant de l’écran) ou en jour civil : la même relecture', () => {
    ['priorite-deplacements', 'aurel-seche-avant', 'alexis-maintien'].forEach((nom) => {
      const e = entreeDe(cas(nom));
      e.aujourdhui = new Date(2026, 9, 10, 20, 30);
      expect([nom, G.relireSemaine(e)]).toEqual([nom, cas(nom).attendu]);
    });
  });

  test('deux relectures de la même entrée rendent la même chose', () => {
    const e = entreeDe(cas('seche-deux-muscles'));
    expect(G.relireSemaine(e)).toEqual(G.relireSemaine(e));
  });

  test('ni horloge, ni DOM, ni réseau, ni stockage dans le module', () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const interdits = [/\bDate\.now\b/, /\bnew\s+Date\s*\(\s*\)/, /\bdocument\b/, /\bwindow\b/, /\bfetch\b/,
      /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/];
    expect(interdits.filter((r) => r.test(code)).map(String)).toEqual([]);
  });

  test('elle lit les définitions existantes, elle ne les recopie pas', () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ['Modele.estTravail', 'Semaine.musclesPonderes', 'Semaine.libelleMuscle', 'Moteur.estPolyarticulaire',
      'Modele.estExerciceSortie', 'Semaine.porteDuVolume', 'Moteur.motsDesMuscles', 'Modele.nombre', 'Modele.arrondi',
      'Modele.chargeFois', 'Modele.quand', 'Modele.moisAnnee', 'Modele.freresDe', 'Profil.joursDepuis']
      .forEach((f) => expect([f, code.indexOf(f + '(') >= 0]).toEqual([f, true]));
    // Ni les poids, ni les mois, ni les libellés, ni les singuliers recopiés.
    ['0.25', "'janvier'", "'sept.'", "'Deltoïde latéral'", 'SINGULIERS', 'LIBELLES'].forEach((x) =>
      expect([x, code.indexOf(x) >= 0]).toEqual([x, false]));
  });

  test('les tables de la relecture, une fois, exportées', () => {
    expect(G.BARRES.map((b) => b[0])).toEqual(['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre',
      'developpe_militaire_barre']);
    expect(G.RATIO_SQUAT_COUCHE).toEqual({ homme: 1.2, femme: 1.6 });
    expect([G.SECHE_DEPASSEMENT, G.PAR_SEANCE, G.PEU_TRAVAILLE]).toEqual([1.3, 11, 2]);
    ['RATIO_SQUAT_COUCHE', 'REPERE_SQUAT_COUCHE', 'SECHE_DEPASSEMENT', 'PAR_SEANCE', 'PEU_TRAVAILLE', 'MUSCLES_SUIVIS',
      'TIRAGE', 'BARRES'].forEach((t) => {
      expect([t, (SOURCE.match(new RegExp('\\bvar ' + t + '\\b', 'g')) || []).length]).toEqual([t, 1]);
    });
    // Les barres du fait (`faits.js`) sont celles de la relecture, dans le même ordre.
    const Faits = require('../../v2/js/faits.js');
    expect(Faits.creer().BARRES_DU_BILAN).toEqual(G.BARRES.map((b) => b[0]));
  });
});
