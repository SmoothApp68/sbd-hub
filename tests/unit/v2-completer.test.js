/** @jest-environment node */
//
// 66C — LE GÉNÉRATEUR V2 : LE PROGRAMME DÉDUIT COMPLÉTÉ (QUESTIONNAIRE-COACH-V2 §5 quater.3). `Generateur.completer`
// rejoue les quinze cas de la référence (`fixtures/gen66c.py`, `fixtures/cas-66c-generateur.json`) À L'IDENTIQUE —
// Léa, Jordan, Mélodie, Aurélien au 10/10/2026, et onze synthétiques. Un écart se rapporte : il ne se corrige pas dans
// le cas.
//
// Puis ses invariants (`verifierComplement`, V1 à V5) : vides sur les quinze cas, et chacun MORD SEUL sur une sortie
// trafiquée. Puis sa pureté, et la colonne `habilete` (v2_071) : lue, et absente elle vaut `false`.

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

const DONNEES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66c-generateur.json'), 'utf8'));
const copie = (x) => JSON.parse(JSON.stringify(x));
const entreeDe = (cas, catalogue) => copie(Object.assign({}, cas.entree, { catalogue: catalogue || DONNEES.catalogue }));
const cas = (nom) => DONNEES.cas.filter((c) => c.nom === nom)[0];
const complete = (nom) => { const e = entreeDe(cas(nom)); return { e, s: G.completer(e) }; };
const routine = (s, nom) => s.routines.filter((r) => r.nom === nom)[0];
const ligne = (s, nom, slug) => routine(s, nom).exercices.filter((x) => x.exercise_slug === slug)[0];

describe('66C — completer : les quinze cas de la référence, à l’identique', () => {
  test('le fichier a quinze cas, chacun avec son nom, son pourquoi, son entrée et son attendu', () => {
    expect(DONNEES.reference).toBe('gen66c.py');
    expect(DONNEES.cas.map((c) => c.nom)).toEqual(['reel-lea', 'reel-jordan', 'reel-melodie', 'reel-aurel_br',
      'reprise-la-plus-recente', 'serie-de-plus', 'jamais-une-habilete', 'jamais-une-barre-lourde', 'aucune-seance-de-sa-zone',
      'taille-de-seance', 'onze-par-seance', 'priorite-hors-seche', 'priorite-en-seche', 'jamais-au-dessus-du-max',
      'tirage-poussee']);
    DONNEES.cas.forEach((c) => {
      expect([c.nom, typeof c.pourquoi === 'string' && c.pourquoi.length > 0, !!c.entree, !!c.attendu])
        .toEqual([c.nom, true, true, true]);
    });
  });

  DONNEES.cas.forEach((c) => {
    test(c.nom + ' — ' + c.pourquoi, () => {
      expect(G.completer(entreeDe(c))).toEqual(c.attendu);
    });
  });

  test('Léa : DOS A repris (4 séances) ; le muscle-up, son exercice le plus fait pour les triceps, jamais ajouté', () => {
    const { s } = complete('reel-lea');
    expect(s.journal[0]).toEqual({ type: 'reprise', routine: 'DOS A' });
    expect(s.routines.length).toBe(4);
    expect(s.routines.some((r) => r.exercices.some((x) => x.exercise_slug === 'muscle_up'))).toBe(false);
  });
});

