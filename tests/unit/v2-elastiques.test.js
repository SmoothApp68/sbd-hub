/** @jest-environment node */
//
// 132 — LES ÉLASTIQUES PAR LEUR NOM (chantier B3 ; MOTEUR §10 ter, ECRAN-PROFIL §2.4 sexies, ECRAN-SAISIE §3 ter.6).
//
// Une liste d'élastiques de Ma salle est une SALLE (§10 bis) dont les crans sont des noms : le coach ne lit que l'ordre
// de la liste, jamais un chiffre. Chaque élastique reçoit une charge VIRTUELLE, ordonnée dans le sens où monter est plus
// dur (aide : −3, −2, −1 ; résistance : 3, 2, 1), jamais affichée ni écrite.
//
// LE FICHIER DE CAS FAIT FOI. `cas-132.json` sort de `elastiques132.py` (Claude.ai, 21/10/2026). Un cas qui semble faux
// se rapporte ; il ne se corrige pas ici — d'où l'empreinte du fichier, vérifiée en tête.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Mo = require('../../v2/js/modele.js');
const Profil = require('../../v2/js/profil.js');
const S = require('../../v2/js/seance.js');

const CHEMIN = path.join(__dirname, 'fixtures', 'cas-132.json');
const F = JSON.parse(fs.readFileSync(CHEMIN, 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

// ═══ 0. LE FICHIER DE CAS N'EST PAS RETOUCHÉ ════════════════════════════════
describe('132 — le fichier de cas', () => {
  test('son empreinte est celle du fichier reçu de Claude.ai (21/10/2026)', () => {
    const h = crypto.createHash('sha256').update(fs.readFileSync(CHEMIN)).digest('hex');
    expect(h).toBe('4df1c253dc4830586e502524d5b0a0bde96876f657fb6253f2bee033ea3abe30');
  });
  test('30 par_nom, 30 salles, 120 séries, 40 crans, 28 écritures, 12 meilleurs, 30 séances réelles', () => {
    expect(F.par_nom).toHaveLength(30);
    expect(F.salle).toHaveLength(30);
    expect(F.serie).toHaveLength(120);
    expect(F.cran).toHaveLength(40);
    expect(F.ecrire).toHaveLength(28);
    expect(F.meilleur).toHaveLength(12);
    expect(F.pratiquante_a.seances).toHaveLength(30);
  });
});

// ═══ 1. LES DONNÉES : LE CATALOGUE, MA SALLE ════════════════════════════════
describe('132 — le catalogue lit `type_elastique` dans son `select` principal', () => {
  const LIGNES = [
    { slug: 'tractions_elastique', nom: 'Tractions (Élastique)', mesure: 'charge_reps', charge: 'assistance', type_elastique: 'grand' },
    { slug: 'clamshell_elastique', nom: 'Clamshell (Élastique)', mesure: 'reps', charge: 'elastique', type_elastique: 'mini' },
    { slug: 'squat_barre', nom: 'Squat', mesure: 'charge_reps', charge: 'absolue', type_elastique: null },
    { slug: 'vieux', nom: 'Vieux', mesure: 'reps', charge: 'aucune' },
    { slug: 'bizarre', nom: 'Bizarre', mesure: 'reps', charge: 'aucune', type_elastique: 'geant' }
  ];
  let requetes;
  const client = () => ({
    from() {
      let select = '';
      const c = {
        select(s) { select = s; return c; }, eq() { return c; }, gt() { return c; }, or() { return c; },
        order() { return c; }, limit() { return c; }, range() { return c; },
        then(res, rej) {
          requetes.push(select);
          const premiere = requetes.filter((x) => x === select).length === 1;
          const data = !premiere || /echelle/.test(select) ? [] : LIGNES.map((l) => Object.assign({}, l));
          return Promise.resolve({ data, error: null }).then(res, rej);
        }
      };
      return c;
    }
  });
  afterEach(() => { delete globalThis.THClient; });
  test('dans le `select` principal, et une valeur inconnue ou absente se lit `null`', async () => {
    requetes = [];
    globalThis.THSeance = S;
    globalThis.THClient = { obtenir: () => client() };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    const D = require('../../v2/js/donnees.js');
    const cat = await D.tousLesExercices();
    expect(requetes[0]).toMatch(/\btype_elastique\b/);
    const ix = Mo.indexerExercices(cat);
    expect(ix.tractions_elastique.type_elastique).toBe('grand');
    expect(ix.clamshell_elastique.type_elastique).toBe('mini');
    expect(ix.squat_barre.type_elastique).toBeNull();
    expect(ix.vieux.type_elastique).toBeNull();
    expect(ix.bizarre.type_elastique).toBeNull();
  });
});

describe('132 — Ma salle lit et écrit les élastiques (ECRAN-PROFIL §2.4 sexies)', () => {
  const GRANDS = [{ nom: 'Noir', kg: 35 }, { nom: 'Rouge', kg: 25 }, { nom: 'Vert' }];
  const MINI = [{ nom: 'Bleue' }, { nom: 'Jaune' }];
  test('les deux listes et le choix « par son nom » passent, dans leur ordre', () => {
    const s = Profil.salleValide({ elastiques: GRANDS, mini_bandes: MINI, elastiques_par_nom: true });
    expect(s).toEqual({ barres_ez: [], barres_droites: [], halteres: null, elastiques: GRANDS, mini_bandes: MINI,
                        elastiques_par_nom: true });
    expect(Profil.champsEcrits({ ma_salle: s })).toEqual({ ma_salle: s });
  });
  test('une salle sans élastique s’écrit comme avant (aucune clé nouvelle)', () => {
    expect(Profil.salleValide({ barres_ez: [10], barres_droites: [], halteres: null, elastiques: [], mini_bandes: [],
                                elastiques_par_nom: false }))
      .toEqual({ barres_ez: [10], barres_droites: [], halteres: null });
  });
  test('les bornes de la base : 10 au plus, un nom de 1 à 30 sans espace au bord, un kg de 0,5 à 100 au demi', () => {
    const onze = Array.from({ length: 11 }, (_, i) => ({ nom: 'E' + i }));
    expect(Profil.salleValide({ elastiques: onze })).toBeUndefined();
    expect(Profil.salleValide({ mini_bandes: onze })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: '' }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: ' Noir' }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'Noir ' }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'x'.repeat(31) }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'x'.repeat(30) }] }).elastiques).toHaveLength(1);
    expect(Profil.salleValide({ elastiques: [{ nom: 'Noir', kg: 0 }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'Noir', kg: 100.5 }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'Noir', kg: 22.3 }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'Noir', kg: 0.5 }] }).elastiques).toEqual([{ nom: 'Noir', kg: 0.5 }]);
    expect(Profil.salleValide({ mini_bandes: [{ nom: 'Bleue', kg: 5 }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'Noir', couleur: 'noir' }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: GRANDS, elastiques_par_nom: 'oui' })).toBeUndefined();
  });
  test('l’unicité du nom dans une liste (sans compter la casse), pas d’une liste à l’autre', () => {
    expect(Profil.salleValide({ elastiques: [{ nom: 'Noir' }, { nom: 'noir' }] })).toBeUndefined();
    expect(Profil.salleValide({ elastiques: [{ nom: 'Bleue' }], mini_bandes: [{ nom: 'Bleue' }] }).mini_bandes)
      .toEqual([{ nom: 'Bleue' }]);
  });
  test('une salle hors bornes ne part pas (elle serait refusée, et tout le profil avec elle)', () => {
    expect(Profil.champsEcrits({ ma_salle: { elastiques: [{ nom: 'Noir' }, { nom: 'Noir' }] } })).toEqual({});
  });
  test('le brouillon garde les élastiques : « Valider » les barres ne les efface pas', () => {
    const profil = { ma_salle: { barres_ez: [10], barres_droites: [], halteres: null, elastiques: GRANDS, mini_bandes: MINI,
                                 elastiques_par_nom: true } };
    const b = Profil.basculerBarre(Profil.brouillonSalle(profil), 'barres_ez', 15);
    expect(Profil.champsSalle(b)).toEqual({ ma_salle: { barres_ez: [10, 15], barres_droites: [], halteres: null,
      elastiques: GRANDS, mini_bandes: MINI, elastiques_par_nom: true } });
  });
  test('le résumé de Ma salle les nomme', () => {
    expect(Profil.resumeSalle({ ma_salle: { elastiques: GRANDS, mini_bandes: MINI } })).toBe('Élastiques, mini-bandes');
    expect(Profil.resumeSalle({ ma_salle: { barres_ez: [10], elastiques: GRANDS } })).toBe('EZ, élastiques');
  });
});

