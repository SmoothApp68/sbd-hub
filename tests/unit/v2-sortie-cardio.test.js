//
// 133 (audit 130 #11, décidé le 21/10/2026 ; ECRAN-SAISIE §3 ter.4, JEU « Cardio », 133b) — UNE SORTIE, ET LE CARDIO DU
// JEU, CE SONT SEULEMENT LES EXERCICES DE NATURE `cardio`. Sans `nature`, l'ancienne règle (aucune charge, une mesure en
// temps ou en distance).
//
// Un test par lecteur de `estExerciceSortie`, sur quatre exercices : un étirement (mobilité, sans muscle), un gainage et
// un L-sit (un muscle principal), une randonnée (cardio). Et les deux lecteurs qui ne la lisent plus (le générateur, les
// habitudes : `Semaine.porteDuVolume`) : un étirement n'y change rien.
// Environnement jsdom (la carte de séance se rend) : `modele.js` et `rendu.js` se terminent par `this`.

const fs = require('fs');
const path = require('path');
process.env.TZ = 'Europe/Paris';

require('../../v2/js/routeur.js');
const Semaine = require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');
const Jeu = require('../../v2/js/jeu.js');
const G = require('../../v2/js/generateur.js');

const ETIREMENT = { slug: 'chien_tete_en_bas', nom: 'Chien Tête en Bas', nature: 'mobilite', mesure: 'temps',
  charge: 'aucune', equipement: 'aucun', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] };
const GAINAGE = { slug: 'gainage', nom: 'Gainage', nature: 'force', mesure: 'temps', charge: 'aucune',
  equipement: 'aucun', muscles_primaires: ['abdominaux'], muscles_secondaires: [], muscles_stabilisateurs: [] };
const LSIT = { slug: 'l_sit', nom: 'L-Sit', nature: 'habilete', mesure: 'temps', charge: 'aucune',
  equipement: 'aucun', muscles_primaires: ['abdominaux'], muscles_secondaires: [], muscles_stabilisateurs: [] };
const RANDO = { slug: 'randonnee', nom: 'Randonnée', nature: 'cardio', mesure: 'distance_temps', charge: 'aucune',
  equipement: 'aucun', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] };
const SQUAT = { slug: 'squat_barre', nom: 'Squat (Barre)', nature: 'force', mesure: 'charge_reps', charge: 'externe',
  equipement: 'barre', muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] };
const CURL = { slug: 'curl', nom: 'Curl', nature: 'force', mesure: 'charge_reps', charge: 'externe',
  equipement: 'machine', muscles_primaires: ['biceps'], muscles_secondaires: [], muscles_stabilisateurs: [] };
const CATALOGUE = [ETIREMENT, GAINAGE, LSIT, RANDO, SQUAT, CURL];
const sans = (f, cle) => { const x = Object.assign({}, f); delete x[cle]; return x; };

let r = 0;
const serie = (slug, champs, session) => Object.assign({ id: 'x' + (++r), session_id: session || 'S', exercise_slug: slug,
  rang: r, type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null, groupe_superset: null,
  validee_a: '2026-10-21T17:00:00Z', source: 'app' }, champs);
const DIX_MIN = { duree_s: 600 };
const RANDO_SERIE = { duree_s: 7200, distance_m: 9000 };

describe('133 — `estExerciceSortie` : la nature `cardio`, sinon l’ancienne règle', () => {
  test('étirement, gainage, L-sit : jamais une sortie ; la randonnée : une sortie', () => {
    expect([ETIREMENT, GAINAGE, LSIT, RANDO, SQUAT].map(Modele.estExerciceSortie)).toEqual([false, false, false, true, false]);
  });
  test('sans `nature` (catalogue d’avant v2_096) : l’ancienne règle, pour les quatre', () => {
    expect([ETIREMENT, GAINAGE, LSIT, RANDO, SQUAT].map((f) => Modele.estExerciceSortie(sans(f, 'nature'))))
      .toEqual([true, true, true, true, false]);
    expect(Modele.estExerciceSortie(null)).toBe(false);
  });
});

describe('133 — le jeu : les minutes de cardio', () => {
  const cardio = (slug, champs) => {
    const index = Modele.indexerExercices(CATALOGUE);
    const e = Jeu.etatDuJeu({ aujourdhui: new Date(2026, 9, 22), seances: [{ id: 'S', debut: '2026-10-21T17:00:00Z' }],
      series: [serie(slug, champs)], catalogue: index, journal: [], maximums: [], exercicesFaits: 1 });
    return e.muscles.cardio.points;
  };
  test('10 min d’étirement, de gainage ou de L-sit : aucun point de cardio ; 2 h de randonnée : 120', () => {
    expect(cardio('chien_tete_en_bas', DIX_MIN)).toBe(0);
    expect(cardio('gainage', DIX_MIN)).toBe(0);
    expect(cardio('l_sit', DIX_MIN)).toBe(0);
    expect(cardio('randonnee', RANDO_SERIE)).toBe(120);
  });
});

