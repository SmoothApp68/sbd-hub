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
      { set_id: 's1', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'squat-barre', type: 'charge_max', valeur: 80 },
      { set_id: 's1', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'squat-barre', type: 'charge_a_reps', valeur: 80, reps: 5 },
      { set_id: 's2', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'hip-thrust', type: 'reps_a_charge', valeur: 8, charge: 100 }]);
    expect(m.map((x) => [x.serieId, x.mesure])).toEqual([['s1', '80 kg × 5'], ['s2', '100 kg × 8']]);
    expect(m[0].types).toEqual(['charge_a_reps', 'charge_max']);
    expect(m[0].nom).toMatch(/^Squat/);
  });
  // 120 (D1, audit 05 #2) — « La force estimée […] sort des records, des médailles, du fil et de l'XP. » Les lignes
  // `un_rm_estime` écrites avant restent en base (immuables) : le fil les ignore. Une série médaillée par la seule
  // estimation n'a plus de médaille (« 1 record » dans le fil des abonnés).
  test('⚠️ DISCRIMINANT — une ligne `un_rm_estime` n’est pas une médaille ; seule, la série n’en a pas', () => {
    const m = faits.medaillesDuSocial(c, [
      { set_id: 's1', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'squat-barre', type: 'un_rm_estime', valeur: 133.3 },
      { set_id: 's2', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'squat-barre', type: 'un_rm_estime', valeur: 93 },
      { set_id: 's2', battu_le: '2026-10-11T10:00:00Z', exercise_slug: 'squat-barre', type: 'charge_a_reps', valeur: 80, reps: 5 }]);
    expect(m.map((x) => [x.serieId, x.types])).toEqual([['s2', ['charge_a_reps']]]);
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
    expect(Social.scoresAPublier({ 'squat-barre': 100 }, null, 'homme', () => true, 0)).toBeNull();
    expect(Social.scoresAPublier({ 'squat-barre': 100 }, 80, 'non_precise', () => true, 0)).toBeNull();
  });
  test('114 — ce qui part : le score sur le poids FLOUTÉ, par exercice à la barre — ni le poids, ni la charge', () => {
    // 96,75 kg + décalage 0 → 100 ; + décalage −2 → 94,75 → 90.
    const s = Social.scoresAPublier({ 'squat-barre': 145, 'curl-haltere': 20 }, 96.75, 'homme', (k) => k === 'squat-barre', 0);
    expect(s).toEqual([{ exercise_slug: 'squat-barre', score: Social.scoreDots(145, 100, 'homme') }]);
    expect(s[0].score).not.toBe(Social.scoreDots(145, 96.75, 'homme'));
    expect(Social.scoresAPublier({ 'squat-barre': 145 }, 96.75, 'homme', () => true, -2)[0].score)
      .toBe(Social.scoreDots(145, 90, 'homme'));
    expect(JSON.stringify(s)).not.toMatch(/96\.75|poids|charge|145/);
    expect(Social.scoresChanges(s, { 'squat-barre': { score: s[0].score } })).toEqual([]);
    expect(Social.scoresChanges(s, {}).length).toBe(1);
  });
  test('114 — sans décalage valide (pas de stockage sur l’appareil) : rien ne part', () => {
    [undefined, null, '', 'abc', 5, -5.01, NaN, true].forEach((d) => {
      expect(Social.scoresAPublier({ 'squat-barre': 145 }, 96.75, 'homme', () => true, d)).toBeNull();
    });
    expect(Social.decalageValide(-5)).toBe(true);
    expect(Social.decalageValide('4.99')).toBe(true);
    expect(Social.decalageDepuis(0)).toBe(-5);
    expect(Social.decalageDepuis(0.999999)).toBeLessThan(5);
    expect(Social.decalageDepuis(1)).toBeNull();
  });
  test('« à la barre » : l’équipement du catalogue', () => {
    expect(Social.aLaBarre({ equipement: 'barre', mesure: 'charge_reps' })).toBe(true);
    expect(Social.aLaBarre({ equipement: 'halteres', mesure: 'charge_reps' })).toBe(false);
    expect(Social.aLaBarre(undefined)).toBe(false);
  });
});

