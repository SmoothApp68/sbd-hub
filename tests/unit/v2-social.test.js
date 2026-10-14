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
