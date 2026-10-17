/** @jest-environment node */
//
// 98 — LES BILANS DE SAISON ET DE MOIS (BILANS-V1, décisions du 14-15/10/2026, maquette `maquette-saison-mois-v1.html`).
// Le même moteur que l'année (`bilans.js`), le même lecteur (`annee.js`) ; seule la fenêtre change. Des fixtures
// SYNTHÉTIQUES : chaque saison et chaque phase, un mois de moins de 3 semaines, le passage de décembre à l'hiver de
// l'année suivante (l'hiver 2026 = déc. 2026 → févr. 2027), la reprise du contenu de l'ancien bilan du mois.

process.env.TZ = 'Europe/Paris';

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Profil = require('../../v2/js/profil.js');
const Bilans = require('../../v2/js/bilans.js');
const Annee = require('../../v2/js/annee.js');

const CAT = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'souleve_de_terre_barre', nom: 'Soulevé de Terre (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['ischio_jambiers'], muscles_secondaires: [] },
  { slug: 'developpe_couche_halteres', nom: 'Développé Couché (Haltère)', equipement: 'haltere', mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];
let n = 0;
function seance(jour, series) {
  const id = 's' + (++n);
  return { id, jour, titre: 'Haut', series: series.map((x, i) => ({ id: id + '-' + i, session_id: id, exercise_slug: x[0],
    charge_kg: x[1], reps: x[2], type_serie: 'travail', rang: i + 1 })) };
}
// Une séance par semaine (le jeudi, ou le jour donné) de `de` à `a`.
function semaines(de, a, fn) {
  const out = [];
  let k = 0;
  for (let d = new Date(de + 'T12:00:00Z'); d <= new Date(a + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(seance(d.toISOString().slice(0, 10), fn(k++)));
  }
  return out;
}
const bilan = (periode, seances, aujourdhui, autres) => Bilans.bilanDeLaPeriode(Object.assign({ periode,
  aujourdhui: aujourdhui || periode.fin, seances, exercices: CAT, pesees: [], paris: [], salle: { jours: 0, minutes: 0 } }, autres || {}));

describe('98 — les saisons météorologiques', () => {
  test('chaque saison, ses bornes et la saison d’avant', () => {
    const p = (c) => { const x = Bilans.periodeDeLaSaison(c); return [x.debut, x.fin, x.precedente.cle, x.precedente.debut, x.precedente.fin]; };
    expect(p('2026-printemps')).toEqual(['2026-03-01', '2026-05-31', '2025-hiver', '2025-12-01', '2026-02-28']);
    expect(p('2026-ete')).toEqual(['2026-06-01', '2026-08-31', '2026-printemps', '2026-03-01', '2026-05-31']);
    expect(p('2026-automne')).toEqual(['2026-09-01', '2026-11-30', '2026-ete', '2026-06-01', '2026-08-31']);
    // L'hiver 2026 = décembre 2026 → février 2027 ; l'hiver 2027 finit un 29 février.
    expect(p('2026-hiver')).toEqual(['2026-12-01', '2027-02-28', '2026-automne', '2026-09-01', '2026-11-30']);
    expect(Bilans.periodeDeLaSaison('2027-hiver').fin).toBe('2028-02-29');
    expect(Bilans.periodeDeLaSaison('2026-ete').precedente.libelle).toBe('le printemps');
    expect(Bilans.periodeDeLaSaison('2026-11')).toBeNull();
  });
  test('la saison d’un jour : décembre ouvre l’hiver, janvier et février sont l’hiver de l’année d’avant', () => {
    expect(Bilans.saisonDuJour('2026-11-30')).toBe('2026-automne');
    expect(Bilans.saisonDuJour('2026-12-01')).toBe('2026-hiver');
    expect(Bilans.saisonDuJour('2027-01-15')).toBe('2026-hiver');
    expect(Bilans.saisonDuJour('2027-02-28')).toBe('2026-hiver');
    expect(Bilans.saisonDuJour('2027-03-01')).toBe('2027-printemps');
    expect(Bilans.saisonDuJour('2027-06-01')).toBe('2027-ete');
  });
  test('DISCRIMINANT — le nom suit la phase ; l’hiver est « Winter Arc » pour tout le monde', () => {
    const t = {};
    ['hiver', 'printemps', 'ete', 'automne'].forEach((s) => {
      t[s] = ['prise_de_masse', 'seche', 'maintien'].map((ph) => Bilans.nomDeSaison(s, ph));
    });
    expect(t).toEqual({
      hiver: ['Winter Arc', 'Winter Arc', 'Winter Arc'],
      printemps: ['Spring Bulk', 'Summer Prep', 'Spring Arc'],
      ete: ['Summer Bulk', 'Summer Shred', 'Summer Arc'],
      automne: ['Bulk Season', 'Fall Cut', 'Fall Arc']
    });
  });
  test('la phase au début de la saison : vide = maintien ; commencée après le début = le défaut', () => {
    const debut = '2026-09-01';
    expect(Bilans.nomDeSaison('automne', Profil.phaseAuJour({ phase: null }, debut))).toBe('Fall Arc');
    expect(Bilans.nomDeSaison('automne', Profil.phaseAuJour({ phase: 'maintien', phase_depuis: '2026-05-01T08:00:00Z' }, debut))).toBe('Fall Arc');
    expect(Bilans.nomDeSaison('automne', Profil.phaseAuJour({ phase: 'prise_de_masse', phase_depuis: '2026-08-20T08:00:00Z' }, debut))).toBe('Bulk Season');
    expect(Bilans.nomDeSaison('automne', Profil.phaseAuJour({ phase: 'seche' }, debut))).toBe('Fall Cut');
    expect(Bilans.nomDeSaison('automne', Profil.phaseAuJour({ phase: 'seche', phase_depuis: '2026-10-02T08:00:00Z' }, debut))).toBe('Fall Arc');
  });
});

describe('98 — la saison : comparaison, semaines, records', () => {
  const ETE = semaines('2026-06-04', '2026-08-27', () => [['squat_barre', 120, 5], ['squat_barre', 95, 8], ['developpe_couche_barre', 100, 5],
    ['souleve_de_terre_barre', 160, 3]]);
  const AUTOMNE = semaines('2026-09-03', '2026-11-26', (k) => [['squat_barre', k === 6 ? 145 : 125, 5],
    ['developpe_couche_barre', 100, 5], ['souleve_de_terre_barre', 170, 3], ['squat_barre', 100, k === 6 ? 20 : 8]]);
  const p = Bilans.periodeDeLaSaison('2026-automne');
  const b = bilan(p, ETE.concat(AUTOMNE));
  test('contre l’été, et les tonnes seules comparées', () => {
    expect(b.versus.mode).toBe('precedente');
    expect(b.versus.libelle).toBe('l’été');
    const kg = (l) => Bilan.volumeKg([].concat(...l.map((s) => s.series)));
    expect(b.tonnes.kg).toBe(kg(AUTOMNE));
    expect(b.tonnes.avant).toBe(kg(ETE));
    expect(b.tonnes.ecart).toBe(kg(AUTOMNE) - kg(ETE));
  });
  test('semaine par semaine : des lundis, la plus lourde', () => {
    expect(b.semaines.liste[0].lundi).toBe('2026-08-31');
    expect(b.semaines.liste.every((x) => new Date(x.lundi + 'T12:00:00Z').getUTCDay() === 1)).toBe(true);
    expect(b.semaines.plusLourde.lundi).toBe('2026-10-12');
  });
  test('les records : les nouvelles charges max seulement (le couché égale l’été : pas de record)', () => {
    expect(b.records.map((r) => [r.slug, r.charge, r.avant])).toEqual([
      ['souleve_de_terre_barre', 170, 160], ['squat_barre', 145, 120]]);
  });
  test('les écrans de la saison, dans l’ordre de la maquette ; « À la salle » juste après les tonnes', () => {
    const bs = bilan(p, ETE.concat(AUTOMNE), null, { salle: { jours: 13, minutes: 13 * 75 }, paris: [{ jour: '2026-10-01', predite: 5, observee: 5 }] });
    const e = Annee.ecrans({ bilan: bs, qui: 'aurel_br', nom: 'Fall Arc', jeu: null });
    expect(e.map((x) => x.cle)).toEqual(['tonnes', 'salle', 'semaines', 'exercice', 'records', 'avance', 'coach', 'plaque']);
    expect(e[0].titre).toBe('Fall Arc');
    expect(e[0].lab).toBe('septembre → novembre 2026');
    expect(e[0].note).toMatch(/^\+[\d,]+\st sur l’été$/);
    expect(JSON.stringify(e[0].txt)).toMatch(/soulevées cet automne/);
    // À la salle : un fait, jamais comparé.
    expect(JSON.stringify(e[1])).not.toMatch(/[+−→]|l’été|comme|qu’/);
    const plaque = e[e.length - 1].plaque;
    expect(plaque.an).toBe('Fall Arc 2026');
    expect(JSON.stringify(plaque)).not.toMatch(/pari|coach/i);
    expect(Annee.titreDe({ bilan: bs, nom: 'Fall Arc' })).toBe('Fall Arc 2026');
  });
  test('le passage de décembre à l’hiver de l’année suivante : déc. 2026 et févr. 2027 dans « l’hiver 2026 »', () => {
    const h = Bilans.periodeDeLaSaison('2026-hiver');
    const s = AUTOMNE.concat(semaines('2026-12-03', '2027-02-25', () => [['squat_barre', 150, 3]]));
    const bh = bilan(h, s, '2027-03-02');
    expect(bh.versus.mode).toBe('precedente');
    expect(bh.versus.libelle).toBe('l’automne');
    expect(bh.tonnes.kg).toBe(13 * 450);
    expect(bh.records.map((r) => r.charge)).toEqual([150]);
    const e = Annee.ecrans({ bilan: bh, qui: '', nom: Bilans.nomDeSaison('hiver', 'prise_de_masse'), jeu: null });
    expect(e[0].lab).toBe('décembre 2026 → février 2027');
    expect(e[e.length - 1].plaque.an).toBe('Winter Arc 2026');
  });
});

describe('98 — le mois', () => {
  const SEPT = semaines('2026-09-03', '2026-09-24', () => [['squat_barre', 120, 5], ['developpe_couche_barre', 100, 5]]);
  test('DISCRIMINANT — moins de 3 semaines de données : les faits seuls, aucune comparaison', () => {
    const p = Bilans.periodeDuMois('2026-10');
    const deux = [seance('2026-10-01', [['squat_barre', 130, 5]]), seance('2026-10-08', [['squat_barre', 130, 5]])];
    const b = bilan(p, SEPT.concat(deux));
    expect(b.versus.mode).toBe('aucune');
    expect(b.versus.semainesDeDonnees).toBe(2);
    expect(b.tonnes.ecart).toBeNull();
    expect(b.avance).toBeNull();
    const e = Annee.ecrans({ bilan: b, qui: '', jeu: null, records: [], paris: null });
    expect(e[0].note).toBeNull();
    expect(JSON.stringify(e)).not.toMatch(/sur septembre|qu’en septembre|comme en septembre/);
  });
  test('3 semaines de données : contre le mois d’avant', () => {
    const p = Bilans.periodeDuMois('2026-10');
    const trois = semaines('2026-10-01', '2026-10-15', () => [['squat_barre', 130, 5], ['developpe_couche_barre', 100, 5]]);
    const b = bilan(p, SEPT.concat(trois));
    expect(b.versus.mode).toBe('precedente');
    expect(b.versus.libelle).toBe('septembre');
    const e = Annee.ecrans({ bilan: b, qui: '', jeu: null, records: [], paris: null });
    expect(e[0].note).toMatch(/^[+−][\d,]+\st sur septembre$/);
  });
  test('janvier se compare à décembre de l’année d’avant', () => {
    const p = Bilans.periodeDuMois('2027-01');
    expect([p.precedente.debut, p.precedente.fin, p.precedente.libelle]).toEqual(['2026-12-01', '2026-12-31', 'décembre']);
  });
});

describe('98 — DISCRIMINANT : la story du mois reprend tout l’ancien bilan du mois', () => {
  const p = Bilans.periodeDuMois('2026-10');
  const s = semaines('2026-09-03', '2026-09-24', () => [['squat_barre', 120, 5]])
    .concat(semaines('2026-10-01', '2026-10-29', (k) => [['squat_barre', 125 + k, 5], ['developpe_couche_barre', 100, 5],
      ['developpe_couche_halteres', 40, 8]]));
  const b = bilan(p, s, '2026-10-31', { salle: { jours: 5, minutes: 300 },
    paris: [{ jour: '2026-10-01', predite: 5, observee: 5 }, { jour: '2026-10-08', predite: 5, observee: 4 },
            { jour: '2026-09-20', predite: 5, observee: 5 }] });
  const RECORDS = [1, 2, 3, 4, 5].map((k) => ({ nom: 'Squat (Barre)', mesure: (125 + k) + ' kg × 5', seanceId: 's' + k, debut: '2026-10-0' + k }));
  // 124 (audit du 16/10/2026, 04 #7, #14) — la phrase de la story dit les chiffres de l'écran (`bilan.coach`), tels quels.
  const phrase = Bilan.phraseParis(b.coach.faits, b.coach.tenus, { telsQuels: true });
  const e = Annee.ecrans({ bilan: b, qui: 'aurel_br', jeu: null, records: RECORDS, paris: { phrase } });
  const de = (cle) => e.filter((x) => x.cle === cle)[0];
  test('les écrans, dans l’ordre', () => {
    expect(e.map((x) => x.cle)).toEqual(['tonnes', 'salle', 'semaines', 'muscle', 'exercice', 'records', 'coach', 'plaque']);
  });
  test('le volume (tonnes), le temps (À la salle), les séries de travail (sous le muscle du mois)', () => {
    expect(de('tonnes').chiffre.v).toBe(Math.round(b.tonnes.kg / 100) / 10);
    expect(de('salle').chiffre.v).toBe(5);
    expect(JSON.stringify(de('muscle').txt)).toContain(b.reps.series + ' séries de travail');
  });
  test('les records du mois : les trois premiers, « et 2 autres », et tous au toucher', () => {
    const r = de('records');
    expect(r.lab).toBe('Tes records d’octobre');
    expect(r.lignes.map((l) => l.v)).toEqual(['126 kg × 5', '127 kg × 5', '128 kg × 5']);
    expect(JSON.stringify(r.txt)).toContain('2 autres');
    expect(r.bouton).toEqual({ action: 'records', texte: 'Tous les records du mois' });
  });
  test('les paris du coach : vérifiés, tenus, et la phrase — les mêmes chiffres —, au toucher', () => {
    const c = de('coach');
    expect([c.chiffre.v, c.chiffre.unite]).toEqual([1, '/ 2']);
    expect(c.detail.lignes).toEqual([{ n: 'Paris vérifiés', v: '2' }, { n: 'Tenus', v: '1' }]);
    expect(c.detail.phrase).toBe(phrase);
    expect(phrase).toBe('Sur 2 paris vérifiés, le coach en a tenu 1.');
    expect(c.bouton.action).toBe('paris');
  });
  test('les exercices les plus faits : chacun ouvre sa page (son identifiant)', () => {
    const x = de('exercice');
    expect(x.slug).toBe(b.exercices[0].slug);
    expect(x.lignes.map((l) => l.slug)).toEqual(b.exercices.slice(1).map((y) => y.slug));
  });
  test('jamais le nombre de séances ; la plaque sans le coach', () => {
    expect(JSON.stringify(e)).not.toMatch(/\d+\s*séances?/);
    expect(JSON.stringify(de('plaque'))).not.toMatch(/pari|coach/i);
    expect(de('plaque').plaque.an).toBe('Octobre 2026');
    expect(de('plaque').plaque.cases[1]).toEqual({ k: 'Records', g: '5', p: 'squat' });
  });
});

// 119 (audit du 16/10/2026, F1/F3/F10) — Aurélien, 16/10 : « Pour l'exercice du mois, le tapis ne devrait pas
// apparaître. » Le tapis à chaque séance, le squat deux fois : avant, le tapis gagnait (« 0 reps »).
describe('119 — l’exercice du mois : en reps, classé par ses reps, « 1 rep » au singulier', () => {
  const CAT119 = CAT.concat([
    { slug: 'tapis_roulant', nom: 'Tapis de Course', equipement: 'machine', charge: 'aucune', mesure: 'distance_temps',
      muscles_primaires: [], muscles_secondaires: [] },
    { slug: 'planche', nom: 'Planche', equipement: null, charge: 'aucune', mesure: 'temps',
      muscles_primaires: ['abdominaux'], muscles_secondaires: [] }
  ]);
  const p = Bilans.periodeDuMois('2026-10');
  const s = semaines('2026-10-01', '2026-10-29', (k) => [['tapis_roulant', null, null], ['planche', null, null],
    k < 2 ? ['squat_barre', 100, 10] : ['developpe_couche_barre', 80, k === 4 ? 1 : 2]]);
  s.forEach((x) => { x.series[0].duree_s = 600; x.series[0].distance_m = 1000; x.series[1].duree_s = 60; });
  const b = Bilans.bilanDeLaPeriode({ periode: p, aujourdhui: '2026-10-31', seances: s, exercices: CAT119, pesees: [],
    paris: [], salle: { jours: 5, minutes: 300 } });
  const e = Annee.ecrans({ bilan: b, qui: '', jeu: null, records: [], paris: null });
  const ex = e.filter((x) => x.cle === 'exercice')[0];
  test('le squat (20 reps en 2 séances) devant le couché (5 reps en 3 séances) ; ni tapis ni planche', () => {
    expect(ex.titre).toBe('Squat (Barre)');
    expect(ex.chiffre).toMatchObject({ v: 20, unite: 'reps' });
    expect(ex.lignes.map((l) => l.v)).toEqual(['Développé Couché (Barre) · 5 reps']);
    expect(JSON.stringify(e)).not.toMatch(/Tapis|Planche|0 reps/);
  });
  test('F10 : un exercice à 1 rep se dit « 1 rep »', () => {
    const un = Bilans.bilanDeLaPeriode({ periode: p, aujourdhui: '2026-10-31', exercices: CAT119, pesees: [], paris: [],
      salle: { jours: 1, minutes: 60 }, seances: [seance('2026-10-02', [['squat_barre', 100, 1]])] });
    const x = Annee.ecrans({ bilan: un, qui: '', jeu: null, records: [], paris: null }).filter((y) => y.cle === 'exercice')[0];
    expect(x.chiffre).toMatchObject({ v: 1, unite: 'rep' });
  });
});

// 124 (audit du 16/10/2026, 04 #7, #14) — l'app compose la story et le bloc de Progression sur UN fil : les paris de la
// période (`bilan.coach`). Plus aucune lecture des paris du bilan du mois, et la phrase dit les chiffres tels quels.
describe('124 — les paris du mois : un fil (app.js)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/app.js'), 'utf8');
  test('ni `paris_verifies` ni `paris_tenus` dans l’app ; la phrase de la story lit `bilan.coach`, tels quels', () => {
    expect(src).not.toMatch(/paris_verifies|paris_tenus/);
    expect(src).toMatch(/var co = vue\.bilan && vue\.bilan\.coach;\s*vue\.paris = co \? \{ phrase: Bilan\.phraseParis\(co\.faits, co\.tenus, \{ telsQuels: true \}\) \}/);
    expect(src).toMatch(/bilanPeriode\(Bilans\.periodeDuMois\(mois\)\)\.coach/);
  });
});
