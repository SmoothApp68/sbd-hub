/** @jest-environment node */
//
// 49-U17 — l'escalier, la série de plus (MOTEUR §14.5, §14.6, §14.7, delta
// 49-34). Un exercice de zone muscle cale seul, hors sèche, et ses muscles
// primaires ont de la place : une série de plus, jusqu'au prochain progrès ;
// le niveau se lit sur les séries de la routine.
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u17-serie-de-plus.json` sort de
// `coach49.py` (Claude.ai, 01/10/2026) : 144 lignes de la table des marches,
// 4 niveaux, 4 cartes, 2 lignes ajoutées. Un cas qui semble faux se rapporte ;
// il ne se corrige pas ici.
//
// ⚠️ UN ÉCART DE LIBELLÉ, RAPPORTÉ : les cas nomment les muscles par la table
// du simulateur ; l'app, par le catalogue (`THSemaine.libelleMuscle`).
// `deltoide_lateral` : « tes deltoïdes restent » (cas) contre « ton deltoïde
// latéral reste » (catalogue, gardé). Les trois autres cartes sont identiques.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Sm = require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const F = require('./fixtures/cas-49u17-serie-de-plus.json');
const NB = ' ';
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));
const muscles = (cles) => cles.map((c) => ({ cle: c, libelle: Sm.libelleMuscle(c) }));

// ── 1. LES CAS DU SIMULATEUR ────────────────────────────────────────────────
describe('§14.5, §14.7 — les cas du simulateur', () => {
  test('le fichier : 144 marches, 4 niveaux, 4 cartes, 2 lignes', () => {
    expect([F.marche.length, F.niveau.length, F.carte.length, F.lignes.length]).toEqual([144, 4, 4, 2]);
  });

  test('la table des marches : les 144 lignes (n, zone, phase, place, série déjà proposée)', () => {
    const faux = F.marche.filter((m) =>
      M.marcheIsolee(m.n_isole, m.zone, m.phase, m.place, m.serie_deja_proposee) !== m.marche);
    expect(faux).toEqual([]);
  });

  F.niveau.forEach((c, i) => {
    test('niveau ' + (i + 1) + ' : sur les ' + c.n_routine + ' séries de la routine → ' + c.niveau, () => {
      const P = c.series[0].charge_kg;
      const vue = { palier: P, retenues: c.series, nRoutine: c.n_routine };
      expect(M.niveauValide(M.seriesAuPalier(vue))).toBe(c.niveau);
      // Sans la série de plus active, toutes les séries comptent (la chute de
      // fin de séance, §9.2 bis, s'applique comme toujours).
      expect(M.seriesAuPalier({ palier: P, retenues: c.series })).toHaveLength(c.series.length);
    });
  });

  F.carte.forEach((c, i) => {
    test('carte ' + (i + 1) + ' (' + c.muscles.join(', ') + ')', () => {
      const k = M.carteSerieDePlus({ palier: c.meilleur[0], niveau: c.meilleur[1] }, c.compteur,
        c.autres_avancent, muscles(c.muscles), null, 5);   // 5 séries de routine : 1/5 = 20 %, la valeur des cas du simulateur
      expect(octets(k.phrase)).toBe(octets(c.attendu.phrase));
      expect([k.oui, k.non, k.gris_apres]).toEqual([c.attendu.oui, c.attendu.non, c.attendu.gris_apres]);
      if (c.muscles[0] === 'deltoide_lateral') {
        // L'écart rapporté : le nom du catalogue, au singulier.
        expect(k.detail).toBe('Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. ' +
          'Ton deltoïde latéral reste sous son volume habituel.');
        expect(c.attendu.detail).toMatch(/Tes deltoïdes restent sous leur volume habituel\.$/);
      } else {
        expect(octets(k.detail)).toBe(octets(c.attendu.detail));
      }
    });
  });

  F.lignes.forEach((c, i) => {
    test('ligne ajoutée ' + (i + 1) + ' : après la routine, à la charge et à la visée de la ligne, jamais un test', () => {
      const k = { etat: 'progression', zone: 'volume', palier: c.consigne.ligne[0], niveau: c.consigne.ligne[1],
        n: c.n_routine, ligne: { charge: c.consigne.ligne[0], vise: c.consigne.ligne[1] },
        haut: c.consigne.haut ? { charge: c.consigne.haut[0], vise: c.consigne.haut[1], k: c.consigne.haut[2] } : null };
      const series = [1, 2, 3, 4].map((x) => ({ id: 's' + x, type_serie: 'travail' }));
      const cov = S.couvertureSeance(series, M.consigneSerieDePlus(k, c.n_routine), {});
      expect(cov.filter(Boolean)).toHaveLength(c.attendu.lignes);
      const derniere = cov[3];
      expect(derniere.ajoutee).toBe(true);
      expect(derniere.role).toBe('ligne');
      expect([derniere.charge_kg, derniere.reps]).toEqual(c.attendu.ligne_ajoutee);
      expect(derniere.rang).toBe(4);
      // Le test reste sur la routine : sa dernière ligne.
      if (c.consigne.haut) expect(cov[2].role).toBe('haut');
      expect(cov.slice(0, 3).some((x) => x.ajoutee)).toBe(false);
    });
  });
});

// ── 2. LE NIVEAU SUR LA ROUTINE, DANS LA CONSIGNE ET DANS LE COMPTEUR ───────
describe('§14.7 — le niveau se lit sur la routine, partout', () => {
  const s = (debut, reps, nRoutine) => Object.assign({ debut, palier: 27, neutre: false, decharge: false,
    series: reps.map((r) => ({ charge_kg: 27, reps: r, rpe: null, role: 'palier', origine: 'palier' })) },
    nRoutine ? { nRoutine } : {});
  const hist = (n) => [
    s('2026-09-01T10:00:00+00:00', [12, 12, 12]), s('2026-09-05T10:00:00+00:00', [12, 12, 12]),
    s('2026-09-09T10:00:00+00:00', [12, 12, 12, 9], n)];
  const AVANT = '2026-09-13T10:00:00+00:00';
  test('la consigne : la séance à 12, 12, 12 puis 9 compte 12 avec la série de plus, 10 sans', () => {
    const avec = M.consignePour(hist(3), AVANT, { reglage: 'normal' });
    const sans = M.consignePour(hist(null), AVANT, { reglage: 'normal' });
    expect(avec.niveau).toBe(12);
    expect(sans.niveau).toBe(10);
  });
  test('le compteur : le meilleur de la dernière séance se lit sur la routine', () => {
    const o = { reglage: 'normal', toutes: true };
    const avec = M.compteurDe(hist(3), AVANT, o);
    const sans = M.compteurDe(hist(null), AVANT, o);
    expect(avec.derniere.niveau).toBe(12);
    expect(sans.derniere.niveau).toBe(10);
  });
  test('les périodes : de la séance qui accepte jusqu\'à la séance qui ouvre après le progrès (exclue)', () => {
    const marches = [{ exercice: 'curl', marche: 'serie_de_plus', reponse: 'acceptee', jour: '2026-09-05',
      debut: '2026-09-05T10:00:00+00:00', compteur: 4, n: 3 }];
    const compteurs = [{ exercice: 'curl', jour: '2026-09-09', debut: '2026-09-09T10:00:00+00:00', compteur: 5 },
      { exercice: 'curl', jour: '2026-09-13', debut: '2026-09-13T10:00:00+00:00', compteur: 0 }];
    expect(M.periodesSerieDePlus(marches, compteurs)).toEqual(
      { curl: [{ debut: '2026-09-05T10:00:00+00:00', fin: '2026-09-13T10:00:00+00:00', n: 3 }] });
    expect(M.periodesSerieDePlus(marches, compteurs.slice(0, 1)).curl[0].fin).toBeNull();
    // Refusée : pas de période.
    expect(M.periodesSerieDePlus([Object.assign({}, marches[0], { reponse: 'refusee' })], compteurs)).toEqual({});
  });
});

// ── 3. LE PLAN ──────────────────────────────────────────────────────────────
const C = { etat: 'progression', zone: 'volume', palier: 27, niveau: 12, n: 3,
  ligne: { charge: 27, vise: 12 }, haut: { charge: 29, vise: 12, k: 1 }, fondement: {} };
const MEILLEUR = { palier: 27, niveau: 12 };
const PLACE = { pectoraux: { place: true, moyenne: 8, seuil: 10, fenetres: 12 } };
// 111 — un POLYARTICULAIRE (au moins 3 muscles) : la dégressive proposée (MOTEUR §14) ne vaut que pour une
// isolation ; ici l'escalier reste celui de §14.5 (le repli au 2e déclenchement). L'isolation :
// `v2-degressive-proposee.test.js`.
const CAT = { pecs: { equipement: 'machine', muscles_primaires: ['pectoraux'],
  muscles_secondaires: ['triceps', 'deltoide_anterieur'] } };
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: opt.seance || 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'pecs', id, { series: opt.series || 3 });
  if (opt.geste) se = opt.geste(se, id);
  const k = Object.assign({}, C, opt.consigne || {});
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 4 : opt.compteur, meilleur: MEILLEUR, blocages: [] },
    repli: opt.repli === undefined ? null : opt.repli };
  const e = { seance: { id: opt.seance || 'S1', debut: opt.debut || '2026-10-01T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { pecs: c }, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'maintien',
    catalogue: CAT, volume: opt.volume === undefined ? PLACE : opt.volume,
    escalier: { cartes: opt.cartes || [], compteurs: opt.compteurs || [], noms: {}, seriesRoutine: { pecs: 3 },
                marches: opt.marches || [] } };
  return { e, p: T.planDeSeance(e) };
}
const acceptee = (jour, compteur, seance) => ({ seance: seance || 'S0', jour, exercice: 'pecs', marche: 'serie_de_plus',
  reponse: 'acceptee', compteur: compteur || 4, debut: jour + 'T10:00:00+00:00', n: 3 });

describe('§14.7 — la série de plus, dans le plan', () => {
  test('1er déclenchement, zone muscle, de la place : la carte sous l\'exercice', () => {
    const { e, p } = decor();
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('serie_de_plus');
    expect(x.escalier.carte.phrase).toBe('27' + NB + 'kg × 12 reste ta meilleure charge de travail depuis 4 séances, et tes autres exercices avancent.');
    expect(x.escalier.carte.detail).toBe('Sur cet exercice, une série de plus aide souvent : environ 33 % de travail en plus. ' +
      'Tes pectoraux restent sous leur volume habituel.');
    expect([x.escalier.carte.oui, x.escalier.carte.non]).toEqual(['Ajouter une série', 'Non merci']);
    expect(x.entete.compteur).toBeNull();
    expect(T.lignesAAjouter(p)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('pas de place (ou pas de base) : le repli tout de suite, s\'il y en a un ; sinon le silence', () => {
    const r = { palier: 25, niveau: 12, debut: '2026-09-20T10:00:00+00:00', reps: [12, 12, 12], ligne: [25, 12] };
    const sansPlace = { pectoraux: { place: false, moyenne: 12, seuil: 10, fenetres: 12 } };
    expect(decor({ volume: sansPlace, repli: r }).p.exercices[0].escalier.marche).toBe('repli');
    expect(decor({ volume: { pectoraux: null }, repli: r }).p.exercices[0].escalier.marche).toBe('repli');
    const saute = decor({ volume: sansPlace }).p.exercices[0].escalier;
    expect([saute.marche, saute.saute]).toEqual(['silence', true]);
  });
  test('en sèche : jamais la série de plus (la phrase de la sèche)', () => {
    const x = decor({ phase: 'seche' }).p.exercices[0];
    expect(x.escalier.marche).toBe('seche_rien');
    expect(x.escalier.carte).toBeUndefined();
  });
  test('acceptée dans la séance : plus de carte ; la consigne porte la série de plus ; une ligne à créer', () => {
    const { e, p } = decor({ marches: [acceptee('2026-10-01', 4, 'S1')] });
    const x = p.exercices[0];
    expect(x.escalier.carte).toBeUndefined();
    expect(x.consigne.serieDePlus).toEqual({ routine: 3 });
    expect(x.entete.plus).toBe('une série de plus, jusqu\'à ton prochain progrès');
    expect(T.lignesAAjouter(p)).toEqual([0]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('la ligne ajoutée : après la routine, à la charge et à la visée de la ligne, jamais un test, au rang suivant', () => {
    const { e, p } = decor({ marches: [acceptee('2026-10-01', 4, 'S1')], geste: (se, id) => S.ajouterSerie(se, 0, id()) });
    const x = p.exercices[0];
    expect(x.lignes.map((l) => [l.role, l.charge, l.vise, !!l.ajoutee])).toEqual([
      ['ligne', 27, 12, false], ['ligne', 27, 12, false], ['test', 29, 12, false], ['ligne', 27, 12, true]]);
    expect(x.lignes[3].rang).toBe(4);
    expect(T.lignesAAjouter(p)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('la séance suivante (compteur 5) : la ligne revient', () => {
    const d = decor({ seance: 'S2', debut: '2026-10-04T10:00:00+00:00', compteur: 5, marches: [acceptee('2026-10-01')],
      compteurs: [{ exercice: 'pecs', jour: '2026-10-01', compteur: 4, seance: 'S0' }] });
    expect(d.p.exercices[0].consigne.serieDePlus).toEqual({ routine: 3 });
    expect(T.lignesAAjouter(d.p)).toEqual([0]);
  });
  test('après un progrès (compteur 0, ou un compteur plus bas vu entre-temps) : elle disparaît', () => {
    expect(decor({ seance: 'S3', debut: '2026-10-07T10:00:00+00:00', compteur: 0, marches: [acceptee('2026-10-01')] })
      .p.exercices[0].consigne.serieDePlus).toBeUndefined();
    const remonte = decor({ seance: 'S9', debut: '2026-10-20T10:00:00+00:00', compteur: 5, marches: [acceptee('2026-10-01')],
      compteurs: [{ exercice: 'pecs', jour: '2026-10-07', compteur: 0, seance: 'S3' }] });
    expect(remonte.p.exercices[0].consigne.serieDePlus).toBeUndefined();
  });
  test('refusée, puis le déclenchement suivant (8) : le repli', () => {
    const r = { palier: 25, niveau: 12, debut: '2026-09-20T10:00:00+00:00', reps: [12, 12, 12], ligne: [25, 12] };
    const refus = Object.assign(acceptee('2026-10-01'), { reponse: 'refusee' });
    const x = decor({ compteur: 8, debut: '2026-10-15T10:00:00+00:00', marches: [refus], repli: r }).p.exercices[0];
    expect(x.escalier.marche).toBe('repli');
    expect(x.consigne.serieDePlus).toBeUndefined();
    // Sans série de plus proposée : le silence (le repli a déjà eu son tour).
    expect(decor({ compteur: 8, repli: r }).p.exercices[0].escalier.marche).toBe('silence');
  });
  test('acceptée, puis le déclenchement suivant sans progrès : le repli, et la ligne en plus à sa charge', () => {
    const r = { palier: 25, niveau: 12, debut: '2026-09-20T10:00:00+00:00', reps: [12, 12, 12], ligne: [25, 12] };
    const { e, p } = decor({ compteur: 8, debut: '2026-10-15T10:00:00+00:00', marches: [acceptee('2026-10-01')], repli: r,
      geste: (se, id) => S.ajouterSerie(se, 0, id()) });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('repli');
    expect(x.lignes.map((l) => [l.role, l.charge, !!l.ajoutee])).toEqual([
      ['ligne', 25, false], ['ligne', 25, false], ['ligne', 25, false], ['ligne', 25, true]]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('jamais en zone force, ni en sèche, ni pendant une semaine allégée, même acceptée', () => {
    expect(decor({ consigne: { zone: 'lourd' }, marches: [acceptee('2026-10-01', 4, 'S1')] }).p.exercices[0].consigne.serieDePlus).toBeUndefined();
    expect(decor({ phase: 'seche', marches: [acceptee('2026-10-01', 4, 'S1')] }).p.exercices[0].consigne.serieDePlus).toBeUndefined();
    const allegee = { seance: 'S0', jour: '2026-09-30', declencheur: 'x', compteur: 4, reponse: 'acceptee',
      debut: '2026-09-30', fin: '2026-10-06', cites: ['x'] };
    expect(decor({ cartes: [allegee], marches: [acceptee('2026-10-01', 4, 'S1')] }).p.exercices[0].consigne.serieDePlus).toBeUndefined();
  });
});

describe('audit du 16/10/2026, 01 #6 — une consigne sans zone (règle de bord) ne reçoit pas la carte de série de plus', () => {
  test('la marche : sans zone, pas de série de plus, même avec de la place', () => {
    expect(M.marcheIsolee(1, null, 'maintien', true, false, 140, {})).toBe('repli');
    expect(M.marcheIsolee(1, 'muscle', 'maintien', true, false, 140, {})).toBe('serie_de_plus');
  });
  test('⚠️ DISCRIMINANT — dans le plan : aucune carte « Une série de plus », le silence (repli sauté), I23 sans erreur', () => {
    const { e, p } = decor({ consigne: { zone: null } });
    const x = p.exercices[0];
    expect(x.escalier && x.escalier.marche).not.toBe('serie_de_plus');
    expect(x.escalier && x.escalier.carte).toBeFalsy();
    expect(T.verifierPlan(p, e).erreurs.filter((y) => /^I23/.test(y))).toEqual([]);
  });
});

describe('§14.7 — I23, I24 : des violations forgées sont vues', () => {
  const base = () => JSON.parse(JSON.stringify(decor({ marches: [acceptee('2026-10-01', 4, 'S1')],
    geste: (se, id) => S.ajouterSerie(se, 0, id()) }).p));
  test('I23 — une série de plus en sèche, en zone force, sans place', () => {
    const seche = base(); seche.phase = 'seche';
    expect(T.verifierPlan(seche).erreurs.some((x) => /^I23 .*en sèche/.test(x))).toBe(true);
    const force = base(); force.exercices[0].consigne.zone = 'lourd';
    expect(T.verifierPlan(force).erreurs.some((x) => /^I23 .*zone force/.test(x))).toBe(true);
    const carte = JSON.parse(JSON.stringify(decor().p));
    carte.exercices[0].placeSerieDePlus = false;
    expect(T.verifierPlan(carte).erreurs.some((x) => /^I23 .*sans place/.test(x))).toBe(true);
  });
  test('I23 — audit du 16/10/2026, 01 #6 : une série de plus sans zone', () => {
    const sansZone = JSON.parse(JSON.stringify(decor().p));
    sansZone.exercices[0].consigne.zone = null;
    expect(T.verifierPlan(sansZone).erreurs.some((x) => /^I23 .*sans zone/.test(x))).toBe(true);
  });
  test('I24 — la ligne en plus en test, ou avant les lignes de la routine', () => {
    const test = base(); test.exercices[0].lignes[3].role = 'test';
    expect(T.verifierPlan(test).erreurs.some((x) => /^I24 .*est une ligne test/.test(x))).toBe(true);
    const avant = base(); avant.exercices[0].lignes[1].ajoutee = true;
    expect(T.verifierPlan(avant).erreurs.some((x) => /^I24 .*ne suit pas les lignes de la routine/.test(x))).toBe(true);
  });
});

describe('§14.7 — le pari de la série de plus', () => {
  test('lu dans les paris : la marche, l\'exercice du fondement, les séries de la routine', () => {
    const l = { id: 'x', module: 'escalier', exercise_slug: null, fondement: { seance: 'S1', jour: '2026-10-01',
      exercice: 'pecs', marche: 'serie_de_plus', reponse: 'acceptee', compteur: 4, n_routine: 3, debut: '2026-10-01T10:00:00+00:00' } };
    expect(M.marchesDesParis([l])[0]).toEqual({ id: 'x', seance: 'S1', jour: '2026-10-01', exercice: 'pecs',
      marche: 'serie_de_plus', reponse: 'acceptee', compteur: 4, debut: '2026-10-01T10:00:00+00:00', n: 3 });
  });
  test('identifiant : dans l\'espace de noms de l\'escalier, distinct des autres marches', async () => {
    const a = await M.idDEscalier('S1', 'pecs', 'serie_de_plus');
    expect(new Set([a, await M.idDEscalier('S1', 'pecs', 'schema'), await M.idDEscalier('S1', 'pecs', 'repli')]).size).toBe(3);
  });
  const k = (jour, compteur) => ({ exercice: 'pecs', jour, compteur, seance: 'K' + jour, debut: jour + 'T10:00:00Z' });
  test('acceptée : 1 au progrès avant le prochain déclenchement, 0 à ce déclenchement ; refusée : jamais', () => {
    const m = { exercice: 'pecs', jour: '2026-10-01', compteur: 4, marche: 'serie_de_plus', reponse: 'acceptee' };
    expect(M.observationMarche(m, [k('2026-10-04', 5), k('2026-10-07', 0)]).valeur).toBe(1);
    expect(M.observationMarche(m, [k('2026-10-04', 5), k('2026-10-07', 6), k('2026-10-10', 7), k('2026-10-14', 8)]).valeur).toBe(0);
    expect(M.observationMarche(Object.assign({}, m, { reponse: 'refusee' }), [k('2026-10-07', 0)])).toBeNull();
  });
});
