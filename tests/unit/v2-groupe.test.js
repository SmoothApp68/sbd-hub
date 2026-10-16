/** @jest-environment node */
//
// 91 — LE GROUPE DE SÉANCE (SOCIAL-V1 « Groupe », décisions du 14/10/2026, migration proposée v2_082).
//
// Trois couches, chacune discriminante :
//   · les règles pures de `social.js` (messages ≤ 140, pastilles et point vert à 3 min, « terminé » par la règle de la
//     séance vivante, les exercices ajoutés par celui qu'on suit, le récap sans classement) ;
//   · le faux serveur du banc (`faux-social.js`), qui imite v2_082 — 6 membres, mutuels seulement, un groupe à la fois,
//     aucun blocage entre membres, le direct et les messages réservés aux membres, le récap qui compte TOUTE la séance,
//     l'extinction qui efface les messages ;
//   · le texte même de la migration (SECURITY DEFINER, `search_path` figé, aucune politique, aucune colonne interdite).
//
// Les trois mutations du prompt 91 tombent sur un contrôle nommé « MUTATION (a|b|c) ».

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

const MIGRATION = fs.readFileSync(path.join(__dirname, '../../v2-atelier/migrations-proposees/v2_082_groupe.sql'), 'utf8');
const T0 = Date.parse('2026-10-14T18:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60000;

describe('91 — social.js : les règles du groupe', () => {
  test('un message : 1 à 140 caractères, espaces de bord retirés', () => {
    expect(Social.messageValide('  Dernière série !  ')).toBe('Dernière série !');
    expect(Social.messageValide('   ')).toBeNull();
    expect(Social.messageValide('x'.repeat(140))).toBe('x'.repeat(140));
    expect(Social.messageValide('x'.repeat(141))).toBeNull();
    // Les émojis comptent pour un caractère chacun (comme char_length en base).
    expect(Social.messageValide('🔥'.repeat(140))).not.toBeNull();
    expect(Social.MESSAGES_RAPIDES).toEqual(['On y va ?', 'Je commence', 'Dernière série !']);
    expect(Social.GROUPE_MAX).toBe(6);
    expect(Social.RAFRAICHIR_GROUPE_MS).toBe(20000);
  });

  test('« terminé » : la règle de la séance vivante (Seance.estVivante, 45 min sans série validée), réutilisée', () => {
    const m = (statut, derniere, debut) => ({ statut, derniere: derniere === null ? null : iso(derniere), debut: iso(debut), entre_le: iso(debut) });
    const maintenant = iso(T0);
    expect(Social.membreTermine(m('terminee', T0 - MIN, T0 - 60 * MIN), maintenant)).toBe(true);
    expect(Social.membreTermine(m('en_cours', T0 - 44 * MIN, T0 - 90 * MIN), maintenant)).toBe(false);
    expect(Social.membreTermine(m('en_cours', T0 - 45 * MIN, T0 - 90 * MIN), maintenant)).toBe(true);
    // Sans série : le début de la séance fait foi.
    expect(Social.membreTermine(m('en_cours', null, T0 - 10 * MIN), maintenant)).toBe(false);
    // La séance pas encore arrivée en base : « commencée à l'entrée dans le groupe ».
    expect(Social.membreTermine({ statut: null, derniere: null, debut: null, entre_le: iso(T0 - 5 * MIN) }, maintenant)).toBe(false);
    expect(Social.membreTermine({ statut: null, derniere: null, debut: null, entre_le: iso(T0 - 50 * MIN) }, maintenant)).toBe(true);
    // La même règle, au même seuil, que la séance vivante d'un autre appareil.
    expect(Seance.MINUTES_VIVANTE).toBe(45);
    const membres = [m('terminee', T0 - MIN, T0 - 60 * MIN), m('en_cours', T0 - 2 * MIN, T0 - 60 * MIN)];
    expect(Social.groupeFini(membres, maintenant)).toBe(false);
    expect(Social.groupeFini(membres, iso(T0 + 44 * MIN))).toBe(true);
  });

  test('les pastilles : une par membre (les autres, puis moi), point vert sous 3 min', () => {
    const membres = [
      { pseudo: 'moi', moi: true, derniere: iso(T0 - 10 * MIN) },
      { pseudo: 'jordan', moi: false, derniere: iso(T0 - 2 * MIN) },
      { pseudo: 'lea', moi: false, derniere: iso(T0 - 3 * MIN) }
    ];
    const p = Social.pastillesDuGroupe(membres, iso(T0), iso(T0 - MIN));
    expect(p.map((x) => x.pseudo + ':' + x.actif)).toEqual(['jordan:true', 'lea:false', 'moi:true']);
    expect(p[0].initiale).toBe('J');
  });

  test('le direct : les plus récentes d’abord, « il y a N min »', () => {
    const l = Social.lignesDuDirect([
      { pseudo: 'lea', exercise_slug: 'hip-thrust', charge_kg: 100, reps: 8, validee_a: iso(T0 - 20000) },
      { pseudo: 'jordan', exercise_slug: 'squat', charge_kg: 180, reps: 3, validee_a: iso(T0 - MIN) }
    ], iso(T0), (s) => s.toUpperCase(), (d) => d.charge_kg + ' kg × ' + d.reps);
    expect(l.map((x) => x.texte + ' · ' + x.quand)).toEqual(['lea · HIP-THRUST 100 kg × 8 · à l’instant', 'jordan · SQUAT 180 kg × 3 · il y a 1 min']);
  });

  test('« Suivre la séance de X » : les exercices ajoutés depuis la copie, proposés une fois', () => {
    expect(Social.exercicesAjoutes(['squat', 'presse'], ['squat', 'presse', 'leg-curl'], [])).toEqual(['leg-curl']);
    expect(Social.exercicesAjoutes(['squat', 'presse'], ['squat', 'presse', 'leg-curl'], ['leg-curl'])).toEqual([]);
    expect(Social.exercicesAjoutes(['squat'], ['squat'], [])).toEqual([]);
  });

  test('le récap du « combat » : le total et la part de chacun, dans l’ordre d’arrivée — ni classement ni vainqueur', () => {
    const r = Social.recapDuGroupe([
      { pseudo: 'moi', moi: true, tonnage_kg: 14200, series: 41, records: 2, xp: 400 },
      { pseudo: 'jordan', moi: false, tonnage_kg: 16800, series: 38, records: 3, xp: null },
      { pseudo: 'lea', moi: false, tonnage_kg: 7000, series: 33, records: 1, xp: 840 }
    ]);
    expect([r.tonnage_kg, r.series, r.records, r.xp]).toEqual([38000, 112, 6, 1240]);
    expect(r.membres.map((m) => m.pseudo)).toEqual(['moi', 'jordan', 'lea']);
    expect(Social.faiteEnGroupeAvec(r.membres)).toBe('Faite en groupe avec jordan, lea');
    expect(Social.partDe(r.membres[0], (kg) => (kg / 1000) + ' t')).toBe('14.2 t · 41 séries · 2 records');
    expect(Social.recapDuGroupe([{ pseudo: 'a', xp: null }]).xp).toBeNull();
    expect(Object.keys(Social).join(' ')).not.toMatch(/vainqueur|classementDuGroupe/i);
  });
});

describe('91 — la migration v2_082 (texte)', () => {
  test('SECURITY DEFINER et search_path figé partout ; anon révoqué ; aucune politique ; aucune colonne interdite rendue', () => {
    const fonctions = MIGRATION.split('CREATE FUNCTION ').slice(1);
    expect(fonctions.length).toBeGreaterThan(15);
    fonctions.forEach((f) => {
      const nom = f.split('(')[0];
      expect([nom, /SET search_path = public/.test(f.split('AS $f$')[0])]).toEqual([nom, true]);
      if (nom !== 'public.groupe_membres_avant_modif') expect([nom, /SECURITY DEFINER/.test(f.split('AS $f$')[0])]).toEqual([nom, true]);
    });
    expect(MIGRATION).not.toMatch(/CREATE POLICY/);
    expect(MIGRATION).toMatch(/FROM PUBLIC, anon;/);
    const rendues = MIGRATION.match(/RETURNS TABLE\(([^)]*)\)/g).join(' ');
    ['poids_corps_kg', 'note', 'rpe', 'ressenti', 'douleur'].forEach((k) => expect(rendues).not.toMatch(new RegExp('\\b' + k + '\\b')));
    // Les règles EN BASE : 6, 140, un groupe à la fois, le blocage.
    expect(MIGRATION).toMatch(/>= 6 THEN\s+RAISE EXCEPTION 'groupe_plein'/);
    expect(MIGRATION).toMatch(/char_length\(texte\) BETWEEN 1 AND 140/);
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX groupe_membres_un_a_la_fois ON public\.groupe_membres \(user_id\) WHERE NOT ferme/);
    expect(MIGRATION).toMatch(/social_mutuel\(NEW\.invitant, NEW\.invite\)/);
    expect(MIGRATION).toMatch(/groupe_messages[^;]*ON DELETE CASCADE/);
  });
  test('les constantes du faux serveur sont celles de l’app et de la migration', () => {
    expect(FauxSocial.GROUPE.MAX).toBe(Social.GROUPE_MAX);
    expect(FauxSocial.GROUPE.TEXTE_MAX).toBe(Social.MESSAGE_MAX);
  });
});

