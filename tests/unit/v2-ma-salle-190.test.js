/** @jest-environment node */
//
// 190 — « MA SALLE » : LE PLUS PETIT DISQUE ET LA BARRE DE TRACTION (MOTEUR §10 bis, SCHEMA-REEL v2_119).
//
//   1. le pas de la barre = 2 × le plus petit disque quand il est connu, 2,5 sinon — UNE fonction (`pasDeLaBarre`), lue par la
//      consigne, le dépassement (186), le calage de la première séance (187), les chauffes, la dégressive, les phrases ;
//   2. la saisie : « Je ne sais pas » écrit `null` (jamais `false`), les bornes doublent celles de la base ;
//   3. la barre de traction : une seule définition de « demande une barre » (profil.js), lue par le générateur, l'échange
//      d'exercice et la liste « hors de Ma salle » ; `false` retire, `true` permet à la maison, absent ne change rien.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const G = require('../../v2/js/generateur.js');
const fs = require('fs');
const path = require('path');

const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
const catalogue = () => {
  const c = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
  });
  return c;
};

afterEach(() => M.brancherPlusPetitDisque(null));
const avec = (d) => M.brancherPlusPetitDisque(d === null ? null : () => d);

// ── 1. le pas de la barre ─────────────────────────────────────────────────────────────────────────────────────────────
let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' });
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (l) => l.map(([kg, reps], i) => ({ seance: { id: 'H' + i, debut: jourN(i) }, series: reps.map((r) => brute(kg, r)) }));
const avantDe = (l) => new Date(Date.parse(jourN(l.length - 1)) + 3 * 864e5).toISOString();
const consigne = (l, o) => M.consigneDExercice(groupes(l), undefined, avantDe(l), Object.assign({}, OPTIONS, o || {}));
const TROIS = [12, 12, 12];
const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');

describe('190 — le pas de la barre', () => {
  test.each([[0.5, 1], [1.25, 2.5], [2.5, 5], [5, 10], [0.25, 0.5], [null, 2.5], [undefined, 2.5], [0, 2.5], [-1, 2.5], ['x', 2.5]])(
    'pasDeLaBarre(%p) = %p', (d, pas) => { expect(M.pasDeLaBarre(d)).toBe(pas); });

  test('rien de branché : le défaut, inchangé', () => {
    avec(null);
    expect(consigne([[40, TROIS], [40, TROIS], [40, TROIS]]).consigne.haut.charge).toBe(42.5);
  });

  test.each([[0.5, 41], [1.25, 42.5], [2.5, 45], [null, 42.5]])('LA CONSIGNE : disque %p → la montée est de 2 × disque (40 → %p)', (d, vise) => {
    avec(d);
    expect(consigne([[40, TROIS], [40, TROIS], [40, TROIS]]).consigne.haut.charge).toBe(vise);
  });

  const VOLUME = [[40, [11, 10, 10]], [40, [11, 10, 10]], [40, [11, 10, 10]], [40, [11, 10, 10]]];
  test.each([[0.5, 41, 42], [1.25, 42.5, 45], [2.5, 45, 45], [null, 42.5, 45]])(
    'LE DÉPASSEMENT (186) : disque %p → la proposition haute suit le cran (%p, puis %p)', (d, a, b) => {
      avec(d);
      const f = { reglage: 'franc' };
      expect(consigne(VOLUME.concat([[40, [14, 14, 14]]]), f).consigne.haut.charge).toBe(a);
      expect(consigne(VOLUME.concat([[40, [15, 15, 15]]]), f).consigne.haut.charge).toBe(b);
    });

  const calage = (ressenti) => M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: true, series: [{ charge: 20, reps: 8, ressenti }] }).suivante.charge;
  test.each([[0.5, 21, 22], [1.25, 22.5, 25], [2.5, 25, 30], [null, 22.5, 25]])(
    'LE CALAGE (187) : disque %p → +1 cran (%p) ou +2 crans (%p)', (d, un, deux) => {
      avec(d);
      expect(calage('reste_2')).toBe(un);
      expect(calage('reste_3_plus')).toBe(deux);
    });

  test('LES CHAUFFES et la DÉGRESSIVE lisent le même pas : un disque de 5 → des paliers de 10', () => {
    avec(5);
    expect(sp(M.chauffesDe({ equipement: 'barre', reference: 95, deja_sollicite: false, routine: null }).phrase_proposition))
      .toBe('Chauffe : 20 kg × 10 · 50 kg × 6 · 70 kg × 3 · 80 kg × 1');
    expect(M.degressiveDe({ equipement: 'barre', derniere_serie: 20, reps_travail: 8 }).phrase).toBe('Trop léger pour une dégressive.');
    avec(null);
    expect(sp(M.chauffesDe({ equipement: 'barre', reference: 95, deja_sollicite: false, routine: null }).phrase_proposition))
      .toBe('Chauffe : 20 kg × 10 · 45 kg × 6 · 65 kg × 3 · 85 kg × 1');
  });

  test('LA PHRASE « ta barre » ne promet un cran que si le disque est connu', () => {
    avec(null);
    expect(M.phraseApprochee('barre', null)).not.toMatch(/plus petit disque/);
    avec(2.5);
    expect(M.phraseApprochee('barre', null)).toMatch(/plus petit disque/);
  });

  test('une machine, un haltère, un poids du corps ne lisent pas le disque', () => {
    avec(5);
    expect(M.pasDeLaBarre(5)).toBe(10);
    expect(consigne([[40, TROIS], [40, TROIS], [40, TROIS]], { equipement: 'machine' }).consigne.haut.charge).not.toBe(50);
  });
});