describe('66C — verifierComplement : les invariants V1 à V5', () => {
  test('vide sur les quinze cas', () => {
    DONNEES.cas.forEach((c) => {
      const e = entreeDe(c);
      expect([c.nom, G.verifierComplement(e, G.completer(e))]).toEqual([c.nom, []]);
    });
  });

  test('V1 — une série retirée se voit', () => {
    const { e, s } = complete('serie-de-plus');
    const t = copie(s);
    ligne(t, 'Bas', 'leg_curl_assis').series = 2;
    expect(G.verifierComplement(e, t)).toEqual(['V1 une série retirée']);
  });

  test('V2 — une habileté ajoutée se voit (même à 0 série)', () => {
    const { e, s } = complete('jamais-une-habilete');
    const t = copie(s);
    routine(t, 'Haut').exercices.push({ exercise_slug: 'muscle_up', series: 0, reps: 5, chauffes: 0 });
    expect(G.verifierComplement(e, t)).toEqual(['V2 une habileté ajoutée']);
  });

  test('V3 — une barre lourde ajoutée se voit : un frère à la barre (le squat avec pause)', () => {
    const { e, s } = complete('jamais-une-barre-lourde');
    const t = copie(s);
    routine(t, 'Bas').exercices.push({ exercise_slug: 'squat_avec_pause_barre', series: 0, reps: 5, chauffes: 0 });
    expect(G.verifierComplement(e, t)).toEqual(['V3 une barre lourde ajoutée']);
  });

  test('V4 — une séance au-delà de sa taille habituelle + 2 se voit', () => {
    const { e, s } = complete('taille-de-seance');
    const t = copie(s);
    ligne(t, 'Haut', 'developpe_couche_barre').series += 1;
    expect(G.verifierComplement(e, t)).toEqual(['V4 une séance au-delà de sa taille + 2']);
  });

  test('V5 — un muscle poussé au-dessus de son plus haut volume par un ajout se voit', () => {
    const { e, s } = complete('jamais-au-dessus-du-max');
    const t = copie(s);
    // Une série d'extension des triceps de plus, une de rowing de moins (au-dessus de son départ : rien n'est retiré),
    // la séance garde sa taille : seul le triceps passe au-dessus de son plus haut.
    ligne(t, 'Haut', 'extension_triceps_poulie_haute').series += 1;
    ligne(t, 'Haut', 'rowing_poulie_assis').series -= 1;
    expect(G.verifierComplement(e, t)).toEqual(['V5 triceps au-dessus de son plus haut volume']);
  });
});

describe('66C — completer est pure, et lit la colonne `habilete`', () => {
  test('l’entrée n’est pas modifiée (copie profonde comparée avant et après), sur les quinze cas', () => {
    DONNEES.cas.forEach((c) => {
      const e = entreeDe(c);
      const avant = copie(e);
      G.verifierComplement(e, G.completer(e));
      expect([c.nom, e]).toEqual([c.nom, avant]);
    });
  });

  test('`habilete` absente vaut `false` : sans la colonne, le muscle-up (le plus fait) serait ajouté — avec, jamais', () => {
    const catalogue = copie(DONNEES.catalogue);
    delete catalogue.muscle_up.habilete;
    const sans = G.completer(entreeDe(cas('jamais-une-habilete'), catalogue));
    expect(sans.journal.filter((j) => j.type === 'exercice').map((j) => j.exercise_slug)).toEqual(['muscle_up']);
    const avec = complete('jamais-une-habilete').s;
    expect(avec.journal.filter((j) => j.type === 'exercice').map((j) => j.exercise_slug))
      .toEqual(['extension_triceps_poulie_haute']);
  });

  test('les constantes, une fois, avec leur valeur ; `PAR_SEANCE` et `MUSCLES` sont ceux de la relecture', () => {
    expect([G.ECART, G.SERIES_MAX, G.MARGE_SEANCE, G.PAR_SEANCE]).toEqual([1, 5, 2, 11]);
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/generateur.js'), 'utf8');
    ['ECART', 'SERIES_MAX', 'MARGE_SEANCE', 'PAR_SEANCE', 'MUSCLES', 'TIRAGE', 'ETAGE_DES_ZONES'].forEach((t) => {
      expect([t, (src.match(new RegExp('\\bvar ' + t + '\\b', 'g')) || []).length]).toEqual([t, 1]);
    });
    // Une seule définition du tirage, de la poussée et de la barre lourde, lue par la relecture et le complément.
    ['function estTirage', 'function estPoussee', 'function estBarreLourde', 'function familleDeBarre'].forEach((f) =>
      expect([f, src.split(f).length - 1]).toEqual([f, 1]));
  });
});
