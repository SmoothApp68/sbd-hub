/** @jest-environment node */
//
// 87 — LE SOCIAL, ÉTAGE 1 (SOCIAL-V1) : les règles pures (`social.js`), les médailles (`faits.medaillesDuSocial`),
// les routes, et le faux serveur du banc (`tests/banc/faux-social.js`), qui imite la migration v2_078 — c'est lui
// qui prouve la confidentialité au banc, il se vérifie donc ici d'abord.
//
// CONFIGURATION DISCRIMINANTE : chaque règle de cercle se teste des DEUX côtés (un abonnement à sens unique ne
// donne pas le détail ; l'inverse ne donne rien), et chaque séance « interdite » (privée, en cours) a sa jumelle
// visible dans le même fil — sinon un fil vide passerait pour un fil filtré.

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
require('../../v2/js/calendrier.js');
const Social = require('../../v2/js/social.js');
const Routeur = require('../../v2/js/routeur.js');
const Faits = require('../../v2/js/faits.js');
const FauxSocial = require('../banc/faux-social.js');

describe('social.js — les cercles et ce qu’ils montrent', () => {
  const p = (je_suis, me_suit) => ({ id: 'x', pseudo: 'lea', je_suis, me_suit });
  test('inconnu, demande, suivi (un sens), mutuel, moi', () => {
    expect(Social.cercleDe(p(null, false), 'moi')).toBe('inconnu');
    expect(Social.cercleDe(p(null, true), 'moi')).toBe('inconnu');
    expect(Social.cercleDe(p('demande', true), 'moi')).toBe('demande');
    expect(Social.cercleDe(p('accepte', false), 'moi')).toBe('suivi');
    expect(Social.cercleDe(p('accepte', true), 'moi')).toBe('mutuel');
    expect(Social.cercleDe({ id: 'moi' }, 'moi')).toBe('moi');
  });
  test('le calendrier dès le suivi accepté ; le détail en mutuel seulement', () => {
    expect(['inconnu', 'demande', 'suivi', 'mutuel'].map(Social.voitLeCalendrier)).toEqual([false, false, true, true]);
    expect(['inconnu', 'demande', 'suivi', 'mutuel'].map(Social.voitLeDetail)).toEqual([false, false, false, true]);
  });
  test('« Inviter dans un groupe » : inactif partout (étage 3) ; « Bientôt » en mutuel, la condition sinon', () => {
    expect(Social.invitation('mutuel')).toEqual({ actif: false, sous: 'Bientôt' });
    expect(Social.invitation('suivi')).toEqual({ actif: false, sous: 'Abonnez-vous l’un à l’autre pour l’inviter.' });
  });
  test('le bouton : s’abonner, suivre en retour — rien une fois abonné ou en demande', () => {
    expect(Social.boutonDe(p(null, false), 'inconnu')).toBe('S’abonner');
    expect(Social.boutonDe(p(null, true), 'inconnu')).toBe('Suivre en retour');
    expect(Social.boutonDe(p('demande', false), 'demande')).toBeNull();
    expect(Social.boutonDe(p('accepte', true), 'mutuel')).toBeNull();
  });
  test('l’état : des faits, jamais un « bravo »', () => {
    expect(Social.etatDe({ pseudo: 'lea' }, 'mutuel')).toBe('Vous vous suivez');
    expect(Social.etatDe({ pseudo: 'lea' }, 'suivi')).toBe('Tu suis lea');
    expect(Social.etatDe({ pseudo: 'lea', me_suit: true }, 'inconnu')).toBe('lea te suit');
  });
  test('le niveau publié : « Niveau 12 · Athlète », le niveau seul sans titre, rien sans niveau (jeu éteint)', () => {
    const T = { athlete: 'Athlète' };
    expect(Social.ligneDuJeu(12, 'athlete', T)).toBe('Niveau 12 · Athlète');
    expect(Social.ligneDuJeu(12, null, T)).toBe('Niveau 12');
    expect(Social.ligneDuJeu(null, 'athlete', T)).toBeNull();
  });
  test('le blason : une couleur stable par pseudo, différente d’un pseudo à l’autre', () => {
    expect(Social.couleurDuBlason('lea')).toBe(Social.couleurDuBlason('lea'));
    expect(Social.couleurDuBlason('lea')).not.toBe(Social.couleurDuBlason('jordan'));
    expect(Social.couleurDuBlason('lea')).toMatch(/^hsl\(\d+, 32%, 64%\)$/);
  });
  test('les liens rangés, et « il te suit » = un abonné que je ne suis pas', () => {
    const r = Social.liensRanges([
      { user_id: 'a', pseudo: 'alexis', lien: 'abonne' }, { user_id: 'j', pseudo: 'jordan', lien: 'abonne' },
      { user_id: 'j', pseudo: 'jordan', lien: 'abonnement' }, { user_id: 'm', pseudo: 'melody', lien: 'demande_recue' },
      { user_id: 'b', pseudo: 'bob', lien: 'bloque' }]);
    expect(r.demandesRecues.map((x) => x.pseudo)).toEqual(['melody']);
    expect(r.aSuivreEnRetour.map((x) => x.pseudo)).toEqual(['alexis']);
    expect(r.bloques.map((x) => x.pseudo)).toEqual(['bob']);
  });
  test('le calendrier : les teintes par tiers du plus gros jour du mois, rien sur les jours vides', () => {
    const g = Social.calendrierSocial(2026, 9, [
      { session_id: 's1', debut: new Date(2026, 9, 3, 18).toISOString(), tonnage_kg: 9000 },
      { session_id: 's2', debut: new Date(2026, 9, 7, 18).toISOString(), tonnage_kg: 3000 },
      { session_id: 's3', debut: new Date(2026, 9, 9, 18).toISOString(), tonnage_kg: 0 }]);
    const jours = {};
    g.lignes.forEach((l) => l.jours.forEach((j) => { if (!j.horsMois) jours[j.jour] = j; }));
    expect([jours[3].teinte, jours[7].teinte, jours[9].teinte, jours[4].teinte]).toEqual([3, 1, 1, 0]);
    expect(jours[3].seances.map((s) => s.session_id)).toEqual(['s1']);
    expect(Social.bornesDuMois(2026, 9)).toEqual({ de: '2026-10-01', a: '2026-10-31' });
  });
  test('le détail regroupé par exercice, dans l’ordre des séries', () => {
    const d = Social.detailParExercice([{ exercise_slug: 'b', rang: 3 }, { exercise_slug: 'a', rang: 1 }, { exercise_slug: 'b', rang: 2 }]);
    expect(d.map((x) => [x.slug, x.series.length])).toEqual([['a', 1], ['b', 2]]);
  });
  test('le lien d’invitation et la garde des champs interdits', () => {
    expect(Social.lienInvitation('https://sbd-hub.pages.dev/', 'aurel_br')).toBe('https://sbd-hub.pages.dev/a/aurel_br');
    expect(Social.champsInterditsDans([{ a: 1, b: { note: 'x' } }, { rpe: 8 }])).toEqual(['note', 'rpe']);
    expect(Social.CHAMPS_INTERDITS).toEqual(FauxSocial.CHAMPS_INTERDITS);
  });
});