// ── 2. la saisie ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe('190 — la saisie : une seule fonction de geste', () => {
  test('« Je ne sais pas » écrit null, jamais false ni 0', () => {
    const d = Profil.poserReglageMateriel({ plus_petit_disque: 1.25 }, 'plus_petit_disque', 'inconnu');
    expect(d.plus_petit_disque).toBeNull();
    const t = Profil.poserReglageMateriel({ barre_traction: true }, 'barre_traction', 'inconnu');
    expect(t.barre_traction).toBeNull();
    expect(t.barre_traction).not.toBe(false);
  });
  test('Oui, Non, un disque proposé s’écrivent ; une valeur étrangère est sans effet', () => {
    expect(Profil.poserReglageMateriel({}, 'barre_traction', 'oui').barre_traction).toBe(true);
    expect(Profil.poserReglageMateriel({}, 'barre_traction', 'non').barre_traction).toBe(false);
    expect(Profil.poserReglageMateriel({}, 'plus_petit_disque', 1.25).plus_petit_disque).toBe(1.25);
    expect(Profil.poserReglageMateriel({}, 'plus_petit_disque', 3.3)).toEqual({});
    expect(Profil.poserReglageMateriel({}, 'cle_inconnue', 'oui')).toEqual({});
  });
  test('deux lignes, dans l’ordre', () => {
    expect(Profil.lignesMateriel({}).map((l) => l.cle)).toEqual(['plus_petit_disque', 'barre_traction']);
  });
  test('les lecteurs : absent ou nul = inconnu', () => {
    expect(Profil.plusPetitDisqueDe({ ma_salle: { plus_petit_disque: 1.25 } })).toBe(1.25);
    expect(Profil.plusPetitDisqueDe({ ma_salle: { plus_petit_disque: null } })).toBeNull();
    expect(Profil.plusPetitDisqueDe({})).toBeNull();
    expect(Profil.barreTractionDe({ ma_salle: { barre_traction: false } })).toBe(false);
    expect(Profil.barreTractionDe({ ma_salle: {} })).toBeNull();
    expect(Profil.sansBarreDeTraction({ ma_salle: { barre_traction: false } })).toBe(true);
    expect(Profil.sansBarreDeTraction({ ma_salle: { barre_traction: true } })).toBe(false);
    expect(Profil.sansBarreDeTraction({})).toBe(false);
  });
});

