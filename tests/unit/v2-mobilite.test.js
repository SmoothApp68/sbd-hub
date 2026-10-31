/** @jest-environment node */
//
// 194-1 (MOTEUR §9.31) — LA MOBILITÉ EN FIN DE SÉANCE : la table et le bloc du moteur, le plan (`planDeSeance`), les invariants
// I94 à I98 (`verifierPlan`), l'insertion (`Seance.insererMobilite`), le fait de la semaine (`faits.minutesDeMobiliteParZone`),
// la saisie (`Profil`) et les lecteurs qui ne voient pas une série de mobilité.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Semaine = require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');

const SQ = 'squat_barre', SDT = 'souleve_de_terre_barre', DM = 'developpe_militaire_barre';
const CAT = {
  [SQ]: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: [], muscles_stabilisateurs: [] },
  [DM]: { nom: 'Militaire', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['deltoide_anterieur'], muscles_secondaires: [], muscles_stabilisateurs: [] }
};
function seanceDe(slugs, extra) {
  let k = 0;
  const id = () => 'm-' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((s) => { se = S.ajouterExercice(se, s, id, { series: 2 }); });
  return Object.assign(se, extra || {});
}
function entrees(se, extra) {
  return Object.assign({
    seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: {}, reglage: 'normal', paris: [], objectif: 'les_deux', catalogue: CAT,
    zonesRaides: ['hanches', 'ischios'], mobiliteFaite: {}, menagerProfil: []
  }, extra || {});
}
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs;

describe('194-1 — la table du moteur et celle du Profil', () => {
  test('les mêmes six clés, celles du CHECK de la base', () => {
    expect(Profil.ZONES_RAIDES.map((z) => z.cle)).toEqual(M.ZONES_RAIDES.slice());
    expect(M.ZONES_RAIDES.slice().sort()).toEqual(['chevilles', 'epaules', 'hanches', 'haut_du_dos', 'ischios', 'quadriceps']);
  });
  test('chaque zone a des étirements tenus et de la mobilité en mouvement, sans recouvrement', () => {
    M.ZONES_RAIDES.forEach((z) => {
      const t = M.MOBILITE_ZONES[z];
      expect(t.tenus.length).toBeGreaterThan(0);
      expect(t.enMouvement.length).toBeGreaterThan(0);
    });
    const tous = M.ZONES_RAIDES.map((z) => M.MOBILITE_ZONES[z].tenus.concat(M.MOBILITE_ZONES[z].enMouvement)).reduce((a, b) => a.concat(b), []);
    expect(new Set(tous).size).toBe(tous.length);
  });
});

describe('194-1 — la saisie : `zones_raides` (NULL = pas répondu, [] = aucune)', () => {
  test('une liste s’écrit, rangée dans l’ordre ; « aucune » s’écrit [] ; la même liste n’écrit rien', () => {
    const sans = { zones_raides: null };
    expect(Profil.preparerChamps(sans, { zones_raides: ['ischios', 'hanches'] }, new Date()).zones_raides).toEqual(['hanches', 'ischios']);
    expect(Profil.preparerChamps(sans, { zones_raides: [] }, new Date()).zones_raides).toEqual([]);
    expect(Profil.preparerChamps({ zones_raides: [] }, { zones_raides: [] }, new Date()).zones_raides).toBeUndefined();
    expect(Profil.preparerChamps({ zones_raides: ['hanches'] }, { zones_raides: ['hanches'] }, new Date()).zones_raides).toBeUndefined();
    expect(Profil.preparerChamps(sans, { zones_raides: ['inconnue'] }, new Date()).zones_raides).toEqual([]);
  });
  test('la colonne part par la file (CHAMPS_ECRITS) ; une clé inconnue ne part pas', () => {
    expect(Profil.champsEcrits({ zones_raides: ['hanches', 'x'] }).zones_raides).toEqual(['hanches']);
    expect(Profil.champsEcrits({ zones_raides: 'hanches' }).zones_raides).toBeUndefined();
  });
  test('le libellé du Profil distingue « Aucune » et « Pas répondu »', () => {
    expect(Profil.libelleDesZonesRaides({ zones_raides: null })).toBe('Pas répondu');
    expect(Profil.libelleDesZonesRaides({ zones_raides: [] })).toBe('Aucune');
    expect(Profil.libelleDesZonesRaides({ zones_raides: ['hanches', 'epaules'] })).toBe('Hanches, Épaules');
    expect(Profil.basculerZoneRaide(['hanches'], 'aucune')).toEqual([]);
  });
});