describe('les routes du social', () => {
  test('/jeu/fil, /jeu/amis, /a/<pseudo> — l’onglet Jeu, hors interrupteur', () => {
    expect(Routeur.analyser('/jeu/fil')).toEqual({ vue: 'fil', params: {} });
    expect(Routeur.analyser('/jeu/amis')).toEqual({ vue: 'amis', params: {} });
    expect(Routeur.analyser('/a/aurel_br')).toEqual({ vue: 'ami', params: { pseudo: 'aurel_br' } });
    expect(Routeur.analyser('/a/%3Cscript%3E').repli).toBe('pseudo-invalide');
    ['fil', 'amis'].forEach((v) => expect(Routeur.construire(v, {})).toBe('/jeu/' + v));
    expect(Routeur.construire('ami', { pseudo: 'lea' })).toBe('/a/lea');
    ['fil', 'amis', 'ami'].forEach((v) => {
      expect(Routeur.ongletDe(v)).toBe('jeu');
      expect(Routeur.estVueDuJeu(v)).toBe(false);
      expect(Routeur.estVueSociale(v)).toBe(true);
    });
  });
});

describe('faits.medaillesDuSocial — une médaille par série médaillée', () => {
  const faits = Faits.creer();
  const c = { catalogue: () => ({ 'squat-barre': { nom: 'Squat (Barre)' } }) };
  test('deux records d’une même série = UNE médaille, sa mesure relue sur « charge à reps »', () => {
    const m = faits.medaillesDuSocial(c, [
      { set_id: 's1', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'squat-barre', type: 'un_rm_estime', valeur: 93 },
      { set_id: 's1', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'squat-barre', type: 'charge_a_reps', valeur: 80, reps: 5 },
      { set_id: 's2', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'hip-thrust', type: 'reps_a_charge', valeur: 8, charge: 100 }]);
    expect(m.map((x) => [x.serieId, x.mesure])).toEqual([['s1', '80 kg × 5'], ['s2', '100 kg × 8']]);
    expect(m[0].types).toEqual(['charge_a_reps', 'un_rm_estime']);
    expect(m[0].nom).toMatch(/^Squat/);
  });
  test('rien sans ligne', () => expect(faits.medaillesDuSocial(c, [])).toEqual([]));
});

