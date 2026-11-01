// 193-4 (MOTEUR §9.32) — la semaine de test : la montée, les essais, la série au max, le max mesuré, l'arrêt, le calendrier.
process.env.TZ = 'Europe/Paris';
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const [SQ, DC, SDT, DM] = Modele.BARRES;

const BARRE = { cran: 2.5 };

describe('193-4 — la montée', () => {
  test('50/60/70/80/87 % du max estimé, 5/3/2/1/1 reps, au cran (maquette : 154 kg)', () => {
    const m = M.testMontee(154, BARRE);
    expect(m.map((x) => x.charge)).toEqual([77.5, 92.5, 107.5, 122.5, 135]);
    expect(m.map((x) => x.reps)).toEqual([5, 3, 2, 1, 1]);
  });
  test('sans max : rien', () => { expect(M.testMontee(null, BARRE)).toEqual([]); expect(M.testMontee(0, BARRE)).toEqual([]); });
  test('à la salle : la charge existante la plus proche', () => {
    const salle = { materiel: 'barre', charges: [20, 40, 60, 80, 100, 120, 140] };
    const m = M.testMontee(150, { salle: salle });
    m.forEach((x) => expect(salle.charges).toContain(x.charge));
  });
});

describe('193-4 — les essais', () => {
  const o = { famille: DC, cran: 2.5 };
  test('1ᵉʳ essai à 92 % en gardant 2, sur les sécurités au couché', () => {
    const a = M.testEssai(154, [], o);
    expect(a).toMatchObject({ etat: 'propose', rang: 1, charge: 142.5, reps: 1, reserve: 2, surLesSecurites: true });
    expect(a.repos).toBe(240);
  });
  test('2ᵉ essai à 97 %', () => {
    expect(M.testEssai(154, [{ charge: 142.5, reps: 1, reserve: 2 }], o)).toMatchObject({ etat: 'propose', rang: 2, charge: 150 });
  });
  test('3ᵉ réglé sur le 2ᵉ : facile → ≈ 101 % ; sans marge → un cran de plus ; raté → arrêt', () => {
    const base = [{ charge: 142.5, reps: 1, reserve: 2 }];
    expect(M.testEssai(154, base.concat([{ charge: 150, reps: 1, reserve: 2 }]), o)).toMatchObject({ etat: 'propose', rang: 3, charge: 155 });
    expect(M.testEssai(154, base.concat([{ charge: 150, reps: 1, reserve: 0 }]), o)).toMatchObject({ rang: 3, charge: 152.5 });
    expect(M.testEssai(154, base.concat([{ charge: 150, reps: 1, reserve: null }]), o)).toMatchObject({ rang: 3, charge: 152.5 });
    expect(M.testEssai(154, base.concat([{ charge: 150, reps: 0 }]), o)).toMatchObject({ etat: 'arret', raison: 'rate' });
  });
  test('jamais de 4ᵉ essai', () => {
    const f = [{ charge: 142.5, reps: 1, reserve: 2 }, { charge: 150, reps: 1, reserve: 1 }, { charge: 155, reps: 1, reserve: 0 }];
    expect(M.testEssai(154, f, o).etat).toBe('fini');
  });
  test('arrêts : « J’ai mal », 1ᵉʳ essai sans marge, technique', () => {
    expect(M.testEssai(154, [{ charge: 142.5, reps: 1, reserve: 2, douleur: true }], o)).toMatchObject({ etat: 'arret', raison: 'mal' });
    expect(M.testEssai(154, [{ charge: 142.5, reps: 1, reserve: 0 }], o)).toMatchObject({ etat: 'arret', raison: 'sans_marge' });
    expect(M.testEssai(154, [], Object.assign({ arret: true }, o))).toMatchObject({ etat: 'arret', raison: 'technique' });
  });
  test('le soulevé et le militaire ne demandent pas les sécurités', () => {
    expect(M.testEssai(200, [], { famille: SDT, cran: 2.5 }).surLesSecurites).toBe(false);
  });
});

describe('193-4 — la série au max', () => {
  test('≈ 85 % visée 5 ; soulevé en gardant 1, 6 reps au plus ; débutant ≈ 80 % visée 6 à 8', () => {
    expect(M.testSerieAuMax(154, { famille: DC, cran: 2.5 })).toMatchObject({ charge: 130, vise: 5, reserve: 0, plafond: 10, surLesSecurites: true });
    expect(M.testSerieAuMax(200, { famille: SDT, cran: 2.5 })).toMatchObject({ reserve: 1, plafond: 6, surLesSecurites: false });
    expect(M.testSerieAuMax(154, { famille: DC, cran: 2.5, debutant: true })).toMatchObject({ charge: 122.5, visee: [6, 8] });
  });
});

