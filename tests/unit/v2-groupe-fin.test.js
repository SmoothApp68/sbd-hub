/** @jest-environment node */
//
// 106 — LE GROUPE DE SÉANCE : LA FIN, ET LE MESSAGE GARDÉ HORS LIGNE (décisions d'Aurélien du 15/10/2026, SOCIAL-V1
// §7.3, migration proposée v2_087).
//
// Trois couches, chacune discriminante :
//   · les règles pures de `social.js` (libre pour un autre groupe, la file des messages relue du cache) ;
//   · le texte même de la migration (les 45 minutes de la séance vivante, les 24 h, l'entretien au début de chaque
//     geste, SECURITY DEFINER, `search_path` figé, aucune politique, aucune fonction programmée) ;
//   · le faux serveur du banc (`faux-social.js`), qui imite v2_087 — un membre sorti lance un autre groupe pendant que
//     l'autre finit, le membre qui ne rouvre jamais l'app (45 min), les messages effacés à 24 h, le récap toujours
//     lisible depuis la séance.
//
// La mutation (b) du prompt 106 — « un membre dont la séance est finie ne peut pas rejoindre un autre groupe » — tombe
// sur les contrôles nommés « MUTATION (b) ». La mutation (a) — le message perdu au rechargement — est au banc (section
// `groupe`) : c'est l'app qui garde la file, pas la base.

process.env.TZ = 'Europe/Paris';

global.self = global;
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
require('../../v2/js/calendrier.js');
const Social = require('../../v2/js/social.js');
const FauxSocial = require('../banc/faux-social.js');