// ── Le faux serveur : les règles de la migration ──────────────────────────────
function decor() {
  const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], sessions: [], sets: [], records: [] };
  const f = FauxSocial.creer(base, { moi: 'u-moi' });
  f.etat.profils.push({ id: 'u-lea', username: 'lea', compte_prive: true, jeu_actif: true, jeu_niveau: 12, jeu_titre: 'athlete' },
    { id: 'u-pub', username: 'public', compte_prive: false, jeu_actif: false, jeu_niveau: 30 });
  const hier = new Date(Date.now() - 86400000).toISOString();
  const s = (id, extra) => Object.assign({ id, user_id: 'u-lea', titre: id, debut: hier, fin: hier, statut: 'terminee',
    visibilite: 'mutuels', note: 'secret' }, extra);
  f.etat.sessions.push(s('lea-1'), s('lea-privee', { visibilite: 'private' }), s('lea-en-cours', { statut: 'en_cours' }),
    s('lea-vieille', { debut: new Date(Date.now() - 40 * 86400000).toISOString() }));
  f.etat.sets.push(
    { id: 't1', session_id: 'lea-1', exercise_slug: 'squat-barre', rang: 1, charge_kg: 80, reps: 5, type_serie: 'travail', rpe: 9, ressenti: 'dur' },
    { id: 't2', session_id: 'lea-1', exercise_slug: 'squat-barre', rang: 2, charge_kg: 40, reps: 5, type_serie: 'echauffement' },
    { id: 't3', session_id: 'lea-1', exercise_slug: 'squat-barre', rang: 3, charge_kg: 60, reps: 8, type_serie: 'degressive' },
    { id: 't4', session_id: 'lea-1', exercise_slug: 'traction', rang: 4, charge_kg: -20, reps: 8, type_serie: 'travail' });
  base.sessions.push({ id: 'moi-1', user_id: 'u-moi', debut: hier, statut: 'terminee' });
  return f;
}