describe('193-4 — le max mesuré', () => {
  test('un essai réussi à RPE 10 EST le max', () => {
    const r = M.testMesure({ mode: 'max', essais: [{ charge: 142.5, reps: 1, reserve: 2 }, { charge: 150, reps: 1, reserve: 1 }, { charge: 157.5, reps: 1, reserve: 0 }] });
    expect(r).toMatchObject({ valeur: 157.5, source: 'essai', vrai: true, rang: 3 });
  });
  test('un essai lu à sa réserve n’est pas un vrai max', () => {
    const r = M.testMesure({ mode: 'max', essais: [{ charge: 142.5, reps: 1, reserve: 2 }] });
    expect(r.vrai).toBe(false);
    expect(r.valeur).toBeGreaterThan(142.5);
  });
  test('la série au max se lit sur ses reps (table 193-5) : 130 kg × 7 ≈ 160 kg (table)', () => {
    const r = M.testMesure({ mode: 'serie', serie: { charge: 130, reps: 7, reserve: 0 } });
    expect(r.valeur).toBeGreaterThan(158); expect(r.valeur).toBeLessThan(162);
    expect(r.source).toBe('serie');
  });
  test('rien de fait, rien de mesuré', () => {
    expect(M.testMesure({ mode: 'max', essais: [{ charge: 150, reps: 0 }] })).toBeNull();
    expect(M.testMesure({ mode: 'serie', serie: null })).toBeNull();
  });
  test('le mesuré prime 90 jours', () => {
    const mes = [{ valeur: 157.5, date: '2026-10-01T10:00:00Z' }];
    expect(M.testMesureValable(mes, '2026-12-01T10:00:00Z')).not.toBeNull();
    expect(M.testMesureValable(mes, '2027-01-15T10:00:00Z')).toBeNull();
    expect(M.testMesureValable(mes, '2026-09-01T10:00:00Z')).toBeNull();
  });
});

describe('193-4 — le jour de chaque barre', () => {
  const b = (slug, classe) => ({ slug, classe });
  test('un seul mouvement par jour, le premier non fait', () => {
    const barres = [b('a', 'couche'), b('c', 'militaire')];
    expect(M.testBarreDuJour(barres, {}, {})).toBe('a');
    expect(M.testBarreDuJour(barres, { a: true }, {})).toBe('c');
    expect(M.testBarreDuJour(barres, {}, { a: true })).toBe('c');
    expect(M.testBarreDuJour(barres, { a: true, c: true }, {})).toBeNull();
  });
  test('squat et soulevé jamais le même jour : le second reste normal', () => {
    const barres = [b('sq', 'squat'), b('sdt', 'souleve'), b('dc', 'couche')];
    expect(M.testBarresEnConflit(barres, 'sq')).toEqual(['sdt']);
    expect(M.testBarresEnConflit(barres, 'dc')).toEqual([]);
  });
});

describe('193-4 — la proposition', () => {
  test('programme : 2 phases + la semaine allégée terminée ; un maillon manquant : rien', () => {
    expect(M.testProposable({ programme: true, phasesFaites: 2, allegeeTerminee: true })).toMatchObject({ propose: true, voie: 'programme' });
    expect(M.testProposable({ programme: true, phasesFaites: 2, allegeeTerminee: false }).propose).toBe(false);
    expect(M.testProposable({ programme: true, phasesFaites: 1, allegeeTerminee: true }).propose).toBe(false);
    expect(M.testProposable({ programme: true, phasesFaites: 3, allegeeTerminee: true }).propose).toBe(false);
    expect(M.testProposable({ programme: true, phasesFaites: 2, allegeeTerminee: true, maillonManquant: true }).propose).toBe(false);
  });
  test('hors programme : 4 semaines, allégée avant (sinon on propose d’alléger), pas avant une décharge', () => {
    expect(M.testProposable({ semainesEntrainement: 3, semainePrecedenteAllegee: true }).propose).toBe(false);
    expect(M.testProposable({ semainesEntrainement: 5, semainePrecedenteAllegee: true })).toMatchObject({ propose: true, voie: 'bibliotheque' });
    expect(M.testProposable({ semainesEntrainement: 5, semainePrecedenteAllegee: false })).toMatchObject({ propose: true, voie: 'alleger' });
    expect(M.testProposable({ semainesEntrainement: 5, semainePrecedenteAllegee: true, dechargeDansJours: 10 }).propose).toBe(false);
    expect(M.testProposable({ semainesEntrainement: 5, semainePrecedenteAllegee: true, deja: true }).propose).toBe(false);
  });
  test('202 — le défaut : « Viser mon max » sauf débutant, 65 ans et plus, ou max tiré de plus de 5 reps', () => {
    const d = (f) => M.testModeParDefaut(f);
    expect(d({})).toBe('max'); expect(d(undefined)).toBe('max'); expect(d({ debutant: false, plus65: false, repsDuMax: 3 })).toBe('max');
    expect(d({ debutant: true })).toBe('serie');
    expect(d({ plus65: true })).toBe('serie');
    expect(d({ repsDuMax: 6 })).toBe('serie');
    expect(d({ repsDuMax: 5 })).toBe('max');                 // 5 reps : le calcul est fiable
    expect([d({ repsDuMax: null }), d({ plus65: null }), d({ repsDuMax: undefined })]).toEqual(['max', 'max', 'max']);  // un fait inconnu ne compte pas
  });
  test('202 — la raison du défaut est dite par le coach, avec sa source', () => {
    const r = M.testPhraseDuDefaut({ repsDuMax: 8, max: 160, chargeDuMax: 130 });
    expect(r.raison).toBe('reps');
    expect(r.texte.replace(/[\u00a0\u202f]/g, ' ')).toMatch(/^Ton max estimé, 160 kg, vient de 130 kg × 8\. Au-delà de 5 reps, ce calcul est moins fiable : le coach propose une série au max plutôt qu’une tentative\.$/);
    expect(r.sources.map((s) => [s.type, s.auteur, s.annee])).toEqual([['etude', 'Reynolds', 2006]]);
    const a = M.testPhraseDuDefaut({ plus65: true });
    expect(a.texte).toBe('À partir de 65 ans, le coach propose une série au max. Tu peux viser ton max si tu le connais.');
    expect(a.sources.map((s) => s.type)).toEqual(['convention']);
    expect(M.testPhraseDuDefaut({ debutant: true }).sources).toEqual([]);
    expect(M.testPhraseDuDefaut({ repsDuMax: 5 })).toBe(null);
    expect(M.testPhraseDuDefaut({})).toBe(null);
  });
});