describe('194-1 — le bloc de fin (`blocDeMobilite`)', () => {
  const base = { zones: ['hanches', 'ischios', 'quadriceps'], faites: {}, muscles: [], slugs: [SQ], menager: [], douleurs: [] };
  test('sans zones raides (NULL ou aucune) : rien', () => {
    expect(M.blocDeMobilite(Object.assign({}, base, { zones: null }))).toEqual({ fin: null, avant: null });
    expect(M.blocDeMobilite(Object.assign({}, base, { zones: [] }))).toEqual({ fin: null, avant: null });
  });
  test('deux zones au plus : celles que la séance a travaillées d’abord, puis celles qui ont reçu le moins', () => {
    const b = M.blocDeMobilite(Object.assign({}, base, { muscles: ['quadriceps'], faites: { hanches: 5, ischios: 1 } }));
    expect(b.fin.zones.map((z) => z.zone)).toEqual(['quadriceps', 'ischios']);
  });
  test('une zone qui a ses 10 minutes de la semaine ne reçoit plus rien', () => {
    const b = M.blocDeMobilite(Object.assign({}, base, { zones: ['hanches'], faites: { hanches: 10 } }));
    expect(b.fin).toBeNull();
  });
  test('le bloc ne dépasse pas ce qui manque à la zone, les tenues font 30 à 60 s', () => {
    const b = M.blocDeMobilite(Object.assign({}, base, { zones: ['ischios'], faites: { ischios: 8.5 } }));
    const z = b.fin.zones[0];
    expect(z.fait + z.minutes).toBeLessThanOrEqual(10.05);
    z.exercices.forEach((x) => { expect(x.duree_s).toBeGreaterThanOrEqual(30); expect(x.duree_s).toBeLessThanOrEqual(60); });
  });
  test('le « Pourquoi » dit les minutes d’aujourd’hui et celles de la semaine', () => {
    const b = M.blocDeMobilite(Object.assign({}, base, { zones: ['hanches'], faites: { hanches: 4 } }));
    const z = b.fin.zones[0];
    expect(M.mobilitePourquoi(z)).toMatch(/^Hanches : \d+ min aujourd’hui, \d+ cette semaine sur 10\./);
  });
});

describe('194-1 — avant la séance : du mouvement, jamais un étirement tenu (I94)', () => {
  test('chevilles et squat : une préparation en mouvement de 2 minutes au plus', () => {
    const b = M.blocDeMobilite({ zones: ['chevilles'], faites: {}, muscles: [], slugs: [SQ], menager: [], douleurs: [] });
    expect(b.avant.sert).toBe('squat');
    expect(b.avant.minutes).toBeLessThanOrEqual(2.05);
    b.avant.exercices.forEach((x) => { expect(M.MOBILITE_ZONES.chevilles.enMouvement).toContain(x.slug); expect(M.MOBILITE_ZONES.chevilles.tenus).not.toContain(x.slug); });
  });
  test('la table de service : hanches (squat, soulevé), épaules (militaire, tractions), haut du dos (squat, militaire)', () => {
    const avant = (zone, slug) => M.blocDeMobilite({ zones: [zone], faites: {}, muscles: [], slugs: [slug], menager: [], douleurs: [] }).avant;
    expect(avant('hanches', SDT)).not.toBeNull();
    expect(avant('epaules', DM)).not.toBeNull();
    expect(avant('epaules', 'tractions')).not.toBeNull();
    expect(avant('haut_du_dos', DM)).not.toBeNull();
    expect(avant('chevilles', SDT)).toBeNull();
    expect(avant('ischios', SQ)).toBeNull();
  });
  test('une série déjà faite : plus de préparation', () => {
    expect(M.blocDeMobilite({ zones: ['chevilles'], slugs: [SQ], debutee: true }).avant).toBeNull();
  });
});