describe('faux-social — les cercles, le compte privé, le blocage (v2_078)', () => {
  test('compte privé : la demande attend ; accepter = le suivi seulement ; le fil apparaît alors', () => {
    const f = decor();
    expect(f.appeler('u-moi', 'POST', 'abonnements', { suiveur: 'u-moi', suivi: 'u-lea' }).status).toBe(201);
    expect(f.etat.abonnements[0].statut).toBe('demande');
    expect(f.rpc('u-moi', 'social_fil')).toEqual([]);
    expect(f.appeler('u-moi', 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.u-moi&suivi=eq.u-lea').status).toBe(204);
    expect(f.etat.abonnements[0].statut).toBe('demande');                     // le suiveur ne s'accepte pas lui-même
    f.appeler('u-lea', 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.u-moi&suivi=eq.u-lea');
    expect(f.etat.abonnements[0].statut).toBe('accepte');
    // Le fil : la séance terminée et visible des 30 jours — ni la privée, ni l'en cours, ni la vieille.
    expect(f.rpc('u-moi', 'social_fil').map((l) => l.session_id)).toEqual(['lea-1']);
  });
  test('compte public : acceptation d’office ; on n’écrit que pour soi', () => {
    const f = decor();
    f.appeler('u-moi', 'POST', 'abonnements', { suiveur: 'u-moi', suivi: 'u-pub' });
    expect(f.etat.abonnements[0].statut).toBe('accepte');
    expect(f.appeler('u-moi', 'POST', 'abonnements', { suiveur: 'u-lea', suivi: 'u-pub' }).status).toBe(403);
  });
  test('le tonnage = Bilan.volumeKg : travail seul, charge > 0, reps > 0 (ni chauffe, ni dégressive, ni aide)', () => {
    const f = decor();
    const Bilan = global.THBilan;
    expect(f.tonnage('lea-1')).toBe(400);
    expect(f.tonnage('lea-1')).toBe(Bilan.volumeKg(f.etat.sets.filter((t) => t.session_id === 'lea-1')));
  });
  test('à sens unique : calendrier oui, détail NON ; mutuel : détail, sans RPE ni ressenti', () => {
    const f = decor();
    f.appeler('u-moi', 'POST', 'abonnements', { suiveur: 'u-moi', suivi: 'u-lea' });
    f.appeler('u-lea', 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.u-moi&suivi=eq.u-lea');
    expect(f.rpc('u-moi', 'social_calendrier', { p_user: 'u-lea', p_de: '2000-01-01', p_a: '2000-02-01' })).toEqual([]);
    const j = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(f.rpc('u-moi', 'social_calendrier', { p_user: 'u-lea', p_de: j, p_a: j }).map((x) => x.session_id)).toEqual(['lea-1']);
    expect(f.rpc('u-moi', 'social_calendrier', { p_user: 'u-lea', p_de: '2026-01-01', p_a: '2026-04-01' })).toEqual([]);   // > 62 jours
    expect(f.rpc('u-moi', 'social_detail_seance', { p_session: 'lea-1' })).toEqual([]);
    f.etat.profils.push({ id: 'u-moi2' });
    f.appeler('u-lea', 'POST', 'abonnements', { suiveur: 'u-lea', suivi: 'u-moi' });
    f.appeler('u-moi', 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.u-lea&suivi=eq.u-moi');
    const d = f.rpc('u-moi', 'social_detail_seance', { p_session: 'lea-1' });
    expect(d).toHaveLength(4);
    expect(FauxSocial.champsInterdits(d)).toEqual([]);
    expect(f.etat.fuites).toEqual([]);
  });
  test('le blocage efface les DEUX sens et les réactions croisées ; plus rien des deux côtés', () => {
    const f = decor();
    f.appeler('u-moi', 'POST', 'abonnements', { suiveur: 'u-moi', suivi: 'u-lea' });
    f.appeler('u-lea', 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.u-moi&suivi=eq.u-lea');
    f.appeler('u-lea', 'POST', 'abonnements', { suiveur: 'u-lea', suivi: 'u-moi' });
    f.appeler('u-moi', 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.u-lea&suivi=eq.u-moi');
    expect(f.appeler('u-moi', 'POST', 'reactions_seance', { session_id: 'lea-1', user_id: 'u-moi' }).status).toBe(201);
    expect(f.appeler('u-lea', 'POST', 'reactions_seance', { session_id: 'moi-1', user_id: 'u-lea' }).status).toBe(201);
    f.appeler('u-lea', 'POST', 'blocages', { bloqueur: 'u-lea', bloque: 'u-moi' });
    expect(f.etat.abonnements).toEqual([]);
    expect(f.etat.reactions).toEqual([]);
    expect(f.rpc('u-moi', 'social_profil', { p_pseudo: 'lea' })).toEqual([]);
    expect(f.rpc('u-lea', 'social_profil', { p_pseudo: 'moi' })).toEqual([]);
    expect(f.rpc('u-moi', 'social_rechercher', { p_debut: 'le' })).toEqual([]);
    expect(f.appeler('u-moi', 'POST', 'abonnements', { suiveur: 'u-moi', suivi: 'u-lea' }).status).toBe(400);
  });
  test('réactions : seulement sur une séance suivie, visible, terminée ; le compte, à l’auteur seul', () => {
    const f = decor();
    expect(f.appeler('u-moi', 'POST', 'reactions_seance', { session_id: 'lea-1', user_id: 'u-moi' }).status).toBe(403);
    f.etat.profils.push({ id: 'u-x', username: 'x' });
    f.appeler('u-lea', 'POST', 'abonnements', { suiveur: 'u-lea', suivi: 'u-moi' });
    f.appeler('u-moi', 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.u-lea&suivi=eq.u-moi');
    f.appeler('u-lea', 'POST', 'reactions_seance', { session_id: 'moi-1', user_id: 'u-lea' });
    expect(f.rpc('u-moi', 'social_mes_reactions', { p_session: 'moi-1' })).toBe(1);
    expect(f.rpc('u-lea', 'social_mes_reactions', { p_session: 'moi-1' })).toBe(0);
  });
  test('le niveau : nul quand le jeu est éteint chez la personne', () => {
    const f = decor();
    expect(f.rpc('u-moi', 'social_profil', { p_pseudo: 'lea' })[0]).toMatchObject({ niveau: 12, titre: 'athlete', je_suis: null, me_suit: false });
    expect(f.rpc('u-moi', 'social_rechercher', { p_debut: 'pu' })).toEqual([{ pseudo: 'public', niveau: null, compte_prive: false }]);
  });
});

// ══ 89 — L'ÉTAGE 2 (SOCIAL-V1 « Étage 2 », décisions du 14/10/2026, migration v2_079) ══════════════════════
//
// CONFIGURATIONS DISCRIMINANTES : l'exemple réel (squat Jordan 210 kg à 89,5 kg contre Aurélien 145 kg à 96,75 kg ;
// couché 140 kg chacun → le plus léger devant) ; au couché, des kilos égaux — un tri par kilos bruts ne départage
// pas Jordan, seul le poids de corps le met devant ; un abonné à sens unique ne reçoit RIEN de l'étage 2.
describe('89 — le score DOTS, à poids de corps égal', () => {
  test('l’exemple réel : squat, Jordan (210 kg à 89,5) devant Aurélien (145 kg à 96,75) ; couché à 140 chacun, le plus léger devant', () => {
    const jS = Social.scoreDots(210, 89.5, 'homme'), aS = Social.scoreDots(145, 96.75, 'homme');
    expect(jS).toBeGreaterThan(aS);
    const jB = Social.scoreDots(140, 89.5, 'homme'), aB = Social.scoreDots(140, 96.75, 'homme');
    expect(jB).toBeGreaterThan(aB);
    // Ordre de grandeur DOTS (IPF) : 210 kg à 89,5 kg ≈ 136.
    expect(Math.round(jS)).toBe(136);
  });
  test('par sexe ; sans sexe précisé ou sans poids : rien', () => {
    expect(Social.scoreDots(100, 60, 'femme')).toBeGreaterThan(Social.scoreDots(100, 60, 'homme'));
    expect(Social.scoreDots(100, 80, 'non_precise')).toBeNull();
    expect(Social.scoreDots(100, null, 'homme')).toBeNull();
    expect(Social.scoresAPublier({ 'squat-barre': 100 }, null, 'homme', () => true)).toBeNull();
    expect(Social.scoresAPublier({ 'squat-barre': 100 }, 80, 'non_precise', () => true)).toBeNull();
  });
  test('ce qui part : le score et la charge par exercice à la barre — JAMAIS le poids de corps', () => {
    const s = Social.scoresAPublier({ 'squat-barre': 145, 'curl-haltere': 20 }, 96.75, 'homme', (k) => k === 'squat-barre');
    expect(s).toEqual([{ exercise_slug: 'squat-barre', score: Social.scoreDots(145, 96.75, 'homme'), charge_kg: 145 }]);
    expect(JSON.stringify(s)).not.toMatch(/96\.75|poids/);
    expect(Social.scoresChanges(s, { 'squat-barre': { score: s[0].score, charge_kg: 145 } })).toEqual([]);
    expect(Social.scoresChanges(s, {}).length).toBe(1);
  });
  test('« à la barre » : l’équipement du catalogue', () => {
    expect(Social.aLaBarre({ equipement: 'barre', mesure: 'charge_reps' })).toBe(true);
    expect(Social.aLaBarre({ equipement: 'halteres', mesure: 'charge_reps' })).toBe(false);
    expect(Social.aLaBarre(undefined)).toBe(false);
  });
});

describe('89 — « Entre amis » : à poids de corps égal, les vrais kilos, à partir de deux', () => {
  const ligne = (pseudo, charge, poids, moi) => ({ pseudo, charge_kg: charge, score: Social.scoreDots(charge, poids, 'homme'), moi: !!moi });
  test('DISCRIMINANT — couché à 140 chacun : Jordan (plus léger) premier, les kilos affichés sont les vrais', () => {
    const c = Social.classementEntreAmis([ligne('aurel', 140, 96.75, true), ligne('jordan', 140, 89.5)]);
    expect(c.map((x) => x.pseudo)).toEqual(['jordan', 'aurel']);
    expect(c.map((x) => x.charge_kg)).toEqual([140, 140]);
    expect(c[1].moi).toBe(true);
  });
  test('squat : Jordan, alexis, moi — un plus léger qui soulève moins peut passer devant', () => {
    const c = Social.classementEntreAmis([ligne('alexis', 130, 70), ligne('aurel', 145, 96.75, true), ligne('jordan', 210, 89.5)]);
    expect(c.map((x) => x.pseudo)).toEqual(['jordan', 'alexis', 'aurel']);
  });
  test('rien sous deux personnes avec un score', () => {
    expect(Social.classementEntreAmis([ligne('aurel', 145, 96.75, true)])).toBeNull();
    expect(Social.classementEntreAmis([])).toBeNull();
  });
});

describe('89 — la page d’un exercice et « Se comparer sur la période »', () => {
  const M = new Date(2026, 9, 14, 12);
  const l = (sid, j, ch, r, slug) => ({ session_id: sid, debut: new Date(2026, 9 - j, 5, 10).toISOString(), charge_kg: ch, reps: r,
    exercise_slug: slug || 'squat-barre' });
  test('meilleure charge, meilleure série (le plus gros charge × reps), séances, la meilleure charge de chaque mois (6 mois)', () => {
    const r = Social.resumeExercice([l('a', 0, 210, 1), l('a', 0, 180, 5), l('b', 2, 170, 5), l('c', 7, 250, 1)], M);
    expect(r.meilleureCharge).toBe(210);                         // 250 kg, il y a 7 mois : hors fenêtre
    expect(r.meilleureSerie).toEqual({ charge: 180, reps: 5 });
    expect(r.seances).toBe(2);
    expect(r.mois.map((m) => m.charge)).toEqual([null, null, null, 170, null, 210]);
    expect(Social.resumeExercice([], M)).toBeNull();
  });
  test('les bornes : ce mois, 3 mois, l’année', () => {
    expect(Social.bornesDePeriode('mois', M)).toEqual({ de: '2026-10-01', a: '2026-10-14' });
    expect(Social.bornesDePeriode('3mois', M)).toEqual({ de: '2026-07-15', a: '2026-10-14' });
    expect(Social.bornesDePeriode('annee', M)).toEqual({ de: '2026-01-01', a: '2026-10-14' });
  });
  test('mes lignes et celles de la base donnent la même forme ; les exercices à la barre d’abord, à poids de corps égal', () => {
    const moi = Social.periodeDesLignes([l('a', 0, 140, 5, 'dc-barre'), l('a', 0, 100, 10, 'curl'), l('b', 0, 145, 3)]);
    expect(moi.total).toEqual({ seances: 2, series: 3, reps: 18, tonnage_kg: 2135 });
    const lui = Social.periodeDeLaBase([
      { exercise_slug: 'dc-barre', seances: 1, series: 1, reps: 5, tonnage_kg: 700, charge_max: 140 },
      { exercise_slug: 'curl', seances: 1, series: 1, reps: 10, tonnage_kg: 300, charge_max: 30 },
      { exercise_slug: null, seances: 1, series: 2, reps: 15, tonnage_kg: 1000, charge_max: 140 }]);
    const c = Social.comparaisonPeriode(moi, lui, { estALaBarre: (k) => k === 'dc-barre',
      scores: { 'dc-barre': { moi: Social.scoreDots(140, 96.75, 'homme'), lui: Social.scoreDots(140, 89.5, 'homme') } } });
    expect(c.totaux.lui.seances).toBe(1);
    expect(c.communs.map((x) => x.slug)).toEqual(['dc-barre', 'curl']);
    expect(c.communs[0].ordre).toEqual(['lui', 'moi']);           // couché à 140 chacun : le plus léger devant
    expect(c.communs[1].ordre).toEqual(['moi', 'lui']);           // pas à la barre : toi d'abord
    expect(c.communs[1]).toMatchObject({ moi: 100, lui: 30 });
  });
});

describe('89 — les routes de l’étage 2', () => {
  test('/a/<pseudo>/exercice/<slug>, /a/<pseudo>/comparer ; un reste illisible retombe sur le profil', () => {
    expect(Routeur.analyser('/a/jordan/exercice/squat-barre')).toEqual({ vue: Routeur.AMI, params: { pseudo: 'jordan', slug: 'squat-barre' } });
    expect(Routeur.analyser('/a/jordan/comparer')).toEqual({ vue: Routeur.AMI, params: { pseudo: 'jordan', comparer: true } });
    expect(Routeur.analyser('/a/jordan/n-importe').params).toEqual({ pseudo: 'jordan' });
    expect(Routeur.construire(Routeur.AMI, { pseudo: 'jordan', slug: 'squat-barre' })).toBe('/a/jordan/exercice/squat-barre');
    expect(Routeur.construire(Routeur.AMI, { pseudo: 'jordan', comparer: true })).toBe('/a/jordan/comparer');
  });
});

describe('89 — faux-social (v2_079) : mutuels seulement, aucune donnée interdite, jamais le poids', () => {
  function decor2() {
    const f = decor();
    f.etat.profils.push({ id: 'u-jordan', username: 'jordan', compte_prive: true });
    const hier = new Date(Date.now() - 86400000).toISOString();
    f.etat.sessions.push({ id: 'j-1', user_id: 'u-jordan', debut: hier, fin: hier, statut: 'terminee', visibilite: 'mutuels', poids_corps_kg: 89.5 });
    f.etat.sets.push({ id: 'j1', session_id: 'j-1', exercise_slug: 'squat-barre', rang: 1, charge_kg: 210, reps: 1, type_serie: 'travail', rpe: 9, poids_corps_kg: 89.5 },
      { id: 'j2', session_id: 'j-1', exercise_slug: 'squat-barre', rang: 2, charge_kg: 180, reps: 5, type_serie: 'travail', note: 'genou' },
      { id: 'j3', session_id: 'j-1', exercise_slug: 'squat-barre', rang: 0, charge_kg: 60, reps: 5, type_serie: 'echauffement' });
    f.etat.scores.push({ user_id: 'u-jordan', exercise_slug: 'squat-barre', score: 136.17, charge_kg: 210 });
    const suivre = (a, b) => {
      f.appeler(a, 'POST', 'abonnements', { suiveur: a, suivi: b });
      f.appeler(b, 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.' + a + '&suivi=eq.' + b);
    };
    return { f, suivre };
  }
  test('DISCRIMINANT — à sens unique : rien de l’étage 2 ; mutuel : ses exercices, ses séries, la période, son score', () => {
    const { f, suivre } = decor2();
    const j = new Date().toISOString().slice(0, 10), de = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    suivre('u-moi', 'u-jordan');
    expect(f.rpc('u-moi', 'social_exercices_ami', { p_user: 'u-jordan' })).toEqual([]);
    expect(f.rpc('u-moi', 'social_series_exercice', { p_user: 'u-jordan', p_slug: 'squat-barre' })).toEqual([]);
    expect(f.rpc('u-moi', 'social_periode', { p_user: 'u-jordan', p_de: de, p_a: j })).toEqual([]);
    expect(f.rpc('u-moi', 'social_scores_force', { p_slug: 'squat-barre' })).toEqual([]);
    suivre('u-jordan', 'u-moi');
    expect(f.rpc('u-moi', 'social_exercices_ami', { p_user: 'u-jordan' })).toEqual([{ exercise_slug: 'squat-barre', charge_max: 210, seances: 1 }]);
    expect(f.rpc('u-moi', 'social_series_exercice', { p_user: 'u-jordan', p_slug: 'squat-barre' }).map((x) => x.charge_kg)).toEqual([210, 180]);
    const p = Social.periodeDeLaBase(f.rpc('u-moi', 'social_periode', { p_user: 'u-jordan', p_de: de, p_a: j }));
    expect(p.total).toEqual({ seances: 1, series: 2, reps: 6, tonnage_kg: 1110 });
    expect(f.rpc('u-moi', 'social_scores_force', { p_slug: 'squat-barre' }).map((x) => x.pseudo)).toEqual(['jordan']);
    expect(f.etat.fuites).toEqual([]);
  });
  test('DISCRIMINANT — scores_force : on n’écrit que le sien, et un corps qui porte le poids de corps est refusé (une fuite)', () => {
    const { f } = decor2();
    expect(f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 90.57, charge_kg: 145 }]).status).toBe(201);
    expect(f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-jordan', exercise_slug: 'squat-barre', score: 1, charge_kg: 1 }]).status).toBe(403);
    expect(f.etat.fuites).toEqual([]);
    expect(f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 90, charge_kg: 145, poids_kg: 96.75 }]).status).toBe(400);
    expect(f.etat.fuites).toEqual([{ table: 'scores_force', champs: ['poids_kg'] }]);
    f.appeler('u-moi', 'DELETE', 'scores_force', null, 'user_id=eq.u-moi');
    expect(f.etat.scores.map((s) => s.user_id)).toEqual(['u-jordan']);
  });
});

describe('89 — le coach et les bilans ne lisent rien du social', () => {
  test('aucun module du coach ni des bilans ne nomme `THSocial` ni une fonction sociale de la base', () => {
    const fs = require('fs'), path = require('path');
    ['plan.js', 'moteur.js', 'palier.js', 'seance.js', 'bilan.js', 'semaine.js', 'parcours.js', 'reserve.js', 'generateur.js', 'jeu.js']
      .forEach((f) => {
        const src = fs.readFileSync(path.join(__dirname, '../../v2/js', f), 'utf8');
        expect([f, /THSocial|scores_force|social_[a-z]/.test(src)]).toEqual([f, false]);
      });
  });
});