// ══ 114 — LE POIDS NE QUITTE JAMAIS LE TÉLÉPHONE (audit du 16/10/2026, P0) ═══════════════════════════════════════
//
// L'ATTAQUE, refaite ici : un mutuel lit mon score (`social_scores_force`) et voit mes charges (mes séances). Il
// cherche tous les poids de corps compatibles avec ce qu'il voit. Décision d'Aurélien : « aucun mutuel ne peut
// déduire le poids de corps à mieux que ±5 kg » — l'ensemble des poids compatibles doit donc couvrir au moins 10 kg.
//
// ⚠️ CONFIGURATIONS DISCRIMINANTES :
//   · l'attaque marche sur l'ancien score (DOTS sur la pesée) : poids retrouvé au centième ;
//   · plusieurs exercices à la fois (le « vernier » : chaque arrondi de score réduirait l'intervalle, leur
//     intersection le réduirait encore — un score simplement arrondi ne tiendrait pas) ;
//   · dans le temps : le mutuel voit le score CHANGER entre deux pesées. Avec des bornes fixes (décalage connu, 0),
//     il sait que la pesée vient de passer 95 kg, à 0,1 kg près ; avec le décalage secret, à une dizaine près.
describe('114 — un mutuel ne retrouve pas le poids de corps à mieux que ±5 kg', () => {
  const PAS = 0.1, DELTAS = [];
  for (let d = -5; d < 5 - 1e-9; d += 0.1) DELTAS.push(Math.round(d * 10) / 10);
  const CHARGES = { 'squat-barre': 145, 'dc-barre': 102.5, 'sdt-barre': 187.5, 'dm-barre': 61 };
  const aLaBarre = () => true;
  // Ce que le mutuel voit : mes scores publiés (et mes charges, dans mes séances). L'attaque essaie des centaines de
  // milliers de (poids, décalage) : pour aller vite, elle retient chaque réponse de `scoresAPublier` par son poids
  // rond — le test « la réponse ne dépend que du poids rond », plus bas, le vérifie sur toute la grille.
  const direct = (poids, sexe, d) => Social.scoresAPublier(CHARGES, poids, sexe, aLaBarre, d);
  const memo = {};
  const publie = (poids, sexe, d) => {
    const k = sexe + '|' + Social.poidsFloute(poids, d);
    return k in memo ? memo[k] : (memo[k] = direct(poids, sexe, d));
  };
  const egal = (a, b) => a && b && a.length === b.length && a.every((x, i) => x.exercise_slug === b[i].exercise_slug && x.score === b[i].score);
  // L'attaque : tous les poids (35 à 165 kg, au dixième) et tous les décalages qui redonnent EXACTEMENT ce qu'il voit.
  const poidsCompatibles = (vu, sexe, deltas) => {
    const out = [];
    for (let w = 35; w <= 165 + 1e-9; w += PAS) {
      const p = Math.round(w * 10) / 10;
      if (deltas.some((d) => egal(publie(p, sexe, d), vu))) out.push(p);
    }
    return out;
  };
  const etendue = (l) => Math.round((Math.max.apply(null, l) - Math.min.apply(null, l)) * 10) / 10;

  test('AVANT (le score sur la pesée, tel que v2_079) : un score et sa charge redonnent le poids au centième', () => {
    [[96.75, 'homme', 145], [98.4, 'homme', 170], [65, 'femme', 60], [58.7, 'femme', 80]].forEach(([poids, sexe, charge]) => {
      const score = Social.scoreDots(charge, poids, sexe);
      const trouves = [];
      for (let w = 40; w <= 150; w += 0.01) if (Social.scoreDots(charge, Math.round(w * 100) / 100, sexe) === score) trouves.push(w);
      expect(trouves.length).toBeGreaterThan(0);
      expect(Math.max(...trouves.map((w) => Math.abs(w - poids)))).toBeLessThan(0.05);
    });
  });

  test('APRÈS : de 45 à 150 kg, homme et femme, quatre exercices vus ensemble — les poids compatibles couvrent ≥ 10 kg', () => {
    // Ce que le mutuel voit ne dépend que du poids rond : on fait l'attaque une fois par poids rond observé.
    const parRond = {};
    let pire = Infinity, cas = 0;
    ['homme', 'femme'].forEach((sexe) => {
      for (let w = 45; w <= 150 + 1e-9; w += 0.5) {
        [-5, -2.5, 0, 2.5, 4.9].forEach((d) => {
          const vu = publie(w, sexe, d);
          const cle = sexe + '|' + Social.poidsFloute(w, d);
          if (!parRond[cle]) parRond[cle] = poidsCompatibles(vu, sexe, DELTAS);
          const l = parRond[cle];
          expect(l).toContain(Math.round(w * 10) / 10);           // le vrai poids est bien dans l'ensemble
          pire = Math.min(pire, etendue(l));
          cas++;
        });
      }
    });
    expect(cas).toBe(2 * 211 * 5);
    expect(pire).toBeGreaterThanOrEqual(10);                       // ±5 kg au mieux, partout
  });

  test('APRÈS, dans le temps : voir le score changer entre deux pesées ne situe pas la pesée à mieux que ±5 kg', () => {
    // Une pesée qui monte de 80 à 120 kg, d'un dixième à la fois, avec le même décalage secret. À chaque changement
    // du score, le mutuel cherche les poids compatibles avec la pesée d'avant ET celle d'après (même décalage).
    const auChangement = (deltasPossibles, dVrai) => {
      let pire = Infinity, changements = 0;
      for (let w = 80.1; w <= 120 + 1e-9; w += PAS) {
        const apres = Math.round(w * 10) / 10, avant = Math.round((apres - PAS) * 10) / 10;
        const vuAvant = publie(avant, 'homme', dVrai), vuApres = publie(apres, 'homme', dVrai);
        if (egal(vuAvant, vuApres)) continue;
        changements++;
        const l = [];
        for (let x = 70; x <= 130 + 1e-9; x += PAS) {
          const p = Math.round(x * 10) / 10, q = Math.round((p - PAS) * 10) / 10;
          if (deltasPossibles.some((d) => egal(publie(q, 'homme', d), vuAvant) && egal(publie(p, 'homme', d), vuApres))) l.push(p);
        }
        expect(l).toContain(apres);
        pire = Math.min(pire, etendue(l));
      }
      return { pire, changements };
    };
    // Bornes fixes (le décalage connu de tous, 0) : le changement trahit la pesée au dixième — c'est ce qu'on évite.
    const fixe = auChangement([0], 0);
    expect(fixe.changements).toBe(4);
    expect(fixe.pire).toBeLessThan(0.5);
    // Décalage secret : la borne franchie peut être n'importe où dans une dizaine.
    [-4.3, 0, 3.7].forEach((dVrai) => {
      const r = auChangement(DELTAS, dVrai);
      expect(r.changements).toBeGreaterThanOrEqual(3);
      expect(r.pire).toBeGreaterThanOrEqual(9.9);                  // une dizaine, au dixième de la grille près
    });
  });

  test('ce qui part ne dépend que du sexe et du poids rond (pas de la pesée elle-même) — la réponse retenue par l’attaque est la vraie', () => {
    let vus = 0;
    ['homme', 'femme'].forEach((sexe) => {
      for (let w = 45; w <= 150; w += 0.7) [-5, -1.3, 0, 3.3, 4.9].forEach((d) => {
        expect(direct(w, sexe, d)).toEqual(publie(w, sexe, d));
        expect(direct(w, sexe, d)).toEqual(direct(Social.poidsFloute(w, d), sexe, 0));
        vus++;
      });
    });
    expect(vus).toBeGreaterThan(1000);
  });

  test('le poids flouté : la pesée + le décalage, arrondie à la dizaine ; jamais à plus de 10 kg de la pesée', () => {
    expect(Social.poidsFloute(96.75, 0)).toBe(100);
    expect(Social.poidsFloute(94.99, 0)).toBe(90);
    expect(Social.poidsFloute(95, 0)).toBe(100);
    expect(Social.poidsFloute(96.75, -1.75)).toBe(100);
    expect(Social.poidsFloute(96.75, -1.76)).toBe(90);
    expect(Social.poidsFloute(null, 0)).toBeNull();
    expect(Social.poidsFloute(80, 7)).toBeNull();
    for (let w = 45; w <= 150; w += 0.25) DELTAS.forEach((d) => {
      expect(Math.abs(Social.poidsFloute(w, d) - w)).toBeLessThan(10);
    });
  });
});

