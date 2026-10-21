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


// ═══ 2. MA SALLE : LES GESTES DES DEUX LISTES (D1, écran 1) ═════════════════
describe('132 — Ma salle : ajouter, retirer, ranger, « par son nom »', () => {
  const vide = () => Profil.brouillonSalle({});
  test('ajouter : un nom (espaces au bord retirés), un kg facultatif sur un grand élastique seulement', () => {
    let r = Profil.ajouterElastique(vide(), 'elastiques', '  Noir ', 35);
    expect(r.erreur).toBeNull();
    r = Profil.ajouterElastique(r.brouillon, 'elastiques', 'Vert', null);
    r = Profil.ajouterElastique(r.brouillon, 'mini_bandes', 'Bleue', 12);
    expect(r.brouillon.elastiques).toEqual([{ nom: 'Noir', kg: 35 }, { nom: 'Vert' }]);
    expect(r.brouillon.mini_bandes).toEqual([{ nom: 'Bleue' }]);
  });
  test('refusés, avec leur phrase : un nom vide ou trop long, un doublon, un kg hors bornes, la onzième', () => {
    const b = Profil.ajouterElastique(vide(), 'elastiques', 'Noir', null).brouillon;
    expect(Profil.ajouterElastique(b, 'elastiques', '   ', null).erreur).toMatch(/Un nom de 1 à 30/);
    expect(Profil.ajouterElastique(b, 'elastiques', 'x'.repeat(31), null).erreur).toMatch(/Un nom de 1 à 30/);
    expect(Profil.ajouterElastique(b, 'elastiques', 'NOIR', null).erreur).toBe('« NOIR » est déjà dans la liste.');
    expect(Profil.ajouterElastique(b, 'elastiques', 'Rouge', 0.2).erreur).toMatch(/Un kg entre 0,5 et 100/);
    expect(Profil.ajouterElastique(b, 'elastiques', 'Rouge', 22.3).erreur).toMatch(/au demi-kilo/);
    expect(Profil.ajouterElastique(b, 'elastiques', 'Rouge', NaN).erreur).toMatch(/au demi-kilo/);
    expect(Profil.ajouterElastique(b, 'elastiques', 'Rouge', 22.5).brouillon.elastiques[1]).toEqual({ nom: 'Rouge', kg: 22.5 });
    let d = vide();
    for (let i = 0; i < 10; i++) d = Profil.ajouterElastique(d, 'mini_bandes', 'B' + i).brouillon;
    expect(Profil.peutAjouterElastique(d, 'mini_bandes')).toBe(false);
    expect(Profil.ajouterElastique(d, 'mini_bandes', 'B10').erreur).toBe('Dix au plus dans une liste.');
  });
  test('ranger (glisser) et retirer : l’ordre est la donnée', () => {
    let b = vide();
    ['Rouge', 'Vert', 'Noir'].forEach((n) => { b = Profil.ajouterElastique(b, 'elastiques', n).brouillon; });
    b = Profil.deplacerElastique(b, 'elastiques', 2, 0);
    expect(b.elastiques.map((e) => e.nom)).toEqual(['Noir', 'Rouge', 'Vert']);
    expect(Profil.deplacerElastique(b, 'elastiques', 0, 5)).toBe(b);
    b = Profil.retirerElastique(b, 'elastiques', 1);
    expect(b.elastiques.map((e) => e.nom)).toEqual(['Noir', 'Vert']);
  });
  test('« par son nom » : réglable, écrit seulement vrai', () => {
    let b = Profil.ajouterElastique(vide(), 'elastiques', 'Noir', 35).brouillon;
    expect(Profil.champsSalle(Profil.poserParNom(b, true)).ma_salle.elastiques_par_nom).toBe(true);
    expect(Profil.champsSalle(Profil.poserParNom(b, false)).ma_salle.elastiques_par_nom).toBeUndefined();
  });
  test('la pastille : la couleur que le nom dit, neutre sinon', () => {
    expect(['Noir', 'Rouge', 'Verte', 'Bleue', 'Jaune', 'Super fort'].map(Mo.pastilleElastique))
      .toEqual(['#2b2b2b', '#b8433b', '#3f8f5a', '#2f5f9e', '#d9b13b', null]);
  });
});

