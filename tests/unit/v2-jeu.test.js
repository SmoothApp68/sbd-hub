/** @jest-environment node */
//
// LE JEU V1 (JEU-V1.md, 64A) — `THJeu.etatDuJeu` rejoue les 24 cas de la
// référence (`fixtures/jeu_ref.py`, `fixtures/cas-jeu-v1.json`).
//
// Les entrées sont compactes : `deplier` est porté LIGNE À LIGNE de
// `jeu_ref.py`. Un écart entre les deux dépliages ferait comparer le module à
// une autre entrée que celle de la référence — ce test ne prouverait plus rien.
//
// Environnement node : le fuseau (Europe/Paris, `jest.globalSetup.js`) décide
// du lundi d'une séance ; jsdom le figerait avant l'exécution.

const fs = require('fs');
const path = require('path');

global.self = global;
require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
const Jeu = require('../../v2/js/jeu.js');

const DONNEES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-jeu-v1.json'), 'utf8'));
const SOURCE = fs.readFileSync(path.join(__dirname, '../../v2/js/jeu.js'), 'utf8');

// `deplier` (jeu_ref.py), porté ligne à ligne.
function deplier(cas, catalogues) {
  const e = Object.assign({}, cas.entree);
  if (typeof e.catalogue === 'string') e.catalogue = catalogues[e.catalogue];
  if ('lundis' in e) {
    e.compact = e.lundis.map((l) => [l + 'T12:00:00Z', [['crunch', 1, 0, 0, []]]]);
    delete e.lundis;
  }
  if ('compact' in e) {
    const noms = Object.keys(e.catalogue).sort();
    const seances = [], series = [];
    e.compact.forEach(([debut, exos], i) => {
      const sid = 's' + (i + 1);
      seances.push({ id: sid, debut: debut });
      exos.forEach(([brut, n, autres, duree, dist]) => {
        const slug = typeof brut === 'number' ? noms[brut] : brut;
        for (let k = 0; k < n; k++) {
          series.push({ session_id: sid, exercise_slug: slug, type_serie: 'travail',
            duree_s: k === 0 ? duree : 0,
            distance_m: k < dist.length ? dist[k] : null });
        }
        for (let k = 0; k < autres; k++) {
          series.push({ session_id: sid, exercise_slug: slug, type_serie: 'echauffement',
            duree_s: null, distance_m: null });
        }
      });
    });
    delete e.compact;
    e.seances = seances;
    e.series = series;
  }
  if (e.journal && typeof e.journal === 'object' && !Array.isArray(e.journal)) {
    const j = e.journal;
    e.journal = [];
    for (let k = 0; k < j.lignes; k++) e.journal.push({ set_id: 'm' + ((k % j.series) + 1), type: 'charge_max' });
  }
  const [a, m, d] = e.aujourdhui.split('-').map(Number);
  e.aujourdhui = new Date(a, m - 1, d);
  return e;
}

// Champ par champ, les nombres à 1e-6 près : la liste des écarts, chacun avec son chemin.
function ecarts(obtenu, attendu, chemin) {
  const out = [];
  const nature = (x) => (x === null ? 'null' : Array.isArray(x) ? 'tableau' : typeof x);
  if (nature(obtenu) !== nature(attendu)) {
    out.push(chemin + ' : ' + JSON.stringify(obtenu) + ' au lieu de ' + JSON.stringify(attendu));
  } else if (typeof attendu === 'number') {
    if (!(Math.abs(obtenu - attendu) <= 1e-6)) out.push(chemin + ' : ' + obtenu + ' au lieu de ' + attendu);
  } else if (Array.isArray(attendu)) {
    if (obtenu.length !== attendu.length) {
      out.push(chemin + ' : ' + obtenu.length + ' éléments au lieu de ' + attendu.length +
        ' (' + JSON.stringify(obtenu) + ' au lieu de ' + JSON.stringify(attendu) + ')');
    } else attendu.forEach((x, i) => out.push(...ecarts(obtenu[i], x, chemin + '[' + i + ']')));
  } else if (attendu !== null && typeof attendu === 'object') {
    const cles = Array.from(new Set(Object.keys(attendu).concat(Object.keys(obtenu)))).sort();
    cles.forEach((k) => {
      if (!(k in attendu)) out.push(chemin + '.' + k + ' : champ en trop');
      else if (!(k in obtenu)) out.push(chemin + '.' + k + ' : champ absent');
      else out.push(...ecarts(obtenu[k], attendu[k], chemin + '.' + k));
    });
  } else if (obtenu !== attendu) {
    out.push(chemin + ' : ' + JSON.stringify(obtenu) + ' au lieu de ' + JSON.stringify(attendu));
  }
  return out;
}