describe('89/114 — « Entre amis » : à poids de corps égal, les vrais kilos (12 mois), à partir de deux', () => {
  // Les scores tels que publiés depuis 114 (poids flouté, décalage 0 : 96,75 → 100, 89,5 → 90, 70 → 70), sans charge ;
  // les kilos des autres viennent de `social_meilleures_charges`, le mien de l'appareil.
  const ligne = (id, pseudo, charge, poids, moi) => ({ user_id: id, pseudo, score: Social.scoreDots(charge, Social.poidsFloute(poids, 0), 'homme'),
    charge_kg: null, moi: !!moi });
  test('DISCRIMINANT — couché à 140 chacun : Jordan (90 contre 100 kg flouté) premier, les kilos affichés sont les vrais', () => {
    const c = Social.classementEntreAmis([ligne('a', 'aurel', 140, 96.75, true), ligne('j', 'jordan', 140, 89.5)],
      [{ user_id: 'j', charge_max: 140 }], 140);
    expect(c.map((x) => x.pseudo)).toEqual(['jordan', 'aurel']);
    expect(c.map((x) => x.charge_kg)).toEqual([140, 140]);
    expect(c[1].moi).toBe(true);
  });
  test('squat : Jordan, alexis, moi — un plus léger qui soulève moins peut passer devant', () => {
    const c = Social.classementEntreAmis([ligne('x', 'alexis', 130, 70), ligne('a', 'aurel', 145, 96.75, true), ligne('j', 'jordan', 210, 89.5)],
      [{ user_id: 'x', charge_max: 130 }, { user_id: 'j', charge_max: 210 }], 145);
    expect(c.map((x) => x.pseudo)).toEqual(['jordan', 'alexis', 'aurel']);
    expect(c.map((x) => x.charge_kg)).toEqual([210, 130, 145]);
  });
  test('114 — avant v2_091 (la fonction des kilos manque : null) : rien ; sans kilos à montrer, une personne n’entre pas', () => {
    const l = [ligne('a', 'aurel', 145, 96.75, true), ligne('j', 'jordan', 210, 89.5)];
    expect(Social.classementEntreAmis(l, null, 145)).toBeNull();
    expect(Social.classementEntreAmis(l, [], 145)).toBeNull();                       // jordan sans séance visible sur 12 mois
    expect(Social.classementEntreAmis(l, [{ user_id: 'j', charge_max: 210 }], undefined)).toBeNull();   // moi sans charge sur 12 mois
    // La charge d'une ligne de la base (une vieille ligne) n'est jamais lue : seuls les kilos des séances comptent.
    const vieille = Object.assign(ligne('j', 'jordan', 210, 89.5), { charge_kg: 999 });
    expect(Social.classementEntreAmis([l[0], vieille], [{ user_id: 'j', charge_max: 210 }], 145)[0].charge_kg).toBe(210);
  });
  test('rien sous deux personnes avec un score', () => {
    expect(Social.classementEntreAmis([ligne('a', 'aurel', 145, 96.75, true)], [], 145)).toBeNull();
    expect(Social.classementEntreAmis([], [], 145)).toBeNull();
  });
  test('114 — « 12 mois » : du lendemain du même jour il y a un an, à aujourd’hui (la fenêtre de la base)', () => {
    expect(Social.bornesDouzeMois(new Date(2026, 9, 16, 12))).toEqual({ de: '2025-10-17', a: '2026-10-16' });
    expect(Social.bornesDouzeMois(new Date(2028, 1, 29, 12))).toEqual({ de: '2027-03-02', a: '2028-02-29' });
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
    f.etat.scores.push({ user_id: 'u-jordan', exercise_slug: 'squat-barre', score: 136.17, charge_kg: null });
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
    expect(f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 90.57 }]).status).toBe(201);
    expect(f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-jordan', exercise_slug: 'squat-barre', score: 1 }]).status).toBe(403);
    expect(f.etat.fuites).toEqual([]);
    expect(f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 90, poids_kg: 96.75 }]).status).toBe(400);
    expect(f.etat.fuites).toEqual([{ table: 'scores_force', champs: ['poids_kg'] }]);
    f.appeler('u-moi', 'DELETE', 'scores_force', null, 'user_id=eq.u-moi');
    expect(f.etat.scores.map((s) => s.user_id)).toEqual(['u-jordan']);
  });
  test('114 — DISCRIMINANT — v2_091 : la charge est refusée, et la fonction ne rend la charge de personne d’autre ; avant v2_091, elle est exigée', () => {
    const { f, suivre } = decor2();
    suivre('u-moi', 'u-jordan'); suivre('u-jordan', 'u-moi');
    // Après v2_091 (le faux serveur par défaut).
    const avecCharge = f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 86.17, charge_kg: 145 }]);
    expect([avecCharge.status, avecCharge.data.code]).toEqual([400, '23514']);
    expect(f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 86.17 }]).status).toBe(201);
    f.etat.scores.filter((x) => x.user_id === 'u-jordan')[0].charge_kg = 210;   // une vieille ligne : jamais rendue
    const apres = f.rpc('u-moi', 'social_scores_force', { p_slug: 'squat-barre' });
    expect(apres.filter((x) => !x.moi).map((x) => [x.pseudo, x.score, x.charge_kg])).toEqual([['jordan', 136.17, null]]);
    expect(apres.filter((x) => x.moi).map((x) => [x.score, x.charge_kg])).toEqual([[86.17, null]]);
    // Avant v2_091.
    f.etat.v2_091 = false;
    const sansCharge = f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 86.17 }]);
    expect([sansCharge.status, sansCharge.data.code]).toEqual([400, '23502']);
    expect(f.rpc('u-moi', 'social_scores_force', { p_slug: 'squat-barre' }).filter((x) => !x.moi)[0].charge_kg).toBe(210);
    expect(f.etat.fuites).toEqual([]);
  });
  test('114 — DISCRIMINANT — social_meilleures_charges : mutuels avec un score seulement, séances visibles, 12 mois ; avant v2_091, absente', () => {
    const { f, suivre } = decor2();
    const ilYa = (j) => new Date(Date.now() - j * 86400000).toISOString();
    // Une séance PRIVÉE plus lourde (250) et une séance d'il y a 400 jours (260) : ni l'une ni l'autre ne comptent.
    f.etat.sessions.push({ id: 'j-p', user_id: 'u-jordan', debut: ilYa(2), fin: ilYa(2), statut: 'terminee', visibilite: 'private' },
      { id: 'j-v', user_id: 'u-jordan', debut: ilYa(400), fin: ilYa(400), statut: 'terminee', visibilite: 'mutuels' });
    f.etat.sets.push({ id: 'jp', session_id: 'j-p', exercise_slug: 'squat-barre', rang: 1, charge_kg: 250, reps: 1, type_serie: 'travail' },
      { id: 'jv', session_id: 'j-v', exercise_slug: 'squat-barre', rang: 1, charge_kg: 260, reps: 1, type_serie: 'travail' });
    suivre('u-moi', 'u-jordan');
    expect(f.rpc('u-moi', 'social_meilleures_charges', { p_slug: 'squat-barre' })).toEqual([]);   // à sens unique : rien
    suivre('u-jordan', 'u-moi');
    expect(f.rpc('u-moi', 'social_meilleures_charges', { p_slug: 'squat-barre' })).toEqual([{ user_id: 'u-jordan', charge_max: 210 }]);
    // Ma ligne n'y est jamais ; sans score publié sur l'exercice, personne.
    f.appeler('u-moi', 'POST', 'scores_force', [{ user_id: 'u-moi', exercise_slug: 'squat-barre', score: 86.17 }]);
    expect(f.rpc('u-moi', 'social_meilleures_charges', { p_slug: 'squat-barre' }).map((x) => x.user_id)).toEqual(['u-jordan']);
    expect(f.rpc('u-moi', 'social_meilleures_charges', { p_slug: 'dc-barre' })).toEqual([]);
    f.etat.v2_091 = false;
    const r = f.appeler('u-moi', 'POST', 'rpc/social_meilleures_charges', { p_slug: 'squat-barre' });
    expect(r.data.code).toBe('PGRST202');
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