describe('194-1 — une zone à ménager ne reçoit aucun étirement (I96)', () => {
  test('hanches raides ET hanche à ménager : aucune ligne, la phrase du kiné', () => {
    const b = M.blocDeMobilite({ zones: ['hanches'], faites: {}, muscles: [], slugs: [SQ], menager: ['hanche'], douleurs: [] });
    expect(b.fin.zones).toEqual([]);
    expect(b.fin.kine).toEqual(['Ta hanche est à ménager : pour l’étirer, demande l’avis d’un kiné.']);
    expect(b.avant).toBeNull();
  });
  test('un « J’ai mal » récent sur la zone vaut une zone à ménager', () => {
    const b = M.blocDeMobilite({ zones: ['epaules'], faites: {}, muscles: [], slugs: [DM], menager: [], douleurs: ['epaule'] });
    expect(b.fin.zones).toEqual([]);
    expect(b.fin.kine[0]).toMatch(/^Tes épaules sont à ménager : pour l’étirer, demande l’avis d’un kiné\.$/);
  });
  test('genou à ménager : 90/90 au lieu du pigeon', () => {
    const sans = M.blocDeMobilite({ zones: ['hanches'], faites: {}, muscles: [], slugs: [], menager: [], douleurs: [] });
    expect(sans.fin.zones[0].exercices[0].slug).toBe('pigeon');
    const avec = M.blocDeMobilite({ zones: ['hanches'], faites: {}, muscles: [], slugs: [], menager: ['genou'], douleurs: [] });
    avec.fin.zones[0].exercices.forEach((x) => { expect(M.MOBILITE_CHARGE[x.slug] || []).not.toContain('genou'); });
    expect(avec.fin.zones[0].exercices[0].slug).toBe('hanches_90_90');
  });
  test('genou à ménager : les quadriceps ne reçoivent aucun étirement (flexion complète), phrase du kiné', () => {
    const b = M.blocDeMobilite({ zones: ['quadriceps'], faites: {}, muscles: ['quadriceps'], slugs: [SQ], menager: ['genou'], douleurs: [] });
    expect(b.fin.zones).toEqual([]);
    expect(b.fin.kine).toEqual(['Tes quadriceps sont à ménager : pour l’étirer, demande l’avis d’un kiné.']);
    const e = entrees(seanceDe([SQ]), { zonesRaides: ['quadriceps'], menagerProfil: ['genou'] });
    const p = T.planDeSeance(e);
    expect(erreurs(p, e)).toEqual([]);
    p.mobilite.fin.zones = [{ zone: 'quadriceps', libelle: 'Quadriceps', fait: 0, minutes: 1, apres: 1, exercices: [{ slug: 'etirement_quadriceps_debout', series: 2, duree_s: 45, minutes: 1 }] }];
    expect(erreurs(p, e).some((x) => /^I96/.test(x))).toBe(true);
  });
  test('dos à ménager : les ischios seulement couché, dos neutre, jamais penché en avant', () => {
    const b = M.blocDeMobilite({ zones: ['ischios'], faites: {}, muscles: [], slugs: [], menager: ['dos'], douleurs: [] });
    const slugs = b.fin.zones[0].exercices.map((x) => x.slug);
    expect(slugs).toEqual(['etirement_ischios_allonge_elastique']);
    const sans = M.blocDeMobilite({ zones: ['ischios'], faites: {}, muscles: [], slugs: [], menager: [], douleurs: [] });
    expect(sans.fin.zones[0].exercices[0].slug).toBe('etirement_ischios');
    const e = entrees(seanceDe([SQ]), { zonesRaides: ['ischios'], menagerProfil: ['dos'] });
    const p = T.planDeSeance(e);
    expect(erreurs(p, e)).toEqual([]);
    p.mobilite.fin.zones[0].exercices = [{ slug: 'etirement_ischios', series: 2, duree_s: 45, minutes: 1.5 }];
    expect(erreurs(p, e).some((x) => /^I96.*dos/.test(x))).toBe(true);
  });
});