describe('133 — le résumé d’une séance (le journal)', () => {
  const resume = (slug, champs) => Modele.resumerSeance({ id: 'S', titre: 'Séance', debut: '2026-10-21T17:00:00Z' },
    [serie(slug, champs), serie(slug, champs)], CATALOGUE);
  const carte = (rs) => {
    const cible = document.createElement('div');
    window.THRendu.rendreListeSeances(cible, [rs], () => {});
    return { classe: cible.querySelector('.seance').className, meta: cible.querySelector('.seance-meta').textContent };
  };
  test('des étirements seuls : une séance ordinaire, résumée par ses exercices et sa durée, jamais « 0 série »', () => {
    const rs = resume('chien_tete_en_bas', DIX_MIN);
    expect(rs.estSortie).toBe(false);
    expect(rs.apercu.tete.map((e) => e.slug)).toEqual(['chien_tete_en_bas']);
    expect(carte(rs)).toEqual({ classe: 'seance', meta: '1 exercice · 20 min' });
  });
  test('du gainage seul, du L-sit seul : des séances ordinaires, avec leurs séries de travail', () => {
    expect(carte(resume('gainage', DIX_MIN))).toEqual({ classe: 'seance', meta: '1 exercice · 2 séries de travail' });
    expect(carte(resume('l_sit', DIX_MIN))).toEqual({ classe: 'seance', meta: '1 exercice · 2 séries de travail' });
  });
  test('une randonnée : toujours une sortie, en distance et en durée', () => {
    const rs = resume('randonnee', RANDO_SERIE);
    expect(rs.estSortie).toBe(true);
    expect(carte(rs).classe).toBe('seance sortie');
  });
});

describe('133 — les faits : « les autres activités » (`ceQueJeSais.autres`), le cardio seulement', () => {
  test('l’étirement, le gainage, le L-sit n’y sont pas ; la randonnée, oui', () => {
    const seances = [], parSeance = {};
    ['chien_tete_en_bas', 'gainage', 'l_sit', 'randonnee'].forEach((slug, i) => {
      const id = 's' + i;
      seances.push({ id, debut: new Date(2026, 9, 10 + i, 18).toISOString(), fin: null });
      parSeance[id] = [serie(slug, slug === 'randonnee' ? RANDO_SERIE : DIX_MIN, id)];
    });
    const index = Modele.indexerExercices(CATALOGUE);
    const c = { seances, series: [].concat(...Object.values(parSeance)), exercices: CATALOGUE,
      seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
    expect(Faits.creer().ceQueJeSais(c, new Date(2026, 9, 22, 12), []).autres).toEqual(['randonnée']);
  });
});

describe('133b — les habitudes lisent « porte du volume », pas la sortie', () => {
  const corpus = (avecEtirement) => {
    const seances = [], parSeance = {};
    for (let i = 0; i < 4; i++) {
      const id = 's' + i;
      seances.push({ id, debut: new Date(2026, 8, 7 + i * 2, 18).toISOString(), fin: null });
      const s = [serie('squat_barre', { charge_kg: 100, reps: 5 }, id), serie('squat_barre', { charge_kg: 100, reps: 5 }, id),
        serie('curl', { charge_kg: 20, reps: 10 }, id), serie('gainage', { duree_s: 60 }, id), serie('l_sit', { duree_s: 20 }, id)];
      if (avecEtirement) s.unshift(serie('chien_tete_en_bas', DIX_MIN, id), serie('chien_tete_en_bas', DIX_MIN, id));
      if (i === 0) s.push(serie('randonnee', RANDO_SERIE, id));
      parSeance[id] = s;
    }
    seances.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));
    const index = Modele.indexerExercices(CATALOGUE);
    return { seances, series: [].concat(...Object.values(parSeance)), exercices: CATALOGUE,
      seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
  };
  test('des étirements ajoutés à chaque séance ne changent ni la taille de séance ni les séries habituelles', () => {
    const sans = Faits.creer().habitudes(corpus(false));
    const avec = Faits.creer().habitudes(corpus(true));
    expect(sans).not.toBeNull();
    expect(sans.taille_de_seance).toBe(5);                // squat ×2, curl, gainage, L-sit ; jamais la randonnée
    expect(Object.keys(sans.series).sort()).toEqual(['curl', 'gainage', 'l_sit', 'squat_barre']);
    expect(avec).toEqual(sans);
  });
});

describe('133b — le générateur lit « porte du volume », pas la sortie', () => {
  const DONNEES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66-relire.json'), 'utf8'));
  const SOURCE = fs.readFileSync(path.join(__dirname, '../../v2/js/generateur.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const catalogue = Object.assign({}, DONNEES.catalogue, { chien_tete_en_bas: sans(ETIREMENT, 'slug') });
  const avecEtirements = (cas) => {
    const e = JSON.parse(JSON.stringify(Object.assign({}, cas.entree, { catalogue })));
    const etirement = () => ({ exercise_slug: 'chien_tete_en_bas', groupe_superset: null, series: [{ type_serie: 'travail' }] });
    (e.routines || []).forEach((rt) => { rt.exercices.unshift(etirement()); rt.exercices.push(etirement()); });
    return e;
  };
  test('les onze cas de la référence, un étirement en tête ET en fin de chaque routine : la même relecture, à l’identique', () => {
    expect(DONNEES.cas.length).toBe(11);
    DONNEES.cas.forEach((cas) => {
      expect([cas.nom, G.relireSemaine(avecEtirements(cas))]).toEqual([cas.nom, cas.attendu]);
    });
  });
  test('le générateur n’appelle plus `estExerciceSortie` ; il appelle `porteDuVolume`', () => {
    expect(SOURCE.indexOf('Modele.estExerciceSortie(')).toBe(-1);
    expect(SOURCE.indexOf('Semaine.porteDuVolume(')).toBeGreaterThan(-1);
  });
});