// ═══ 3. LE MODÈLE : UNE SEULE SOURCE — CONCORDANCE AVEC elastiques132.py (0 écart) ══
describe('132 — concordance avec elastiques132.py', () => {
  const salleDe = (c) => F.salles[c.salle];
  const exoDe = (c) => F.exercices[c.exercice];
  F.par_nom.forEach((c) => {
    test('par_nom — ' + c.salle + ' × ' + c.exercice, () => {
      expect(Profil.listeDe(exoDe(c), salleDe(c))).toEqual(c.liste);
      expect(Profil.parNom(exoDe(c), salleDe(c))).toBe(c.par_nom);
    });
  });
  F.salle.forEach((c) => {
    test('salle — ' + c.salle + ' × ' + c.exercice, () => {
      expect(Profil.salleElastique(exoDe(c), salleDe(c))).toEqual(c.attendu);
    });
  });
  F.serie.forEach((c) => {
    test('serie — ' + c.salle + ' × ' + c.exercice + ', série ' + c.serie, () => {
      const se = F.series[c.serie];
      expect(Profil.elastiqueDeSerie(exoDe(c), salleDe(c), se)).toBe(c.nom);
      expect(Profil.chargePourLeMoteur(exoDe(c), salleDe(c), se)).toBe(c.charge_moteur);
      expect(Mo.affichageElastique(se)).toBe(c.affichage);
    });
  });
  F.cran.forEach((c) => {
    test('cran — ' + c.salle + ' × ' + c.exercice + ', ' + c.nom, () => {
      expect(Profil.cranElastique(exoDe(c), salleDe(c), c.nom, 1)).toBe(c.au_dessus);
      expect(Profil.cranElastique(exoDe(c), salleDe(c), c.nom, -1)).toBe(c.en_dessous);
    });
  });
  F.ecrire.forEach((c) => {
    test('ecrire — ' + c.salle + ' × ' + c.exercice + ', ' + c.nom, () => {
      expect(Profil.ecrireSerie(exoDe(c), salleDe(c), c.nom, c.reps)).toEqual(c.attendu);
    });
  });
  F.meilleur.forEach((c) => {
    test('meilleur — ' + c.salle + ' × ' + c.exercice, () => {
      expect(Profil.meilleurElastique(exoDe(c), salleDe(c), F.series)).toBe(c.attendu);
    });
  });
  test('les charges virtuelles : sur une aide −3, −2, −1 ; en résistance 3, 2, 1 (l’ordre, jamais un chiffre)', () => {
    const l = ['Noir', 'Rouge', 'Vert'];
    expect(Profil.chargesVirtuelles(F.exercices.aide, l)).toEqual({ Noir: -3, Rouge: -2, Vert: -1 });
    expect(Profil.chargesVirtuelles(F.exercices.resistance, l)).toEqual({ Noir: 3, Rouge: 2, Vert: 1 });
  });
  test('le rattachement : le kg EXACT d’un élastique déclaré, jamais le plus proche ; jamais en résistance', () => {
    const s = F.salles.kg;
    expect(Profil.rattacherElastique(F.exercices.aide, s, -35)).toBe('Noir');
    expect(Profil.rattacherElastique(F.exercices.aide, s, -25)).toBe('Rouge');
    expect(Profil.rattacherElastique(F.exercices.aide, s, -20)).toBeNull();
    expect(Profil.rattacherElastique(F.exercices.aide, s, -24.5)).toBeNull();
    expect(Profil.rattacherElastique(F.exercices.resistance, s, -35)).toBeNull();
  });
});

describe('132 — la salle de l’exercice (`salleDeLExercice`, étendue)', () => {
  const INDEX = Mo.indexerExercices(Object.keys(F.exercices).map((k) => Object.assign({ nom: k, muscles_primaires: ['dos'] },
    F.exercices[k])));
  test('noté par nom : la liste devient la salle (charges virtuelles, noms, sens) ; sinon rien de nouveau', () => {
    const p = { ma_salle: F.salles.nom_mini };
    const a = Profil.salleDeLExercice(p, 'tractions_elastique', INDEX);
    expect(a).toMatchObject({ materiel: 'elastique', charges: [-3, -2, -1], noms: { '-3': 'Noir', '-2': 'Rouge', '-1': 'Vert' },
                              aide: true, liste: ['Noir', 'Rouge', 'Vert'] });
    expect(Profil.salleDeLExercice(p, 'clamshell_elastique', INDEX)).toMatchObject({ charges: [1, 2], aide: false,
      noms: { '2': 'Bleue', '1': 'Jaune' } });
    expect(Profil.salleDeLExercice({ ma_salle: F.salles.kg }, 'tractions_elastique', INDEX)).toBeNull();
    expect(Profil.salleDeLExercice(p, 'traction_assistee', INDEX)).toBeNull();
  });
});

// ═══ 4. LE MOTEUR ET LE PLAN (MOTEUR §10 ter) — SANS NOUVELLE RÈGLE ═════════
const Pa = require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');