describe('194-1 — le plan : proposé, jamais imposé (I94 à I98)', () => {
  test('le plan porte le bloc de fin, la consigne exacte et le « Pourquoi » ; les invariants passent', () => {
    const e = entrees(seanceDe([SQ]));
    const p = T.planDeSeance(e);
    expect(p.mobilite.fin.consigne).toBe('Sans douleur : une tension nette, pas plus.');
    expect(p.mobilite.fin.pourquoi).toMatch(/cette semaine sur 10/);
    expect(p.mobilite.fin.titre).toMatch(/^Mobilité · \d+ min$/);
    expect(erreurs(p, e)).toEqual([]);
  });
  test('la voix : jamais « récupération », « courbatures », « prévention »', () => {
    const p = T.planDeSeance(entrees(seanceDe([SQ]), {}));
    const texte = JSON.stringify(p.mobilite);
    expect(texte).not.toMatch(/récupération|courbature|prévention/i);
  });
  test('sans zones raides, en Édition, en « Juste un carnet » : aucun bloc', () => {
    const se = seanceDe([SQ]);
    expect(T.planDeSeance(entrees(se, { zonesRaides: null })).mobilite).toBeNull();
    expect(T.planDeSeance(entrees(se, { zonesRaides: [] })).mobilite).toBeNull();
    const ed = entrees(se); ed.seance.edition = true;
    expect(T.planDeSeance(ed).mobilite).toBeNull();
    expect(T.planDeSeance(entrees(se, { intention: 'entretien' })).mobilite).toBeNull();
  });
  test('trois « Non merci » de suite : le plan se tait', () => {
    let mem = {};
    ['A', 'B', 'C'].forEach((id) => { mem = T.refuserChauffes(mem, M.MOBILITE_REFUS_CLE, id); });
    const e = entrees(seanceDe([SQ]), { refusChauffes: T.refusChauffesDe(mem, 'S') });
    expect(T.planDeSeance(e).mobilite).toBeNull();
    // « Ajouter » (ou valider les zones dans le Profil) remet le compte à zéro.
    expect(T.accepterChauffes(mem, M.MOBILITE_REFUS_CLE)[M.MOBILITE_REFUS_CLE]).toBeUndefined();
  });
  test('« J’ai peu de temps » retire le bloc d’abord, avant toute série (I97)', () => {
    const e = entrees(seanceDe([SQ]), { raccourci: { retires: [] } });
    const p = T.planDeSeance(e);
    expect(p.mobilite).toEqual({ retiree: 'peu_de_temps', avant: null, fin: null });
    expect(erreurs(p, e)).toEqual([]);
    const carte = M.carteRaccourcir([], { exercices: [] }, 45, null, true);
    expect(carte.lignes[0]).toBe('Bloc de mobilité : retiré en premier, avant toute série');
    expect(M.carteRaccourcir([], { exercices: [] }, 45, null, false).lignes).toEqual([]);
  });
  test('l’invariant I94 refuse un étirement tenu avant la charge', () => {
    const e = entrees(seanceDe([SQ]), { zonesRaides: ['hanches'] });
    const p = T.planDeSeance(e);
    p.mobilite = { retiree: null, fin: null, avant: { zone: 'hanches', libelle: 'Hanches', sert: 'squat', minutes: 1, consigne: M.MOBILITE_CONSIGNE,
      exercices: [{ slug: 'pigeon', series: 2, duree_s: 45, minutes: 1.5 }] } };
    expect(erreurs(p, e).some((x) => /^I94/.test(x))).toBe(true);
  });
  test('l’invariant I95 refuse trois zones, une zone pleine, une tenue de 120 s', () => {
    const e = entrees(seanceDe([SQ]), { zonesRaides: ['hanches', 'ischios', 'quadriceps'], mobiliteFaite: { hanches: 10 } });
    const p = T.planDeSeance(e);
    const z = (zone, x) => Object.assign({ zone, libelle: zone, fait: 0, minutes: 1, apres: 1, exercices: [{ slug: M.MOBILITE_ZONES[zone].tenus[0], series: 2, duree_s: 45, minutes: 1 }] }, x || {});
    p.mobilite.fin.zones = [z('hanches', { fait: 10 }), z('ischios'), z('quadriceps', { exercices: [{ slug: 'etirement_quadriceps_debout', series: 2, duree_s: 120, minutes: 4 }] })];
    const msg = erreurs(p, e).filter((x) => /^I95/.test(x)).join(' | ');
    expect(msg).toMatch(/3 zones/);
    expect(msg).toMatch(/déjà ses 10 minutes/);
    expect(msg).toMatch(/120 s/);
  });
  test('l’invariant I96 refuse un étirement sur une zone à ménager et exige la phrase du kiné', () => {
    const e = entrees(seanceDe([SQ]), { zonesRaides: ['hanches'], menagerProfil: [] });
    const p = T.planDeSeance(e);
    const e2 = Object.assign({}, e, { menagerProfil: ['hanche'] });
    expect(erreurs(p, e2).filter((x) => /^I96/.test(x)).length).toBeGreaterThan(0);
    const e3 = entrees(seanceDe([SQ]), { zonesRaides: ['hanches'], menagerProfil: ['hanche'] });
    const p3 = T.planDeSeance(e3);
    expect(p3.mobilite.fin.zones).toEqual([]);
    expect(erreurs(p3, e3)).toEqual([]);
  });
  test('l’invariant I98 refuse une autre consigne et un mot interdit', () => {
    const e = entrees(seanceDe([SQ]));
    const p = T.planDeSeance(e);
    p.mobilite.fin.consigne = 'Tiens fort.';
    p.mobilite.fin.pourquoi = 'Pour ta récupération.';
    const msg = erreurs(p, e).filter((x) => /^I98/.test(x)).join(' | ');
    expect(msg).toMatch(/consigne du bloc/);
    expect(msg).toMatch(/récupération/);
  });
  test('un exercice de mobilité dans la séance se pré-remplit de sa durée, sa série reste vide', () => {
    const se = seanceDe(['pigeon']);
    const e = entrees(se, { zonesRaides: null, catalogue: Object.assign({}, CAT, { pigeon: { nom: 'Pigeon', equipement: 'aucun', mesure: 'temps', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] } }) });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].lignes[0].prerempli.duree_s).toBe(45);
    expect(se.exercices[0].series[0].duree_s).toBeNull();
  });
});