describe('91 — le faux serveur imite v2_082', () => {
  function decor() {
    let maintenant = T0;
    const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], sessions: [], sets: [], records: [] };
    const f = FauxSocial.creer(base, { moi: 'u-moi', maintenant: () => new Date(maintenant) });
    f.avancer = (ms) => { maintenant += ms; };
    f.base = base;
    ['jordan', 'lea', 'alexis', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'].forEach((p) =>
      f.etat.profils.push({ id: 'u-' + p, username: p, compte_prive: true, jeu_actif: p !== 'lea', jeu_niveau: 3 }));
    const ab = (a, b) => f.etat.abonnements.push({ suiveur: a, suivi: b, statut: 'accepte' });
    ['jordan', 'lea', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'].forEach((p) => { ab('u-moi', 'u-' + p); ab('u-' + p, 'u-moi'); });
    // alexis suit jordan (il est son abonné) mais n'est mutuel de personne dans le groupe.
    ab('u-alexis', 'u-jordan'); ab('u-moi', 'u-alexis');
    base.sessions.push({ id: 's-moi', user_id: 'u-moi', debut: iso(T0 - 30 * MIN), statut: 'en_cours' });
    ['jordan', 'lea', 'alexis', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'].forEach((p) =>
      f.etat.sessions.push({ id: 's-' + p, user_id: 'u-' + p, debut: iso(T0 - 50 * MIN), statut: 'en_cours' }));
    return f;
  }
  const refus = (r) => r && r.code ? r.message : null;
  const lancer = (f) => {
    f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi', p_exercices: ['squat-barre', 'presse'] });
    return f.groupeDe('u-moi');
  };
  const entrer = (f, p) => {
    f.rpc('u-moi', 'groupe_inviter', { p_user: 'u-' + p });
    return f.rpc('u-' + p, 'groupe_repondre', { p_groupe: f.groupeDe('u-moi'), p_rejoindre: true, p_session: 's-' + p, p_exercices: [] });
  };

  test('lancer depuis sa séance ; un groupe à la fois', () => {
    const f = decor();
    const g = lancer(f);
    expect(g).toBeTruthy();
    expect(refus(f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi', p_exercices: [] }))).toMatch(/groupe_deja_dans_un/);
  });

  test('on n’invite qu’un abonné mutuel (alexis, que je suis sans qu’il me suive : refusé)', () => {
    const f = decor();
    f.etat.abonnements = f.etat.abonnements.filter((a) => !(a.suiveur === 'u-alexis' && a.suivi === 'u-moi'));
    lancer(f);
    expect(refus(f.rpc('u-moi', 'groupe_inviter', { p_user: 'u-alexis' }))).toMatch(/groupe_invite_non_mutuel/);
    expect(refus(f.rpc('u-moi', 'groupe_inviter', { p_user: 'u-jordan' }))).toBeNull();
    const inv = f.rpc('u-jordan', 'groupe_invitations_recues');
    expect(inv.map((i) => [i.invitant, i.exercices.join(','), i.membres])).toEqual([['moi', 'squat-barre,presse', 1]]);
  });

  test('MUTATION (a) — le direct est réservé aux membres : un abonné de jordan, hors du groupe, n’en voit rien', () => {
    const f = decor();
    f.etat.abonnements = f.etat.abonnements.filter((a) => !(a.suiveur === 'u-alexis' && a.suivi === 'u-moi'));
    lancer(f);
    entrer(f, 'jordan');
    f.etat.sets.push({ id: 't-j1', session_id: 's-jordan', user_id: 'u-jordan', exercise_slug: 'squat-barre', charge_kg: 180, reps: 3,
      type_serie: 'travail', validee_a: iso(T0 - MIN), rpe: 9, note: 'dur', poids_corps_kg: 89 });
    f.rpc('u-jordan', 'groupe_envoyer', { p_texte: 'Dernière série !' });
    const direct = f.rpc('u-moi', 'groupe_direct');
    expect(direct.map((d) => d.pseudo + ' ' + d.charge_kg + '×' + d.reps)).toEqual(['jordan 180×3']);
    expect(FauxSocial.champsInterdits(direct)).toEqual([]);
    expect(f.suit('u-alexis', 'u-jordan')).toBe(true);
    expect(f.rpc('u-alexis', 'groupe_direct')).toEqual([]);
    expect(f.rpc('u-alexis', 'groupe_messages_lire')).toEqual([]);
    expect(f.rpc('u-alexis', 'groupe_etat')).toEqual([]);
    expect(refus(f.rpc('u-alexis', 'groupe_envoyer', { p_texte: 'je m’invite' }))).toMatch(/groupe_pas_membre/);
    expect(f.etat.fuites).toEqual([]);
  });

  test('MUTATION (b) — 6 au plus : le 7e membre est refusé (groupe_plein), en base', () => {
    const f = decor();
    lancer(f);
    ['jordan', 'm1', 'm2', 'm3', 'm4'].forEach((p) => expect(refus(entrer(f, p))).toBeNull());
    expect(f.rpc('u-moi', 'groupe_moi')[0].membres).toBe(6);
    // Une invitation déjà envoyée avant d'être 6 : l'entrée est refusée quand même.
    f.etat.ginvitations.push({ groupe_id: f.groupeDe('u-moi'), invite: 'u-m5', invitant: 'u-moi', cree_le: 0 });
    expect(refus(f.rpc('u-m5', 'groupe_repondre', { p_groupe: f.groupeDe('u-moi'), p_rejoindre: true, p_session: 's-m5' }))).toMatch(/groupe_plein/);
    expect(refus(f.rpc('u-moi', 'groupe_inviter', { p_user: 'u-m6' }))).toMatch(/groupe_plein/);
    expect(f.rpc('u-moi', 'groupe_moi')[0].membres).toBe(6);
  });

  test('jamais deux personnes qui se bloquent ; bloquer en plein groupe fait partir celui qui bloque', () => {
    const f = decor();
    lancer(f);
    entrer(f, 'jordan');
    f.etat.blocages.push({ bloqueur: 'u-m1', bloque: 'u-jordan' });
    expect(refus(f.rpc('u-moi', 'groupe_inviter', { p_user: 'u-m1' }))).toMatch(/groupe_bloque/);
    f.etat.blocages = [];
    entrer(f, 'lea');
    f.appeler('u-lea', 'POST', 'blocages', { bloqueur: 'u-lea', bloque: 'u-jordan' });
    expect(f.rpc('u-moi', 'groupe_etat').map((m) => m.pseudo)).toEqual(['moi', 'jordan']);
    expect(f.groupeDe('u-lea')).toBeNull();
  });

  test('un message : 1 à 140 caractères, membres seulement', () => {
    const f = decor();
    lancer(f);
    expect(refus(f.rpc('u-moi', 'groupe_envoyer', { p_texte: 'x'.repeat(141) }))).toMatch(/groupe_messages_texte/);
    expect(refus(f.rpc('u-moi', 'groupe_envoyer', { p_texte: '   ' }))).toMatch(/groupe_messages_texte/);
    expect(refus(f.rpc('u-moi', 'groupe_envoyer', { p_texte: 'On y va ?' }))).toBeNull();
    expect(f.rpc('u-moi', 'groupe_messages_lire').map((m) => m.texte)).toEqual(['On y va ?']);
  });

  test('MUTATION (c) — le récap compte TOUT ce que chacun a fait dans sa séance, même AVANT d’avoir rejoint', () => {
    const f = decor();
    // jordan valide deux séries de travail et une chauffe, avec un record, AVANT d'être invité.
    f.etat.sets.push(
      { id: 't-j0', session_id: 's-jordan', exercise_slug: 'squat-barre', charge_kg: 60, reps: 5, type_serie: 'echauffement', validee_a: iso(T0 - 40 * MIN) },
      { id: 't-j1', session_id: 's-jordan', exercise_slug: 'squat-barre', charge_kg: 180, reps: 3, type_serie: 'travail', validee_a: iso(T0 - 30 * MIN) },
      { id: 't-j2', session_id: 's-jordan', exercise_slug: 'squat-barre', charge_kg: 170, reps: 4, type_serie: 'travail', validee_a: iso(T0 - 20 * MIN) });
    f.etat.records.push({ set_id: 't-j1', session_id: 's-jordan', type: 'charge_a_reps', valeur: 180 },
      { set_id: 't-j1', session_id: 's-jordan', type: 'un_rm_estime', valeur: 195 });
    lancer(f);
    f.avancer(MIN);
    entrer(f, 'jordan');
    f.avancer(MIN);
    f.etat.sets.push({ id: 't-j3', session_id: 's-jordan', exercise_slug: 'presse', charge_kg: 200, reps: 10, type_serie: 'travail', validee_a: iso(T0 + 2 * MIN) });
    f.rpc('u-jordan', 'groupe_publier', { p_exercices: ['squat-barre', 'presse'], p_xp: 300 });
    const r = f.rpc('u-moi', 'groupe_recap');
    const jordan = r.filter((x) => x.pseudo === 'jordan')[0];
    // 180×3 + 170×4 + 200×10 = 540 + 680 + 2000 ; la chauffe ne compte pas ; une médaille par série.
    expect([jordan.tonnage_kg, jordan.series, jordan.records, jordan.xp]).toEqual([3220, 3, 1, 300]);
  });

  test('fermer fige MON récap ; le dernier éteint le groupe, et les messages partent avec lui', () => {
    const f = decor();
    lancer(f);
    entrer(f, 'lea');
    f.rpc('u-lea', 'groupe_envoyer', { p_texte: '🔥' });
    f.rpc('u-moi', 'groupe_publier', { p_exercices: null, p_xp: 120 });
    f.rpc('u-lea', 'groupe_publier', { p_exercices: null, p_xp: 80 });
    f.rpc('u-moi', 'groupe_fermer');
    expect(f.groupeDe('u-moi')).toBeNull();
    expect(f.etat.groupes.length).toBe(1);
    expect(f.etat.gmessages.length).toBe(1);
    const fige = f.rpc('u-moi', 'groupe_recap_seance', { p_session: 's-moi' });
    // lea a le jeu éteint : son XP est nulle dans le récap.
    expect(fige[0].recap.membres.map((m) => m.pseudo + ':' + m.xp)).toEqual(['moi:120', 'lea:null']);
    expect(f.rpc('u-lea', 'groupe_recap_seance', { p_session: 's-moi' })).toEqual([]);
    // On ne réinvite pas quelqu'un qui a fermé sa place (il reste membre, le récap fermé : `groupe_deja_membre`).
    expect(refus(f.rpc('u-lea', 'groupe_inviter', { p_user: 'u-moi' }))).toMatch(/groupe_deja_membre/);
    f.rpc('u-lea', 'groupe_fermer');
    expect(f.etat.groupes).toEqual([]);
    expect(f.etat.gmessages).toEqual([]);
    expect(f.etat.ginvitations).toEqual([]);
    expect(f.etat.grecaps.length).toBe(2);
    // Un groupe à la fois, pas un pour toujours : je relance.
    f.base.sessions.push({ id: 's-moi-2', user_id: 'u-moi', debut: iso(T0), statut: 'en_cours' });
    expect(typeof f.rpc('u-moi', 'groupe_creer', { p_session: 's-moi-2', p_exercices: [] })).toBe('string');
  });

  test('jamais la séance d’un autre ; une séance abandonnée quitte le groupe', () => {
    const f = decor();
    expect(refus(f.rpc('u-moi', 'groupe_creer', { p_session: 's-jordan', p_exercices: [] }))).toMatch(/groupe_seance_d_un_autre/);
    expect(f.etat.groupes).toEqual([]);
    lancer(f);
    entrer(f, 'jordan');
    f.rpc('u-jordan', 'groupe_quitter');
    expect(f.rpc('u-moi', 'groupe_etat').map((m) => m.pseudo)).toEqual(['moi']);
  });
});