const AVANT = '2026-10-21T10:00:00Z';
const GRANDS = { elastiques: [{ nom: 'Noir', kg: 35 }, { nom: 'Rouge', kg: 25 }, { nom: 'Vert' }], elastiques_par_nom: true };
const FICHES = {
  face_pull_elastique: { slug: 'face_pull_elastique', nom: 'Face Pull (Élastique)', charge: 'elastique', type_elastique: 'grand',
    mesure: 'reps', equipement: 'elastique', muscles_primaires: ['deltoide_post'] },
  tractions_elastique: { slug: 'tractions_elastique', nom: 'Tractions (Élastique)', charge: 'assistance', type_elastique: 'grand',
    mesure: 'charge_reps', equipement: 'elastique', muscles_primaires: ['dorsaux', 'biceps', 'trapezes'] },
  clamshell_elastique: { slug: 'clamshell_elastique', nom: 'Clamshell (Élastique)', charge: 'elastique', type_elastique: 'mini',
    mesure: 'reps', equipement: 'elastique', muscles_primaires: ['fessiers'] }
};
const jourAvant = (d) => new Date(Date.parse(AVANT) - d * 864e5).toISOString();
// Des séances d'un exercice : `series[i]` = [{ elastique, charge_kg, reps }…] ; une série par entrée.
function historique(slug, seances, jours) {
  let r = 0;
  return seances.map((ss, i) => ({
    seance: { id: 'H' + i, debut: jourAvant(jours[i]) },
    series: ss.map((x) => ({ id: 'h' + (++r), rang: r, exercise_slug: slug, type_serie: 'travail', rpe: null, ressenti: null,
      elastique: x.elastique === undefined ? null : x.elastique, charge_kg: x.charge_kg === undefined ? null : x.charge_kg,
      reps: x.reps }))
  }));
}
const fois = (n, x) => Array.from({ length: n }, () => Object.assign({}, x));
function consigneDe(slug, ma, groupes, extra) {
  const salle = Profil.salleDeLExercice({ ma_salle: ma }, slug, FICHES);
  const g = salle ? Profil.seancesPourLeMoteur(salle, groupes) : groupes;
  const etat = Pa.etatsExercices(g.map((x) => ({ slug, series: x.series })))[slug];
  return { salle, c: M.consigneDExercice(g, etat, AVANT, Object.assign({ mesure: salle ? 'charge_reps' : FICHES[slug].mesure,
    equipement: 'elastique', intention: 'progresser', reglage: 'normal', salle, seancesSousConsigne: [] }, extra || {})) };
}
function entreesDe(slug, ma, groupes, n, extra) {
  const { salle, c } = consigneDe(slug, ma, groupes, extra);
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: n || 3 });
  return { salle, e: { seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { [slug]: c },
    reglage: (extra && extra.reglage) || 'normal', paris: [], suites: {}, intention: 'progresser', modes: {}, lestReponse: null,
    echelles: {}, marcheReponses: {},
    catalogue: { [slug]: { equipement: 'elastique', muscles_primaires: FICHES[slug].muscles_primaires, mesure: 'charge_reps',
      leste: null, salle } } } };
}
const erreursDe = (plan, e) => T.verifierPlan(plan, e).erreurs;