const MIGRATION = fs.readFileSync(path.join(__dirname, '../../v2-atelier/migrations-proposees/v2_087_groupe_fin.sql'), 'utf8');
const T0 = Date.parse('2026-10-15T18:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60000;
const HEURE = 60 * MIN;

describe('106 — social.js : libre pour un autre groupe ; la file des messages gardés', () => {
  const membre = (o) => Object.assign({ moi: true, session_id: 's-1', statut: 'en_cours', debut: iso(T0 - 30 * MIN), derniere: iso(T0 - 2 * MIN),
    entre_le: iso(T0 - 30 * MIN) }, o);
  test('sans place : libre ; ma séance du groupe en cours : pas libre (même immobile) ; une AUTRE séance en cours : libre', () => {
    expect(Social.libreDuGroupe([], 's-1', iso(T0))).toBe(true);
    expect(Social.libreDuGroupe([membre({ moi: false })], 's-1', iso(T0))).toBe(true);
    expect(Social.libreDuGroupe([membre()], 's-1', iso(T0))).toBe(false);
    expect(Social.libreDuGroupe([membre({ derniere: iso(T0 - 50 * MIN) })], 's-1', iso(T0))).toBe(false);
    expect(Social.libreDuGroupe([membre()], 's-2', iso(T0))).toBe(true);
  });
  test('sans séance en cours : la règle de la séance vivante — terminée, ou 45 min sans série validée', () => {
    expect(Social.libreDuGroupe([membre()], null, iso(T0))).toBe(false);
    expect(Social.libreDuGroupe([membre({ statut: 'terminee' })], null, iso(T0))).toBe(true);
    expect(Social.libreDuGroupe([membre()], null, iso(T0 + 42 * MIN))).toBe(false);
    expect(Social.libreDuGroupe([membre()], null, iso(T0 + 43 * MIN))).toBe(true);
  });
  test('la file relue du cache : seulement des entrées complètes ; un cache abîmé ne casse rien', () => {
    const bon = { id: 'm-1', groupe_id: 'g-1', texte: 'On y va ?', le: iso(T0) };
    expect(Social.fileDeMessages([bon, null, { id: 'm-2', texte: 'sans groupe' }, { id: 'm-3', groupe_id: 'g-1', texte: '  ' },
      { id: 'm-4', groupe_id: 'g-1', texte: 'x'.repeat(141) }, { groupe_id: 'g-1', texte: 'sans id' }])).toEqual([bon]);
    expect(Social.fileDeMessages(null)).toEqual([]);
    expect(Social.fileDeMessages('abîmé')).toEqual([]);
    expect(Social.fileDeMessages({ id: 'm-1' })).toEqual([]);
  });
  test('« N messages partiront au retour du réseau. » — ceux de CE groupe seulement', () => {
    const file = [{ id: 'a', groupe_id: 'g-1', texte: 'a' }, { id: 'b', groupe_id: 'g-2', texte: 'b' }, { id: 'c', groupe_id: 'g-1', texte: 'c' }];
    expect(Social.texteEnAttente(file, 'g-1')).toBe('2 messages partiront au retour du réseau.');
    expect(Social.texteEnAttente(file, 'g-2')).toBe('1 message partira au retour du réseau.');
    expect(Social.texteEnAttente(file, 'g-3')).toBeNull();
    expect(Social.texteEnAttente([], 'g-1')).toBeNull();
  });
});

describe('106 — la migration v2_087 (texte)', () => {
  const fonctions = MIGRATION.split(/CREATE (?:OR REPLACE )?FUNCTION /).slice(1);
  const corps = (nom) => fonctions.filter((f) => f.split('(')[0] === 'public.' + nom)[0] || '';
  test('SECURITY DEFINER et search_path figé partout ; anon révoqué ; aucune politique ; aucune fonction programmée', () => {
    expect(fonctions.length).toBeGreaterThan(20);
    fonctions.forEach((f) => {
      const nom = f.split('(')[0];
      const tete = f.split('AS $f$')[0];
      expect([nom, /SET search_path = public/.test(tete), /SECURITY DEFINER/.test(tete)]).toEqual([nom, true, true]);
    });
    expect(MIGRATION).not.toMatch(/CREATE POLICY|ALTER POLICY|DISABLE ROW LEVEL SECURITY/);
    // Ni cron, ni Edge Function, ni appel réseau : l'effacement à 24 h se fait à la lecture ou à l'écriture suivante.
    expect(MIGRATION).not.toMatch(/pg_cron|cron\.schedule|net\.http|pg_net|http_post/i);
    expect(MIGRATION).toMatch(/FROM PUBLIC, anon;/);
    expect(MIGRATION).toMatch(/groupe_entretien\(\), public\.groupe_liberer\(uuid\) FROM PUBLIC, anon, authenticated;/);
    // L'index « un groupe à la fois » reste : on ferme ma place, on ne relâche pas la garantie.
    expect(MIGRATION).not.toMatch(/DROP INDEX/);
    const rendues = (MIGRATION.match(/RETURNS TABLE\(([^)]*)\)/g) || []).join(' ');
    ['poids_corps_kg', 'note', 'rpe', 'ressenti', 'douleur'].forEach((k) => expect(rendues).not.toMatch(new RegExp('\\b' + k + '\\b')));
  });
  test('les 45 minutes sont celles de la séance vivante (app, faux serveur, base) ; les 24 h, celles du faux serveur', () => {
    expect(Seance.MINUTES_VIVANTE).toBe(45);
    expect(FauxSocial.GROUPE.MINUTES_FIN).toBe(Seance.MINUTES_VIVANTE);
    expect(corps('groupe_fin_de_seance')).toMatch(new RegExp("now\\(\\) - x\\.activite >= interval '" + Seance.MINUTES_VIVANTE + " minutes' " +
      "THEN x\\.activite \\+ interval '" + Seance.MINUTES_VIVANTE + " minutes'"));
    expect(corps('groupe_fin_de_seance')).toMatch(/WHEN s\.statut = 'terminee' THEN coalesce\(s\.fin, x\.activite\)/);
    expect(FauxSocial.GROUPE.HEURES_MESSAGES).toBe(24);
    expect(corps('groupe_entretien')).toMatch(/g\.fini_le <= now\(\) - interval '24 hours'/);
    expect(corps('groupe_envoyer')).toMatch(/fini_le <= now\(\) - interval '24 hours'/);
  });
  test('CHAQUE lecture et CHAQUE écriture du groupe commence par l’entretien ; les lectures sont VOLATILE', () => {
    const gestes = ['groupe_creer', 'groupe_inviter', 'groupe_annuler_invitation', 'groupe_repondre', 'groupe_quitter', 'groupe_publier',
      'groupe_envoyer', 'groupe_fermer'];
    const lectures = ['groupe_moi', 'groupe_etat', 'groupe_direct', 'groupe_messages_lire', 'groupe_invitations_recues',
      'groupe_invitations_envoyees', 'groupe_recap', 'groupe_recap_seance'];
    gestes.concat(lectures).forEach((nom) => expect([nom, /groupe_entretien\(\)/.test(corps(nom))]).toEqual([nom, true]));
    lectures.forEach((nom) => expect([nom, /VOLATILE/.test(corps(nom).split('AS $f$')[0])]).toEqual([nom, true]));
    // Lancer et rejoindre ferment ma place précédente si MA séance y est finie, sinon refus.
    expect(corps('groupe_creer')).toMatch(/PERFORM groupe_liberer\(auth\.uid\(\)\)/);
    expect(corps('groupe_repondre')).toMatch(/PERFORM groupe_liberer\(auth\.uid\(\)\)/);
    expect(corps('groupe_liberer')).toMatch(/IF groupe_fin_de_seance\(g, p_user\) IS NULL THEN\s+RAISE EXCEPTION 'groupe_deja_dans_un'/);
    // On n'entre plus dans un groupe FINI ; l'extinction fige d'abord.
    expect(corps('groupe_membres_avant_ajout')).toMatch(/IF groupe_fini_le\(NEW\.groupe_id\) IS NOT NULL THEN\s+RAISE EXCEPTION 'groupe_eteint'/);
    expect(corps('groupe_membres_apres')).toMatch(/PERFORM groupe_figer\(g\);\s+DELETE FROM groupes WHERE id = g;/);
    // Le message : son groupe et son identifiant ; l'ancienne signature remplacée.
    expect(MIGRATION).toMatch(/DROP FUNCTION public\.groupe_envoyer\(text\);/);
    expect(MIGRATION).toMatch(/groupe_envoyer\(p_texte text, p_groupe uuid DEFAULT NULL, p_id uuid DEFAULT NULL\)/);
    expect(corps('groupe_envoyer')).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });
});