// ── 3. la barre de traction ────────────────────────────────────────────────────────────────────────────────────────────
describe('190 — ce qui demande une barre de traction', () => {
  const demande = Profil.demandeUneBarreDeTraction;
  test.each(['tractions', 'tractions_supination', 'traction_lestee', 'releve_de_genoux_suspendu', 'releve_de_jambes_suspendu',
    'rowing_inverse', 'muscle_up', 'toes_to_bar', 'front_lever'])('%s demande une barre', (slug) => { expect(demande(slug, {})).toBe(true); });
  test.each(['developpe_couche_barre', 'crunch', 'squat_barre', 'curl_biceps_barre', 'rowing_barre', 'releve_de_jambes_au_sol'])(
    '%s n’en demande pas', (slug) => { expect(demande(slug, {})).toBe(false); });
  test('les tractions assistées sur machine n’ont pas besoin d’une barre', () => {
    expect(demande('tractions_assistees', { equipement: 'machine' })).toBe(false);
  });
  test('estHorsDeMaSalle : sans barre, l’exercice sort ; avec ou inconnue, il reste', () => {
    expect(Profil.estHorsDeMaSalle('tractions', { equipement: 'aucun' }, null, true)).toBe(true);
    expect(Profil.estHorsDeMaSalle('tractions', { equipement: 'aucun' }, null, false)).toBe(false);
    expect(Profil.estHorsDeMaSalle('tractions', { equipement: 'aucun' }, null, undefined)).toBe(false);
    expect(Profil.estHorsDeMaSalle('crunch', { equipement: 'aucun' }, null, true)).toBe(false);
  });
  test('le générateur lit cette définition, il n’en tient pas une autre', () => {
    ['tractions', 'releve_de_genoux_suspendu', 'rowing_inverse', 'crunch', 'squat_barre'].forEach((s) =>
      expect(G.demandeUneBarreFixe(s, { equipement: 'aucun' })).toBe(demande(s, { equipement: 'aucun' })));
  });
});

describe('190 — le générateur et barre_traction', () => {
  const cat = catalogue();
  const slugs = (rs) => rs.reduce((t, r) => t.concat(r.exercices.map((x) => x.exercise_slug)), []);
  const BARRE = (s) => Profil.demandeUneBarreDeTraction(s, cat[s]);
  const programme = (materiel, barre) => {
    const e = { jours: 4, objectif: 'muscle', materiel, niveau: 'avance' };
    if (barre !== 'absent') e.barre_traction = barre;
    return slugs(G.generer(cat, e));
  };

  test.each(['salle_complete', 'maison_equipee', 'maison_minimal'])('%s, barre_traction false : aucun exercice à barre', (m) => {
    expect(programme(m, false).filter(BARRE)).toEqual([]);
  });
  test('salle complète, barre_traction false : le programme reste plein', () => {
    expect(programme('salle_complete', false).length).toBeGreaterThanOrEqual(programme('salle_complete', 'absent').length - 2);
  });
  test('salle complète, absent ou true : comme avant (des tractions)', () => {
    expect(programme('salle_complete', 'absent').filter(BARRE).length).toBeGreaterThan(0);
    expect(programme('salle_complete', true)).toEqual(programme('salle_complete', 'absent'));
  });
  test('maison minimale, absent : ni tractions ni relevé suspendu (G-maison-suspendu) ; true : permis', () => {
    expect(programme('maison_minimal', 'absent').filter(BARRE)).toEqual([]);
    expect(programme('maison_minimal', true).filter(BARRE).length).toBeGreaterThan(0);
  });
  test('maison équipée, true : une barre de traction est permise', () => {
    expect(programme('maison_equipee', true).filter(BARRE).length).toBeGreaterThan(0);
  });
  test('barre_traction null = inconnu = absent', () => {
    expect(programme('maison_minimal', null)).toEqual(programme('maison_minimal', 'absent'));
  });
  test('LE CATALOGUE : tout slug de suspension du catalogue est vu comme demandant une barre', () => {
    const suspendus = Object.keys(cat).filter((s) => /suspendu|traction/.test(s) && cat[s].equipement !== 'machine');
    expect(suspendus.length).toBeGreaterThan(0);
    suspendus.forEach((s) => expect(BARRE(s)).toBe(true));
  });
});