describe('132 — le moteur lit l’ordre de la liste (§10 bis tel quel, sur les charges virtuelles)', () => {
  test('Face Pull : Vert au haut de la zone deux séances de suite — Rouge en dernière série, par son nom', () => {
    const h = historique('face_pull_elastique', [fois(3, { elastique: 'Vert', reps: 18 }), fois(3, { elastique: 'Vert', reps: 20 }),
      fois(3, { elastique: 'Vert', reps: 20 })], [21, 14, 7]);
    const { e } = entreesDe('face_pull_elastique', GRANDS, h, 3, { reglage: 'prudent' });
    const plan = T.planDeSeance(e), x = plan.exercices[0];
    expect(x.consigne.etat).toBe('test_propose');
    expect([x.consigne.ligne, x.consigne.haut]).toEqual([{ charge: 1, vise: 20 }, { charge: 2, vise: 15, k: 1 }]);
    expect(x.lignes.map((l) => l.prerempli.elastique)).toEqual(['Vert', 'Vert', 'Rouge']);
    expect(x.lignes.every((l) => l.prerempli.charge_kg === null)).toBe(true);
    expect(x.entete.jaune).toEqual(['Aujourd’hui : Vert × 20.'.replace('’', '\''), 'Si ça passe, Rouge × 15, à la série que tu veux.']
      .map((t) => t.replace(/ × /g, ' × ')));
    expect(x.donc).toBe('Donc Vert × 20, puis Rouge × 15 sur la dernière série.');
    expect(x.phrases.map((p) => p.texte).join(' ')).not.toMatch(/kg|−|-\d/);
    expect(x.elastique).toEqual({ liste: ['Noir', 'Rouge', 'Vert'], aide: false, noms: { 1: 'Vert', 2: 'Rouge', 3: 'Noir' } });
    expect(erreursDe(plan, e)).toEqual([]);
  });
  test('Tractions : sur une aide, monter c’est l’élastique plus léger (Noir → Rouge)', () => {
    const h = historique('tractions_elastique', [fois(3, { elastique: 'Noir', charge_kg: -35, reps: 12 }),
      fois(3, { elastique: 'Noir', charge_kg: -35, reps: 12 })], [14, 7]);
    const { e } = entreesDe('tractions_elastique', GRANDS, h, 3);
    const plan = T.planDeSeance(e), x = plan.exercices[0];
    expect(x.lignes.map((l) => l.prerempli.elastique)).toEqual(['Noir', 'Noir', 'Rouge']);
    expect(x.donc).toBe('Donc Noir × 12, puis Rouge × 10 sur la dernière série.');
    expect(erreursDe(plan, e)).toEqual([]);
  });
  test('au bout de la liste, l’état `salle_max` : on monte en reps, puis le plafond (§10 bis)', () => {
    const h = historique('face_pull_elastique', [fois(3, { elastique: 'Noir', reps: 16 }), fois(3, { elastique: 'Noir', reps: 17 })], [14, 7]);
    const { c } = consigneDe('face_pull_elastique', GRANDS, h);
    expect(c.consigne.etat).toBe('progression');
    const h2 = historique('face_pull_elastique', [fois(3, { elastique: 'Noir', reps: 20 }), fois(3, { elastique: 'Noir', reps: 20 })], [14, 7]);
    const { c: c2 } = consigneDe('face_pull_elastique', GRANDS, h2);
    expect(c2.consigne.etat).toBe('salle_max');
    expect(c2.consigne.ligne).toEqual({ charge: 3, vise: 20 });
    expect(c2.libelles.gris).toBe('Noir × 20, la plus lourde de ta salle.');
  });
  test('le clamshell lit les mini-bandes ; sans mini-bande déclarée, il reste en reps seules', () => {
    const h = historique('clamshell_elastique', [fois(3, { elastique: 'Jaune', reps: 15 })], [7]);
    const ma = Object.assign({}, GRANDS, { mini_bandes: [{ nom: 'Bleue' }, { nom: 'Jaune' }] });
    const { salle, c } = consigneDe('clamshell_elastique', ma, h);
    expect(salle.liste).toEqual(['Bleue', 'Jaune']);
    expect(c.consigne.ligne.charge).toBe(1);
    expect(consigneDe('clamshell_elastique', GRANDS, h).salle).toBeNull();
  });
  test('une série neutre (élastique retiré, aide en kg sans élastique de ce kg) sort du moteur ; une séance vide aussi', () => {
    const salle = Profil.salleDeLExercice({ ma_salle: GRANDS }, 'tractions_elastique', FICHES);
    const h = historique('tractions_elastique', [[{ elastique: 'Gris', reps: 8 }, { charge_kg: -20, reps: 9 }],
      [{ charge_kg: -35, reps: 10 }, { elastique: 'Gris', reps: 8 }]], [14, 7]);
    const g = Profil.seancesPourLeMoteur(salle, h);
    expect(g).toHaveLength(1);
    expect(g[0].series.map((s) => [s.charge_kg, s.reps])).toEqual([[-3, 10]]);
    // L'historique, lui, ne change pas : la séance reste avec son nom.
    expect(h[0].series[0].elastique).toBe('Gris');
  });
  test('hors de la règle, rien de chiffré sur une charge virtuelle : ni seconde charge, ni repli de reprise, ni report', () => {
    const DIX = { elastiques: Array.from({ length: 10 }, (_, k) => ({ nom: 'E' + k })), elastiques_par_nom: true };
    const de = (jours, noms) => jours.map((d) => [d, noms]);
    const h = (lignes, reps) => {
      let r = 0;
      return lignes.map(([d, noms]) => ({ seance: { id: 'H' + d, debut: jourAvant(d) }, series: noms.map((nom) => ({
        id: 'h' + (++r), rang: r, exercise_slug: 'face_pull_elastique', type_serie: 'travail', elastique: nom, charge_kg: null,
        reps, rpe: null, ressenti: null })) }));
    };
    // La seconde charge : la montée habituelle de deux crans (E9, E9 puis E7, sept fois) — en proportion, elle
    // proposerait E7 ; sur un élastique, le cran seul.
    const montees = h(de([56, 49, 42, 35, 28, 21, 14], ['E9', 'E9', 'E7']).concat([[7, ['E9', 'E9', 'E9']]]), 15);
    const { c } = consigneDe('face_pull_elastique', DIX, montees);
    expect(c.contexte).toEqual({ cran: 2, haut: null });
    // La reprise longue, au plus fort de dix : la charge de travail (10), jamais le cran en dessous (9, −10 %).
    const { c: cl } = consigneDe('face_pull_elastique', DIX, h(de([130, 123, 116], ['E0', 'E0', 'E0']), 15));
    expect(cl.consigne.etat).toBe('reprise_longue');
    expect(cl.consigne.ligne.charge).toBe(10);
    // Une zone choisie depuis la dernière séance : pas de report (une estimation du 1RM), la charge de travail.
    const { c: cz } = consigneDe('face_pull_elastique', DIX, h(de([21, 14, 7], ['E3', 'E3', 'E3']), 15),
      { correction: 'lourd', correctionsDeZone: [{ exercise_slug: 'face_pull_elastique', zone: 'lourd', corrigee_a: jourAvant(3) }] });
    expect(cz.consigne.etat).not.toBe('nouvelle_zone');
    expect(cz.consigne.ligne.charge).toBe(7);
    expect(cz.consigne.fondement.report).toBeUndefined();
  });
  test('l’objectif se refuse, avec sa phrase', () => {
    const O = require('../../v2/js/objectif.js');
    const salle = Profil.salleDeLExercice({ ma_salle: GRANDS }, 'tractions_elastique', FICHES);
    const pr = O.projection({ seances: [], charge: -25, reps: 10, maintenant: new Date(AVANT), salle });
    expect(pr.etat).toBe('elastique');
    expect(O.PHRASE_ELASTIQUE).toBe('Un objectif se pose en kg : cet exercice se note par élastique.');
  });
  test('aucun record d’une série notée par nom (ni médaille, ni journal) ; la même série en kg, oui', () => {
    const se = { debut: AVANT, series: [{ exercise_slug: 'x', type_serie: 'travail', elastique: 'Noir', charge_kg: -35, reps: 12 }] };
    const veille = { debut: jourAvant(1), series: [{ exercise_slug: 'x', type_serie: 'travail', elastique: 'Noir', charge_kg: -35, reps: 10 }] };
    expect(Mo.recordsBattus([veille], se, 0, {})).toEqual([]);
    // La veille, la même aide notée en kg, deux reps de moins : la série du jour, notée par nom, ne la bat pas.
    const veilleKg = { debut: jourAvant(1), series: [{ exercise_slug: 'x', type_serie: 'travail', elastique: null, charge_kg: -35, reps: 10 }] };
    expect(Mo.recordsBattus([veilleKg], se, 0, {})).toEqual([]);
    // … et une série notée par nom ne sert pas de base à battre : la série en kg du jour bat la veille en kg seule.
    const avecNommee = { debut: jourAvant(1), series: veilleKg.series.concat([{ exercise_slug: 'x', type_serie: 'travail',
      elastique: 'Noir', charge_kg: -35, reps: 15 }]) };
    const enKgDuJour = { debut: AVANT, series: [{ exercise_slug: 'x', type_serie: 'travail', elastique: null, charge_kg: -35, reps: 12 }] };
    expect(Mo.recordsBattus([avecNommee], enKgDuJour, 0, {}).map((r) => r.type)).toContain('reps_a_charge');
    const enKg = (s) => Object.assign({}, s, { elastique: null });
    expect(Mo.recordsBattus([{ debut: veille.debut, series: veille.series.map(enKg) }], { debut: AVANT, series: se.series.map(enKg) }, 0, {}).length)
      .toBeGreaterThan(0);
  });
});