describe('jeu V1 — les 24 cas de la référence', () => {
  test('le fichier a 24 cas (le 24e, `stabilisateur-quart`, depuis 65), chacun avec son nom, son pourquoi, son entrée et son attendu', () => {
    expect(DONNEES.cas.length).toBe(24);
    expect(DONNEES.cas.map((c) => c.nom)).toContain('stabilisateur-quart');
    DONNEES.cas.forEach((c) => {
      expect([c.nom, typeof c.pourquoi === 'string' && c.pourquoi.length > 0]).toEqual([c.nom, true]);
      expect([c.nom, !!c.entree, !!c.attendu]).toEqual([c.nom, true, true]);
    });
    expect(new Set(DONNEES.cas.map((c) => c.nom)).size).toBe(24);
  });

  DONNEES.cas.forEach((cas) => {
    test(cas.nom + ' — ' + cas.pourquoi, () => {
      const obtenu = Jeu.etatDuJeu(deplier(cas, DONNEES.catalogues));
      expect(ecarts(obtenu, cas.attendu, cas.nom)).toEqual([]);
    });
  });

  test('le dépliage ne modifie pas le fichier de cas (deux passes, mêmes résultats)', () => {
    const cas = DONNEES.cas.filter((c) => c.nom === 'gel-utilise')[0];
    const avant = JSON.stringify(cas.entree);
    Jeu.etatDuJeu(deplier(cas, DONNEES.catalogues));
    expect(JSON.stringify(cas.entree)).toBe(avant);
  });

  test('le module ne modifie pas son entrée', () => {
    const cas = DONNEES.cas.filter((c) => c.nom === 'cardio-pilates-rando')[0];
    const e = deplier(cas, DONNEES.catalogues);
    const avant = JSON.stringify(e);
    Jeu.etatDuJeu(e);
    expect(JSON.stringify(e)).toBe(avant);
  });
});

describe('jeu V1 — la forme du module', () => {
  test('l’ordre du jeu : sept muscles, les six premiers forment exactement les zones du radar', () => {
    expect(Jeu.ORDRE_DES_MUSCLES).toEqual(['poitrine', 'dos', 'epaules', 'bras', 'jambes', 'tronc', 'cardio']);
    const zones = Semaine.ZONES.map((z) => z.cle).sort();
    expect(Jeu.ORDRE_DES_MUSCLES.slice(0, 6).slice().sort()).toEqual(zones);
    expect(Jeu.ORDRE_DES_MUSCLES[6]).toBe('cardio');
  });

  test('⚠️ pur : ni horloge, ni DOM, ni réseau, ni stockage, ni date en UTC', () => {
    // Les commentaires retirés : ils peuvent nommer ce que le code ne fait pas.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const interdits = [/\bDate\.now\b/, /\bnew\s+Date\s*\(\s*\)/, /\bdocument\b/, /\bwindow\b/, /\bfetch\b/,
      /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bXMLHttpRequest\b/, /\btoISOString\b/,
      /\bgetUTC\w+/, /86400000|864e5/];
    expect(interdits.filter((r) => r.test(code)).map(String)).toEqual([]);
    // La garde se lit vraiment.
    expect(interdits.some((r) => r.test('var t = Date.now();'))).toBe(true);
    expect(interdits.some((r) => r.test('lundi = new Date(lundi.getTime() + 7 * 86400000);'))).toBe(true);
  });

  test('il appelle les définitions existantes, il ne les recopie pas', () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ['Modele.estTravail', 'Modele.estExerciceSortie', 'Semaine.porteDuVolume', 'Semaine.zoneDuMuscle', 'Semaine.musclesPonderes',
      'Semaine.bornesSemaine', 'Semaine.decalerSemaine'].forEach((f) => expect([f, code.indexOf(f + '(') >= 0]).toEqual([f, true]));
    // Ni la liste des zones, ni le type de série, ni les barres écrits en dur.
    ['quadriceps', 'pectoraux', '\'travail\'', 'squat_barre', 'developpe_couche_barre'].forEach((x) =>
      expect([x, code.indexOf(x) >= 0]).toEqual([x, false]));
  });

  test('aucune séance : tout à zéro, prochain gel à 12', () => {
    const e = Jeu.etatDuJeu({ aujourdhui: new Date(2026, 9, 9), seances: [], series: [], catalogue: {}, journal: [],
      maximums: [], exercicesFaits: 0 });
    expect(e.semaines).toEqual({ actives: 0, serie: 0, meilleure: 0, reserve: 0, gelsGagnes: 0, gelsUtilises: [],
      prochainGel: 12 });
    expect(e.niveau.niveau).toBe(0);
    expect(e.succes.ids).toEqual([]);
  });

  test('une séance sans début lisible est ignorée (ni `null`, ni le 1ᵉʳ janvier 1970)', () => {
    const base = { aujourdhui: new Date(2026, 9, 9), series: [], catalogue: {}, journal: [], maximums: [], exercicesFaits: 0 };
    const e = Jeu.etatDuJeu(Object.assign({}, base, { seances: [{ id: 'a', debut: null }, { id: 'b', debut: 'pas une date' },
      { id: 'c', debut: '2026-10-06T16:00:00Z' }] }));
    expect(e.semaines.actives).toBe(1);
    expect(e.semaines.serie).toBe(1);
  });
});