describe('194-1 — « Ajouter » : le geste seul écrit', () => {
  test('le bloc de fin se pose après le dernier exercice, la préparation avant le premier ; séries vides', () => {
    let k = 0; const id = () => 'n-' + (++k);
    const se = seanceDe([SQ]);
    const fin = S.insererMobilite(se, [{ slug: 'pigeon', series: 2 }, { slug: 'etirement_ischios', series: 3 }], id, 'fin', M.MOBILITE_CONSIGNE);
    expect(fin.exercices.map((x) => x.exercise_slug)).toEqual([SQ, 'pigeon', 'etirement_ischios']);
    expect(fin.exercices[2].series).toHaveLength(3);
    fin.exercices.slice(1).forEach((x) => x.series.forEach((s) => { expect(s.duree_s).toBeNull(); expect(s.validee_a).toBeFalsy(); }));
    const avant = S.insererMobilite(se, [{ slug: 'flexion_cheville_genou_mur', series: 2 }], id, 'avant', null);
    expect(avant.exercices.map((x) => x.exercise_slug)).toEqual(['flexion_cheville_genou_mur', SQ]);
    expect(se.exercices).toHaveLength(1);   // la séance d'origine n'est pas touchée
  });
  test('une fois posé, le bloc ne se repropose pas', () => {
    let k = 0; const id = () => 'p-' + (++k);
    const se = S.insererMobilite(seanceDe([SQ]), [{ slug: 'pigeon', series: 2 }], id, 'fin', null);
    const p = T.planDeSeance(entrees(se, { zonesRaides: ['hanches'] }));
    expect(p.mobilite === null || p.mobilite.fin === null).toBe(true);
  });
});

describe('194-1 — les lecteurs : une série de mobilité ne compte nulle part', () => {
  test('hors volume (aucun muscle primaire), hors série de musculation', () => {
    const f = { slug: 'pigeon', nature: 'mobilite', mesure: 'temps', muscles_primaires: [] };
    expect(Semaine.porteDuVolume(f)).toBe(false);
    expect(Semaine.estSerieDeMusculation({ type_serie: 'travail', duree_s: 45 }, f)).toBe(false);
  });
});

describe('194-1 — le fait de la semaine et les records', () => {
  const PIGEON = { slug: 'pigeon', nom: 'Pigeon', nature: 'mobilite', mesure: 'temps', charge: 'aucune', equipement: 'aucun',
    muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] };
  const serie = (id, session, slug, d, extra) => Object.assign({ id, session_id: session, exercise_slug: slug, rang: 0, type_serie: 'travail', duree_s: d,
    validee_a: '2026-10-29T18:00:00Z' }, extra || {});
  function corpus(par, seances) {
    const index = Modele.indexerExercices([PIGEON]);
    return { seances, series: [].concat(...Object.values(par)), exercices: [PIGEON], seriesDe: (id) => par[id] || [], catalogue: () => index, journal: [] };
  }
  const seances = [{ id: 'b', debut: '2026-10-29T18:00:00Z' }, { id: 'a', debut: '2026-10-27T18:00:00Z' }, { id: 'z', debut: '2026-10-20T18:00:00Z' }];
  test('les minutes de la semaine par zone : tenues de chaque côté comptées deux fois, la semaine d’avant écartée, hors_calcul écarté', () => {
    const par = { a: [serie('a0', 'a', 'pigeon', 45), serie('a1', 'a', 'pigeon', 45)], b: [serie('b0', 'b', 'pigeon', 60, { hors_calcul: true })],
                  z: [serie('z0', 'z', 'pigeon', 600)] };
    const m = Faits.creer().minutesDeMobiliteParZone(corpus(par, seances), '2026-10-31T10:00:00Z');
    expect(m).toEqual({ hanches: 3 });
  });
  test('une tenue plus longue n’est JAMAIS un record (le journal ne reçoit rien)', () => {
    const par = { a: [serie('a0', 'a', 'pigeon', 45)], b: [serie('b0', 'b', 'pigeon', 60)] };
    const c = corpus(par, seances);
    expect(Faits.creer().recordsDeLaSeance(c, { id: 'b', debut: seances[0].debut, series: par.b })).toEqual([]);
  });
});