// ═══ 5. I51, CASSÉ EXPRÈS, CONDITION PAR CONDITION ═══════════════════════════
describe('132 — I51 : sur un exercice noté par nom', () => {
  const base = () => {
    const h = historique('face_pull_elastique', [fois(3, { elastique: 'Vert', reps: 18 }), fois(3, { elastique: 'Vert', reps: 20 }),
      fois(3, { elastique: 'Vert', reps: 20 })], [21, 14, 7]);
    const { e } = entreesDe('face_pull_elastique', GRANDS, h, 3, { reglage: 'prudent' });
    return { e, plan: T.planDeSeance(e) };
  };
  const I51 = (plan, e) => erreursDe(plan, e).filter((t) => t.indexOf('I51 ') === 0);
  test('le plan réel les tient toutes', () => {
    const { e, plan } = base();
    expect(I51(plan, e)).toEqual([]);
  });
  test('a) une ligne (ou une ligne haute) de consigne hors de la liste', () => {
    const { e, plan } = base();
    plan.exercices[0].consigne = Object.assign({}, plan.exercices[0].consigne, { haut: { charge: 4, vise: 15, k: 1 } });
    expect(I51(plan, e).join()).toMatch(/la ligne haute de la consigne à une charge hors de la liste \(4\)/);
    const b = base();
    b.plan.exercices[0].consigne = Object.assign({}, b.plan.exercices[0].consigne, { haut: { charge: null, vise: 15, k: 1 } });
    expect(I51(b.plan, b.e).join()).toMatch(/la ligne haute de la consigne sans élastique/);
  });
  test('b) un fantôme, une proposition du coach hors de la liste ; un pré-remplissage qui dit une charge ou un nom inconnu', () => {
    let { e, plan } = base();
    plan.exercices[0].lignes[2].fantome = Object.assign({}, plan.exercices[0].lignes[2].fantome, { charge: 2.5 });
    expect(I51(plan, e).join()).toMatch(/le fantôme de la série 2 à une charge hors de la liste/);
    ({ e, plan } = base());
    plan.exercices[0].reaction.plan[1] = Object.assign({}, plan.exercices[0].reaction.plan[1], { source: 'coach', charge: 7 });
    expect(I51(plan, e).join()).toMatch(/la proposition du coach \(ligne 1\) à une charge hors de la liste/);
    ({ e, plan } = base());
    plan.exercices[0].lignes[0].prerempli = Object.assign({}, plan.exercices[0].lignes[0].prerempli, { charge_kg: 1 });
    expect(I51(plan, e).join()).toMatch(/pré-remplie d’une charge/);
    ({ e, plan } = base());
    plan.exercices[0].lignes[0].prerempli = Object.assign({}, plan.exercices[0].lignes[0].prerempli, { elastique: 'Gris' });
    expect(I51(plan, e).join()).toMatch(/pré-remplie d’un élastique hors de la liste \(Gris\)/);
  });
  test('c) une chauffe', () => {
    const { e, plan } = base();
    plan.exercices[0].chauffes = { phrase: 'x', reference: 1 };
    expect(I51(plan, e).join()).toMatch(/des chauffes sur un élastique/);
  });
  test('d) une dégressive', () => {
    const { e, plan } = base();
    plan.exercices[0].degressive = { phrase: 'x' };
    expect(I51(plan, e).join()).toMatch(/une dégressive sur un élastique/);
  });
  test('e) un record : la règle des records rejouée sur une série validée par nom (le garde-fou retiré, elle le dit)', () => {
    const { e, plan } = base();
    const se = e.seance.exercices[0].series[0];
    Object.assign(se, { elastique: 'Vert', reps: 20, validee_a: AVANT, source: 'app' });
    const plan2 = T.planDeSeance(e);
    expect(I51(plan2, e)).toEqual([]);
    const garde = Mo.recordsBattus;
    Mo.recordsBattus = () => [{ type: 'reps_a_charge' }];
    try { expect(I51(plan2, e).join()).toMatch(/ferait un record \(reps_a_charge\)/); } finally { Mo.recordsBattus = garde; }
  });
  test('f) une série neutre comptée, un pari sur l’exercice', () => {
    const { e } = base();
    Object.assign(e.seance.exercices[0].series[0], { elastique: 'Gris', reps: 20, validee_a: AVANT, source: 'app' });
    const plan = T.planDeSeance(e);
    expect(I51(plan, e)).toEqual([]);
    plan.exercices[0].lignes[0].faite = Object.assign({}, plan.exercices[0].lignes[0].faite, { charge: 1 });
    expect(I51(plan, e).join()).toMatch(/la série neutre 0 \(Gris\) compte dans les séries faites/);
    const b = base();
    b.plan.exercices[0].paris[0] = { module: 'consigne' };
    expect(I51(b.plan, b.e).join()).toMatch(/un pari \(il écrirait une charge virtuelle\)/);
  });
});