describe('106 — le faux serveur imite v2_087', () => {
  function decor() {
    let maintenant = T0;
    const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], sessions: [], sets: [], records: [] };
    const f = FauxSocial.creer(base, { moi: 'u-moi', maintenant: () => new Date(maintenant) });
    f.avancer = (ms) => { maintenant += ms; };
    f.maintenant = () => maintenant;
    f.base = base;
    ['jordan', 'lea', 'alexis', 'm1', 'm2', 'm3', 'm4'].forEach((p) =>
      f.etat.profils.push({ id: 'u-' + p, username: p, compte_prive: true, jeu_actif: true, jeu_niveau: 3 }));
    const ab = (a, b) => f.etat.abonnements.push({ suiveur: a, suivi: b, statut: 'accepte' });
    const tous = ['moi', 'jordan', 'lea', 'alexis', 'm1', 'm2', 'm3', 'm4'];
    tous.forEach((a) => tous.forEach((b) => { if (a !== b) ab('u-' + a, 'u-' + b); }));
    base.sessions.push({ id: 's-moi', user_id: 'u-moi', debut: iso(T0 - 30 * MIN), statut: 'en_cours' });
    ['jordan', 'lea', 'alexis', 'm1', 'm2', 'm3', 'm4'].forEach((p) =>
      f.etat.sessions.push({ id: 's-' + p, user_id: 'u-' + p, debut: iso(T0 - 20 * MIN), statut: 'en_cours' }));
    // jordan a une série il y a 2 min.
    f.etat.sets.push({ id: 't-j1', session_id: 's-jordan', user_id: 'u-jordan', exercise_slug: 'squat-barre', charge_kg: 180, reps: 3,
      type_serie: 'travail', validee_a: iso(T0 - 2 * MIN) });
    return f;
  }
  const refus = (r) => (r && r.code ? r.message : null);
  const session = (f, id) => f.base.sessions.concat(f.etat.sessions).filter((s) => s.id === id)[0];
  const terminer = (f, id) => { const s = session(f, id); s.statut = 'terminee'; s.fin = iso(f.maintenant()); };
  const nouvelle = (f, id, user) => f.base.sessions.push({ id, user_id: user, debut: iso(f.maintenant()), statut: 'en_cours' });
  // moi lance G1 depuis s-moi ; jordan rejoint.
  const g1 = (f) => {
    f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi', p_exercices: ['squat-barre'] });
    const g = f.groupeDe('u-moi');
    f.rpc('u-moi', 'groupe_inviter', { p_user: 'u-jordan' });
    f.rpc('u-jordan', 'groupe_repondre', { p_groupe: g, p_rejoindre: true, p_session: 's-jordan', p_exercices: [] });
    return g;
  };
  const fiche = (f, gid, u) => f.etat.gmembres.filter((m) => m.groupe_id === gid && m.user_id === u)[0];

  test('ma séance du groupe VIVANTE : pas d’autre groupe (groupe_deja_dans_un)', () => {
    const f = decor();
    const g = g1(f);
    nouvelle(f, 's-moi-2', 'u-moi');
    expect(refus(f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi-2', p_exercices: [] }))).toMatch(/groupe_deja_dans_un/);
    expect(f.groupeDe('u-moi')).toBe(g);
    expect(fiche(f, g, 'u-moi').ferme).toBe(false);
  });

  test('MUTATION (b) — membre sorti : MA séance finie, je lance un nouveau groupe pendant que jordan finit ; G1 vit pour lui', () => {
    const f = decor();
    const g = g1(f);
    terminer(f, 's-moi');
    f.rpc('u-moi', 'groupe_publier', { p_exercices: null, p_xp: 120 });
    nouvelle(f, 's-moi-2', 'u-moi');
    const r = f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi-2', p_exercices: ['dc-barre'] });
    expect(refus(r)).toBeNull();
    const g2 = f.groupeDe('u-moi');
    expect(g2).not.toBe(g);
    expect(fiche(f, g, 'u-moi').ferme).toBe(true);
    expect(f.finiLe(g)).toBeNull();
    // jordan s'entraîne encore dans G1 : il y voit ma séance finie, sa place est ouverte, et lea peut encore entrer.
    expect(f.groupeDe('u-jordan')).toBe(g);
    expect(f.rpc('u-jordan', 'groupe_etat').map((m) => m.pseudo + ':' + m.statut + ':' + m.ferme)).toEqual(['moi:terminee:true', 'jordan:en_cours:false']);
    f.rpc('u-jordan', 'groupe_inviter', { p_user: 'u-lea' });
    expect(refus(f.rpc('u-lea', 'groupe_repondre', { p_groupe: g, p_rejoindre: true, p_session: 's-lea', p_exercices: [] }))).toBeNull();
    // Le détail de ma séance finie : « Faite en groupe avec jordan, lea », déjà (le récap du moment).
    const r1 = f.rpc('u-moi', 'groupe_recap_seance', { p_session: 's-moi' });
    expect(Social.faiteEnGroupeAvec(r1[0].recap.membres)).toBe('Faite en groupe avec jordan, lea');
  });

  test('MUTATION (b) — … et je REJOINS un autre groupe (invitation de lea) sans attendre jordan', () => {
    const f = decor();
    const g = g1(f);
    f.rpc('u-lea', 'groupe_creer', { p_session: 's-lea', p_exercices: [] });
    const g3 = f.groupeDe('u-lea');
    f.rpc('u-lea', 'groupe_inviter', { p_user: 'u-moi' });
    nouvelle(f, 's-moi-2', 'u-moi');
    // Ma séance de G1 encore vivante : refus, et RIEN ne change (un refus annule tout, comme une transaction).
    expect(refus(f.rpc('u-moi', 'groupe_repondre', { p_groupe: g3, p_rejoindre: true, p_session: 's-moi-2', p_exercices: [] })))
      .toMatch(/groupe_deja_dans_un/);
    terminer(f, 's-moi');
    expect(refus(f.rpc('u-moi', 'groupe_repondre', { p_groupe: g3, p_rejoindre: true, p_session: 's-moi-2', p_exercices: [] }))).toBeNull();
    expect(f.groupeDe('u-moi')).toBe(g3);
    expect(f.groupeDe('u-jordan')).toBe(g);
  });

  test('un refus annule tout : ma place de G1 reste ouverte si le groupe visé est plein', () => {
    const f = decor();
    const g = g1(f);
    f.rpc('u-lea', 'groupe_creer', { p_session: 's-lea', p_exercices: [] });
    const g3 = f.groupeDe('u-lea');
    f.rpc('u-lea', 'groupe_inviter', { p_user: 'u-moi' });
    ['alexis', 'm1', 'm2', 'm3', 'm4'].forEach((p) => {
      f.rpc('u-lea', 'groupe_inviter', { p_user: 'u-' + p });
      f.rpc('u-' + p, 'groupe_repondre', { p_groupe: g3, p_rejoindre: true, p_session: 's-' + p, p_exercices: [] });
    });
    terminer(f, 's-moi');
    nouvelle(f, 's-moi-2', 'u-moi');
    expect(refus(f.rpc('u-moi', 'groupe_repondre', { p_groupe: g3, p_rejoindre: true, p_session: 's-moi-2', p_exercices: [] }))).toMatch(/groupe_plein/);
    expect(f.groupeDe('u-moi')).toBe(g);
    expect(fiche(f, g, 'u-moi').ferme).toBe(false);
  });

  test('le membre qui ne rouvre JAMAIS l’app : 45 min sans série, il compte comme terminé ; le geste de n’importe qui finit le groupe', () => {
    const f = decor();
    const g = g1(f);
    f.rpc('u-jordan', 'groupe_envoyer', { p_texte: 'Dernière série !' });
    f.rpc('u-jordan', 'groupe_inviter', { p_user: 'u-alexis' });
    terminer(f, 's-moi');
    // jordan : sa dernière série à T0 - 2 min. À T0 + 42 min (44 min), il vit ; à T0 + 43 min (45 min), il est terminé.
    f.avancer(42 * MIN);
    f.rpc('u-lea', 'groupe_moi');
    expect(f.finiLe(g)).toBeNull();
    expect(Social.groupeFini(f.rpc('u-moi', 'groupe_etat'), iso(f.maintenant()))).toBe(false);
    f.avancer(MIN);
    // La même règle, au même instant, dans l'app (sur les faits de `groupe_etat`) et dans la base.
    expect(Social.groupeFini(f.rpc('u-moi', 'groupe_etat'), iso(f.maintenant()))).toBe(true);
    // lea n'est pas membre : son geste entretient quand même G1.
    f.rpc('u-lea', 'groupe_moi');
    const groupe = f.etat.groupes.filter((x) => x.id === g)[0];
    expect(groupe.fini_le).toBe(iso(T0 + 43 * MIN));
    // Rien n'est figé à la fin même (une XP un peu en retard compte encore) : le récap se lit tel qu'il est.
    expect(f.etat.grecaps).toEqual([]);
    expect(Social.faiteEnGroupeAvec(f.rpc('u-moi', 'groupe_recap_seance', { p_session: 's-moi' })[0].recap.membres))
      .toBe('Faite en groupe avec jordan');
    // Une fois posée, la fin ne bouge plus : jordan revient et valide une série, le groupe reste fini.
    f.etat.sets.push({ id: 't-j2', session_id: 's-jordan', user_id: 'u-jordan', exercise_slug: 'squat-barre', charge_kg: 180, reps: 2,
      type_serie: 'travail', validee_a: iso(f.maintenant()) });
    f.rpc('u-jordan', 'groupe_moi');
    expect(f.finiLe(g)).toBe(iso(T0 + 43 * MIN));
    expect(f.etat.ginvitations.filter((i) => i.groupe_id === g)).toEqual([]);
    expect(f.rpc('u-alexis', 'groupe_invitations_recues')).toEqual([]);
    // On n'entre plus dans un groupe fini.
    f.etat.ginvitations.push({ groupe_id: g, invite: 'u-alexis', invitant: 'u-jordan', cree_le: 0 });
    expect(refus(f.rpc('u-alexis', 'groupe_repondre', { p_groupe: g, p_rejoindre: true, p_session: 's-alexis', p_exercices: [] })))
      .toMatch(/groupe_eteint|groupe_sans_invitation/);
    // Les messages restent (moins de 24 h).
    expect(f.etat.gmessages.filter((x) => x.groupe_id === g).length).toBe(1);
  });

  test('les messages s’effacent 24 h après la fin du groupe — à la lecture suivante ; plus aucun n’entre', () => {
    const f = decor();
    const g = g1(f);
    f.rpc('u-jordan', 'groupe_envoyer', { p_texte: 'Dernière série !' });
    f.rpc('u-moi', 'groupe_envoyer', { p_texte: '🔥' });
    terminer(f, 's-moi');
    terminer(f, 's-jordan');
    f.rpc('u-moi', 'groupe_moi');
    const fin = Date.parse(f.etat.groupes.filter((x) => x.id === g)[0].fini_le);
    expect(fin).toBe(T0);
    f.avancer(24 * HEURE - MIN);
    expect(f.rpc('u-jordan', 'groupe_messages_lire').map((m) => m.texte)).toEqual(['Dernière série !', '🔥']);
    f.avancer(MIN);
    expect(refus(f.rpc('u-jordan', 'groupe_envoyer', { p_texte: 'trop tard' }))).toMatch(/groupe_eteint/);
    expect(f.rpc('u-jordan', 'groupe_messages_lire')).toEqual([]);
    expect(f.etat.gmessages).toEqual([]);
    // Le groupe reste pour qui n'a pas fermé ; le récap aussi.
    expect(f.groupeDe('u-jordan')).toBe(g);
    expect(f.rpc('u-moi', 'groupe_recap_seance', { p_session: 's-moi' })[0].recap.membres.length).toBe(2);
  });

  test('le récap reste lisible depuis la séance après la fin — et après l’extinction, figé pour qui était parti ailleurs', () => {
    const f = decor();
    const g = g1(f);
    f.rpc('u-moi', 'groupe_publier', { p_exercices: null, p_xp: 120 });
    terminer(f, 's-moi');
    // Je pars vers un autre groupe sans fermer celui-ci ; jordan finit, publie son XP APRÈS la fin : elle compte.
    nouvelle(f, 's-moi-2', 'u-moi');
    f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi-2', p_exercices: [] });
    terminer(f, 's-jordan');
    f.rpc('u-jordan', 'groupe_moi');
    expect(f.finiLe(g)).toBeTruthy();
    f.rpc('u-jordan', 'groupe_publier', { p_exercices: null, p_xp: 300 });
    f.rpc('u-jordan', 'groupe_fermer');
    expect(f.etat.groupes.filter((x) => x.id === g)).toEqual([]);
    const r = f.rpc('u-moi', 'groupe_recap_seance', { p_session: 's-moi' });
    expect(r.length).toBe(1);
    expect(Social.faiteEnGroupeAvec(r[0].recap.membres)).toBe('Faite en groupe avec jordan');
    expect(r[0].recap.membres.map((m) => m.pseudo + ':' + m.xp)).toEqual(['moi:120', 'jordan:300']);
    expect(f.etat.grecaps.filter((x) => x.groupe_id === g).map((x) => x.user_id).sort()).toEqual(['u-jordan', 'u-moi']);
    expect(f.rpc('u-jordan', 'groupe_recap_seance', { p_session: 's-moi' })).toEqual([]);
    expect(g).toBeTruthy();
  });

  test('le message gardé : une seule fois (son identifiant), et jamais dans un autre groupe', () => {
    const f = decor();
    const g = g1(f);
    expect(refus(f.rpc('u-moi', 'groupe_envoyer', { p_texte: 'On y va ?', p_groupe: g, p_id: 'gm-tel-1' }))).toBeNull();
    expect(refus(f.rpc('u-moi', 'groupe_envoyer', { p_texte: 'On y va ?', p_groupe: g, p_id: 'gm-tel-1' }))).toBeNull();
    expect(f.rpc('u-jordan', 'groupe_messages_lire').map((m) => m.texte)).toEqual(['On y va ?']);
    // Écrit pour G1, gardé, puis je suis passé à G2 : il ne part pas dans G2.
    terminer(f, 's-moi');
    nouvelle(f, 's-moi-2', 'u-moi');
    f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi-2', p_exercices: [] });
    expect(refus(f.rpc('u-moi', 'groupe_envoyer', { p_texte: 'Pour G1', p_groupe: g, p_id: 'gm-tel-2' }))).toMatch(/groupe_pas_membre/);
    expect(f.etat.gmessages.map((m) => m.texte)).toEqual(['On y va ?']);
  });
});