// ═══ 6. LA CONCORDANCE SUR UNE PRATIQUANTE RÉELLE (`pratiquante_a`) ═══════════
// Trente séances de tractions à l'élastique, anonymisées ; Noir = 35 kg, Rouge = 25 kg, Vert sans kg. Le plan, séance
// par séance (l'historique d'avant elle), une fois en mode kg et une fois en mode nom. Attendus (prompt 132) : en mode
// nom, toute charge proposée est un élastique de la liste ; quand le mode kg propose une aide qui correspond à un
// élastique, le mode nom propose cet élastique ; les écarts restants viennent tous de l'aide de 20 kg du jour 357.
describe('132 — concordance sur pratiquante_a (mode kg / mode nom)', () => {
  const PA = F.pratiquante_a;
  const slug = 'tractions_elastique';
  const REF = Date.parse('2025-01-01T09:00:00Z');
  const dateDe = (j) => new Date(REF + j * 864e5).toISOString();
  let rid = 0;
  const groupes = PA.seances.map((s, k) => ({ seance: { id: 'P' + k, debut: dateDe(s.jour) },
    series: s.series.map((x, i) => ({ id: 'p' + (++rid), rang: i + 1, exercise_slug: slug, type_serie: 'travail',
      charge_kg: x.charge_kg, reps: x.reps, rpe: null, ressenti: null, elastique: null })) }));
  const NOM_DU_KG = { '-35': 'Noir', '-25': 'Rouge' };
  function planDe(j, mode, reglage) {
    const ma = mode === 'nom' ? PA.salle : Object.assign({}, PA.salle, { elastiques_par_nom: false });
    const salle = Profil.salleDeLExercice({ ma_salle: ma }, slug, FICHES);
    const g = salle ? Profil.seancesPourLeMoteur(salle, groupes.slice(0, j)) : groupes.slice(0, j);
    const etat = Pa.etatsExercices(g.map((x) => ({ slug, series: x.series })))[slug];
    const avant = dateDe(PA.seances[j].jour);
    const c = M.consigneDExercice(g, etat, avant, { mesure: 'charge_reps', equipement: 'elastique', intention: 'progresser',
      reglage, salle, seancesSousConsigne: [] });
    let k = 0;
    const id = () => 's' + (++k);
    let se = S.creer({ id: 'S' + j, userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, slug, id, { series: PA.seances[j].series.length });
    const e = { seance: { id: 'S' + j, debut: avant, edition: false, exercices: se.exercices }, consignes: { [slug]: c },
      reglage, paris: [], suites: {}, intention: 'progresser', modes: {}, lestReponse: null, echelles: {}, marcheReponses: {},
      catalogue: { [slug]: { equipement: 'elastique', muscles_primaires: FICHES[slug].muscles_primaires, mesure: 'charge_reps',
        leste: null, salle } } };
    const plan = T.planDeSeance(e);
    return { salle, x: plan.exercices[0], erreurs: erreursDe(plan, e) };
  }
  ['prudent', 'normal', 'franc'].forEach((reglage) => {
    test('réglage ' + reglage + ' : chaque écart, avec sa cause', () => {
      const ecarts = [];
      const i357 = PA.seances.findIndex((s) => s.jour === 357);
      PA.seances.forEach((s, j) => {
        const a = planDe(j, 'kg', reglage), b = planDe(j, 'nom', reglage);
        expect([s.jour, a.erreurs, b.erreurs]).toEqual([s.jour, [], []]);
        const proposees = (x) => x.lignes.map((l) => (l.role === 'hors' ? null : l.charge));
        const kg = proposees(a.x), nom = proposees(b.x).map((c) => (c === null ? null : b.salle.noms[String(c)]));
        // En mode nom, toute charge proposée est un élastique de la liste.
        b.x.lignes.forEach((l) => { if (l.role !== 'hors' && l.charge !== null) expect(PA.salle.elastiques.map((x) => x.nom)).toContain(b.salle.noms[String(l.charge)]); });
        kg.forEach((c, i) => {
          if (c === null && nom[i] === null) return;
          if (c !== null && NOM_DU_KG[String(c)] !== undefined) {
            // Une aide qui correspond à un élastique : le mode nom propose cet élastique.
            expect([s.jour, i, nom[i]]).toEqual([s.jour, i, NOM_DU_KG[String(c)]]);
            return;
          }
          ecarts.push({ jour: s.jour, serie: i, kg: c, nom: nom[i] });
        });
      });
      // Les écarts restants, chacun avec sa cause :
      //   · « 357 » : la séance qui suit le jour 357 — son palier de 20 kg en mode kg ; neutre en mode nom (20 kg ne se
      //     rattache à aucun élastique), qui repart de la séance d'avant, au Noir ;
      //   · « liste » (Franc seulement) : le test en mode kg n'a pas de chiffre (« le cran au-dessus » : aucune aide
      //     plus légère dans l'historique d'alors) ; en mode nom, la liste le donne — l'élastique suivant, le Rouge.
      const cause = (x) => (x.kg === -20 && x.nom === 'Noir' && x.jour === PA.seances[i357 + 1].jour ? '357'
        : x.kg === null && x.nom === 'Rouge' ? 'liste' : 'inexpliqué');
      const parCause = {};
      ecarts.forEach((x) => { (parCause[cause(x)] = parCause[cause(x)] || []).push(x.jour + ':' + x.serie); });
      expect(Object.keys(parCause).sort()).toEqual(reglage === 'franc' ? ['357', 'liste'] : ['357']);
      expect(parCause['357']).toEqual([0, 1, 2].map((i) => PA.seances[i357 + 1].jour + ':' + i));
      if (reglage === 'franc') expect(parCause.liste).toEqual(['39:3', '52:3']);
    });
  });
});

// ═══ 7. LA GRILLE (ECRAN-SAISIE §3 ter.6) : LA COLONNE, LA CASE OBLIGATOIRE, L'ÉCRITURE, « PRÉC. », L'ÉLASTIQUE RETIRÉ ═
describe('132 — la colonne « ÉLASTIQUE » et l’écriture de `sets.elastique`', () => {
  test('la grille d’un exercice noté par nom : ÉLASTIQUE puis REPS (en résistance comme sur une aide)', () => {
    const r = Mo.grilleElastique(Mo.grilleDe(FICHES.face_pull_elastique));
    const a = Mo.grilleElastique(Mo.grilleDe(FICHES.tractions_elastique));
    [r, a].forEach((g) => {
      expect(g.colonnes).toEqual(['elastique', 'reps']);
      expect(g.champs).toEqual(['elastique', 'reps']);
      expect(g.elastique).toBe(true);
      expect(Mo.champDeMesure('elastique').entete).toBe('ÉLASTIQUE');
    });
    expect(r.effort).toBe(true);
    // Elle n'est pas une colonne de mesure : rien ne change pour les autres exercices.
    expect(Mo.colonnesDeSerie()).not.toContain('elastique');
  });
  test('la case est obligatoire : sans nom ni gris, elle manque ; le gris du coach la remplit', () => {
    const g = Mo.grilleElastique(Mo.grilleDe(FICHES.face_pull_elastique));
    expect(S.casesManquantes(g, { elastique: null, reps: 15 }, {})).toEqual(['elastique']);
    expect(S.casesManquantes(g, { elastique: null, reps: 15 }, { elastique: 'Vert', reps: 20 })).toEqual([]);
    expect(S.casesManquantes(g, { elastique: 'Jaune', reps: null }, {})).toEqual(['reps']);
  });
  test('`sets.elastique` est écrit (la liste blanche, `lignes()`) et relu (`COLONNES_SET`, la dernière séance)', () => {
    expect(S.COLONNES_SET).toContain('elastique');
    let k = 0;
    const id = () => 'x' + (++k);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'face_pull_elastique', id, { series: 1 });
    expect(se.exercices[0].series[0].elastique).toBeNull();
    se = S.modifierSerie(se, 0, 0, { elastique: 'Vert', charge_kg: null, reps: 20 });
    se = S.valider(se, 0, 0, new Date(AVANT));
    const l = S.lignes(se)[0];
    expect([l.elastique, l.charge_kg, l.reps]).toEqual(['Vert', null, 20]);
    expect(S.modifierSerie(se, 0, 0, { elastique: '' }).exercices[0].series[0].elastique).toBeNull();
    expect(S.verifierColonnes()).toBe(true);
    const prec = S.precedent('face_pull_elastique', [{ id: 'A' }], () => [{ exercise_slug: 'face_pull_elastique', rang: 1,
      elastique: 'Vert', charge_kg: null, reps: 20, type_serie: 'travail' }], null);
    expect(prec.series[0].elastique).toBe('Vert');
  });
  test('« préc. » : « Noir × 12 », le formateur unique, quelle que soit la grille', () => {
    expect(Mo.formatPrecedent({ elastique: 'Noir', charge_kg: -35, reps: 12 }, 'charge_reps', 'aide')).toBe('Noir × 12');
    expect(Mo.formatPrecedent({ elastique: 'Vert', charge_kg: null, reps: 20 }, 'reps', null)).toBe('Vert × 20');
    expect(Mo.formatPrecedent({ elastique: null, charge_kg: -35, reps: 12 }, 'charge_reps', 'aide')).toBe('35×12');
  });
  test('l’élastique retiré : la dernière séance l’a, la liste non — la consigne se tait et le dit', () => {
    const salle = Profil.salleDeLExercice({ ma_salle: GRANDS }, 'tractions_elastique', FICHES);
    const h = historique('tractions_elastique', [fois(3, { elastique: 'Noir', reps: 8 }), fois(3, { elastique: 'Gris', reps: 8 })], [14, 7]);
    expect(Profil.elastiqueRetireDe(salle, h)).toBe('Gris');
    expect(Profil.elastiqueRetireDe(salle, h.slice(0, 1))).toBeNull();
    // Une séance d'avant au Noir : on repart d'elle (le Gris est neutre), sans la phrase.
    const { c } = consigneDe('tractions_elastique', GRANDS, h, { elastiqueRetire: 'Gris' });
    expect(c.consigne.etat).not.toBe('silence');
    // Rien d'autre que le Gris : la phrase.
    const { c: c2 } = consigneDe('tractions_elastique', GRANDS, h.slice(1), { elastiqueRetire: 'Gris' });
    expect([c2.consigne.etat, c2.consigne.raison]).toEqual(['silence', 'elastique_retire']);
    expect(c2.libelles.gris).toBe('Ton élastique Gris n\'est plus dans Ma salle : je note sans proposer.');
  });
});

// ═══ 8. L'AFFICHAGE : LE FORMATEUR UNIQUE ÉCRIT « Noir × 12 » PARTOUT ═══════
describe('132 — le formateur unique : « Noir × 12 »', () => {
  const Fa = require('../../v2/js/faits.js');
  const Soc = require('../../v2/js/social.js');
  const serie = (slug, nom, kg, reps) => ({ exercise_slug: slug, type_serie: 'travail', elastique: nom, charge_kg: kg, reps });
  test('`formatMesure` (le journal, le détail, une séance d’ami, le direct du groupe) : le nom, jamais la charge', () => {
    expect(Mo.formatMesure(serie('t', 'Noir', -35, 12))).toBe('Noir × 12');
    expect(Mo.formatMesure(serie('f', 'Vert', null, 20))).toBe('Vert × 20');
    expect(Mo.formatMesure(serie('t', null, -35, 12))).toMatch(/^Aide 35\s?kg\s?×\s?12$/);
  });
  test('ce qui a été fait (le détail d’une séance d’ami, le récap) : groupé par élastique', () => {
    const fait = Fa.creer().faitDeLExercice;
    expect(fait([serie('f', 'Vert', null, 20), serie('f', 'Vert', null, 20), serie('f', 'Rouge', null, 15)]))
      .toBe('Vert × 20, 20 · Rouge × 15');
  });
  test('le direct du groupe : la mesure par le formateur', () => {
    const l = Soc.lignesDuDirect([{ pseudo: 'lea', exercise_slug: 'f', validee_a: AVANT, elastique: 'Noir', charge_kg: -35, reps: 12 }],
      AVANT, (s) => 'Tractions', Mo.formatMesure);
    expect(l[0].texte).toBe('lea · Tractions Noir × 12');
  });
  test('la meilleure série d’une séance notée par nom : par l’ordre de Ma salle (`nomme`), sinon la série telle quelle', () => {
    const series = [serie('tractions_elastique', 'Noir', -35, 12), serie('tractions_elastique', 'Rouge', -25, 8)];
    const nomme = (slug, l) => Profil.meilleurElastique(FICHES[slug], GRANDS, l);
    expect(Mo.meilleureSerieDe('tractions_elastique', series, Object.values(FICHES), Pa, {}, nomme))
      .toEqual({ charge: null, reps: null, valeur: 'Rouge × 8' });
    expect(Mo.meilleureSerieDe('tractions_elastique', series, Object.values(FICHES), Pa, {}).valeur).toBe('Rouge × 8');
    const ap = Mo.apercuExercices(series, Object.values(FICHES), Pa, {}, nomme);
    expect(ap.tete[0].valeur).toBe('Rouge × 8');
    expect(Mo.meilleureSerieDeTout('tractions_elastique', [{ cle: AVANT, series }], Object.values(FICHES), Pa, {}, nomme).valeur)
      .toBe('Rouge × 8');
    expect(Mo.texteMeilleure({ charge: null, reps: null, valeur: 'Rouge × 8' })).toBe('Rouge × 8');
  });
});

describe('132 — ni chauffe ni dégressive sur un élastique noté par nom (une ligne dégressive de la routine reste vide)', () => {
  test('la ligne dégressive de la routine : le coach ne la remplit pas (−22,5 % d’une charge virtuelle n’a pas de sens)', () => {
    const DIX = { elastiques: Array.from({ length: 10 }, (_, k) => ({ nom: 'E' + k })), elastiques_par_nom: true };
    const h = historique('face_pull_elastique', [fois(3, { elastique: 'E0', reps: 8 }), fois(3, { elastique: 'E0', reps: 8 })], [14, 7]);
    const { e } = entreesDe('face_pull_elastique', DIX, h, 4);
    e.seance.exercices = S.changerType({ exercices: e.seance.exercices }, 0, 3, 'degressive').exercices;
    const plan = T.planDeSeance(e), x = plan.exercices[0];
    expect(x.degressive).toBeNull();
    expect(x.chauffes).toBeNull();
    expect(x.proposition).toBeNull();
    expect(x.lignes[3].prerempli.elastique).toBeNull();
    expect(erreursDe(plan, e)).toEqual([]);
  });
});
