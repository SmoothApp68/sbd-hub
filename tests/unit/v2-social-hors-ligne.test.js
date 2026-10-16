/** @jest-environment node */
//
// 107 — UN GESTE SOCIAL FAIT HORS LIGNE N'EST PLUS PERDU (SOCIAL-V1 §8, décision d'Aurélien du 15/10/2026).
//
// « Un geste social fait hors ligne est gardé sur le téléphone et part au retour du réseau, comme les séances ; il
// n'est jamais perdu en silence. Si la base le refuse au retour (le compte est devenu privé, un blocage entre-temps…),
// l'app le dit en une phrase. »
//
// Ici : la file (`attente.js`, table `social`), ce que devient un envoi qui échoue (`Social.issueDuGeste`), ce que
// l'écran montre d'un geste qui attend (`Social.…AvecGestes`), et la vidange rejouée contre le faux serveur du banc
// (`faux-social.js`, qui imite v2_078 et v2_080).
//
// CONFIGURATIONS DISCRIMINANTES :
//   · deux gestes CONTRAIRES (s'abonner, puis se désabonner) : seul l'état final part (le retrait) — sans la clé
//     d'état, les deux partiraient ; un geste d'un AUTRE état fait entre les deux reste à sa place ;
//   · un RECHARGEMENT entre les deux (la file relue du disque, ici par un aller-retour JSON) ;
//   · une RÉPONSE PERDUE après un envoi réussi : le geste est rejoué, et la base répond « déjà là » — sans la règle,
//     l'écran dirait un refus pour un geste fait ;
//   · un REFUS au retour (bloqué entre-temps, guilde pleine) SUIVI d'un geste sain : le refus ne retient pas la file.

global.self = global;
const Attente = require('../../v2/js/attente.js');
const Social = require('../../v2/js/social.js');
const FauxSocial = require('../banc/faux-social.js');

const G = Social.GESTES;
let n = 0;
const uuid = () => 'g-' + (++n);
beforeEach(() => { n = 0; });

// Poser un geste comme `poserGesteSocial` (app.js) : un geste sur un état prend la clé de cet état, en fin de file
// (`Social.cleDuGeste`) ; les autres, un identifiant neuf.
const poser = (file, d) => {
  const donnees = Object.assign({ moi: 'u-moi' }, d), cle = Social.cleDuGeste(donnees);
  return Attente.poser(file, { table: Attente.SOCIAL, op: Attente.GESTE, id: cle || uuid(), alaFin: !!cle, donnees });
};
const recharger = (file) => JSON.parse(JSON.stringify(file));   // la file relue du disque (IndexedDB)

function decor() {
  const base = { profiles: [{ id: 'u-moi', username: 'moi', compte_prive: true }], sessions: [], sets: [], records: [] };
  const f = FauxSocial.creer(base, { moi: 'u-moi' });
  ['lea', 'jordan', 'alexis'].forEach((p) => f.etat.profils.push({ id: 'u-' + p, username: p, compte_prive: true, jeu_actif: true, jeu_niveau: 3 }));
  f.etat.profils.push({ id: 'u-public', username: 'public', compte_prive: false, jeu_actif: true, jeu_niveau: 2 });
  f.etat.sessions.push({ id: 's-lea', user_id: 'u-lea', titre: 'Bas', debut: new Date().toISOString(), statut: 'terminee', visibilite: 'mutuels' });
  return f;
}

// L'écrivain de chaque geste, comme `executerGesteSocial` (app.js) → `donnees.js` : un refus de la base remonte comme
// l'erreur de PostgREST (`{ code, message }`) ; hors réseau, une erreur sans code (le `fetch` qui échoue).
function executeur(f, reseau) {
  const ecrire = (r) => { if (r && r.status >= 400) throw r.data; return true; };
  return async (op) => {
    if (!reseau.ok) throw { message: 'TypeError: Failed to fetch', code: '' };
    const d = op.donnees, moi = d.moi;
    let r;
    if (d.geste === G.SABONNER) r = f.appeler(moi, 'POST', 'abonnements', { suiveur: moi, suivi: d.autre });
    else if (d.geste === G.RETIRER_ABONNEMENT) r = f.appeler(moi, 'DELETE', 'abonnements', null, 'suiveur=eq.' + moi + '&suivi=eq.' + d.autre);
    else if (d.geste === G.RETIRER_ABONNE) r = f.appeler(moi, 'DELETE', 'abonnements', null, 'suiveur=eq.' + d.autre + '&suivi=eq.' + moi);
    else if (d.geste === G.ACCEPTER) r = f.appeler(moi, 'PATCH', 'abonnements', { statut: 'accepte' }, 'suiveur=eq.' + d.autre + '&suivi=eq.' + moi);
    else if (d.geste === G.BLOQUER) r = f.appeler(moi, 'POST', 'blocages', { bloqueur: moi, bloque: d.autre });
    else if (d.geste === G.DEBLOQUER) r = f.appeler(moi, 'DELETE', 'blocages', null, 'bloqueur=eq.' + moi + '&bloque=eq.' + d.autre);
    else if (d.geste === G.REAGIR) r = f.appeler(moi, 'POST', 'reactions_seance', { session_id: d.session, user_id: moi });
    else if (d.geste === G.RETIRER_REACTION) r = f.appeler(moi, 'DELETE', 'reactions_seance', null, 'session_id=eq.' + d.session + '&user_id=eq.' + moi);
    else if (d.geste === G.GUILDE) r = f.comme(moi, () => f.gerer('POST', new URL('https://banc.supabase.co/rest/v1/rpc/' + d.fn), d.args));
    reseau.envois.push(d.geste + (d.fn ? ':' + d.fn : '') + (d.autre ? ':' + d.autre : ''));
    // La réponse perdue (une fois par geste) : la base a écrit, le téléphone ne le sait pas.
    if (reseau.perdreUneFois && !(reseau.perdus = reseau.perdus || {})[op.id]) {
      reseau.perdus[op.id] = true;
      throw { message: 'TypeError: Failed to fetch', code: '' };
    }
    return ecrire(r);
  };
}

// La vidange (app.js, `vidanger`) : dans l'ordre, une entrée à la fois ; un refus sort sans arrêter ; une coupure arrête.
async function vidanger(file, executer) {
  const issues = [];
  let f = file;
  for (let garde = 0; garde < 100; garde++) {
    const op = Attente.prochaine(f);
    if (!op) break;
    let e = null;
    try { await executer(op); } catch (x) { e = x; }
    if (!e) { f = Attente.apresSucces(f, op); issues.push({ id: op.id, suite: 'envoyee' }); continue; }
    const r = Attente.apresEchec(f, op, e, (o, er) => Social.issueDuGeste(o.donnees, er, (o.essais || 0) > 0));
    f = r.file;
    issues.push({ id: op.id, suite: r.suite, erreur: e, phrase: r.suite === 'refusee' ? Social.phraseDuRefus(op.donnees, e) : null });
    if (r.suite === 'arret') break;
  }
  return { file: f, issues };
}

describe('107 — la file : dans l’ordre, sur disque ; un geste qui annule le précédent n’envoie que l’état final', () => {
  test('DISCRIMINANT — s’abonner, réagir, se désabonner, rechargée, se réabonner : l’état final seul, en fin de file, derrière ce qui a été fait entre-temps', () => {
    let file = [];
    file = poser(file, { geste: G.SABONNER, autre: 'u-lea', pseudo: 'lea' });
    file = poser(file, { geste: G.REAGIR, session: 's-1', pseudo: 'jordan' });
    file = poser(file, { geste: G.RETIRER_ABONNEMENT, autre: 'u-lea', pseudo: 'lea' });
    expect(Attente.ordonnee(file).map((e) => e.donnees.geste)).toEqual(['reagir', 'retirer_abonnement']);
    file = recharger(file);
    file = poser(file, { geste: G.SABONNER, autre: 'u-lea', pseudo: 'lea' });
    expect(Attente.ordonnee(file).map((e) => e.donnees.geste)).toEqual(['reagir', 'sabonner']);
    expect(Attente.resume(file).libelle).toBe('2 à envoyer');
  });

  test('la clé d’un geste : la même pour deux gestes sur le même état ; un geste qui n’est pas un état a son entrée', () => {
    const c = (d) => Social.cleDuGeste(Object.assign({ moi: 'u-moi' }, d));
    // Depuis la recherche (le pseudo seul) puis depuis le profil (l'identifiant aussi) : le même état.
    expect(c({ geste: G.SABONNER, pseudo: 'lea' })).toBe(c({ geste: G.RETIRER_ABONNEMENT, autre: 'u-lea', pseudo: 'lea' }));
    expect(c({ geste: G.ACCEPTER, autre: 'u-lea', pseudo: 'lea' })).toBe(c({ geste: G.RETIRER_ABONNE, autre: 'u-lea', pseudo: 'lea' }));
    expect(c({ geste: G.ACCEPTER, autre: 'u-lea', pseudo: 'lea' })).not.toBe(c({ geste: G.SABONNER, autre: 'u-lea', pseudo: 'lea' }));
    expect(c({ geste: G.REAGIR, session: 's-1' })).toBe(c({ geste: G.RETIRER_REACTION, session: 's-1' }));
    expect(c({ geste: G.REAGIR, session: 's-1' })).not.toBe(c({ geste: G.REAGIR, session: 's-2' }));
    expect(c({ geste: G.GUILDE, fn: 'guilde_choisir_rang', args: { p_rang: 'Terreur' } }))
      .toBe(c({ geste: G.GUILDE, fn: 'guilde_choisir_rang', args: { p_rang: 'Novice' } }));
    // Bloquer efface les liens : bloquer puis débloquer n'est pas « rien », les deux partent.
    expect(c({ geste: G.BLOQUER, autre: 'u-lea', pseudo: 'lea' })).toBeNull();
    expect(c({ geste: G.DEBLOQUER, autre: 'u-lea', pseudo: 'lea' })).toBeNull();
    ['guilde_creer', 'guilde_inviter', 'guilde_repondre', 'guilde_quitter', 'guilde_retirer_membre', 'guilde_transmettre']
      .forEach((fn) => expect(c({ geste: G.GUILDE, fn, args: {} })).toBeNull());
    // Le compte qui fait le geste fait partie de la clé.
    expect(c({ geste: G.SABONNER, pseudo: 'lea' })).not.toBe(Social.cleDuGeste({ moi: 'u-autre', geste: G.SABONNER, pseudo: 'lea' }));
  });

  test('un geste incomplet ne se pose pas (`gesteValide`)', () => {
    expect(Social.gesteValide({ moi: 'u-moi', geste: G.SABONNER, pseudo: 'lea' })).toBe(true);
    expect(Social.gesteValide({ moi: 'u-moi', geste: G.BLOQUER })).toBe(false);
    expect(Social.gesteValide({ moi: 'u-moi', geste: G.REAGIR })).toBe(false);
    expect(Social.gesteValide({ geste: G.ACCEPTER, autre: 'x' })).toBe(false);
    expect(Social.gesteValide({ moi: 'u-moi', geste: G.GUILDE, fn: 'guilde_moi' })).toBe(false);
    expect(Social.gesteValide({ moi: 'u-moi', geste: G.GUILDE, fn: 'guilde_creer', args: {} })).toBe(true);
  });
});

describe('107 — chaque geste fait hors ligne part au retour du réseau', () => {
  test('s’abonner, accepter, refuser, retirer un abonné, réagir, bloquer, débloquer : rien ne part hors ligne, tout part au retour', async () => {
    const f = decor();
    // lea me demande, jordan aussi ; je suis alexis, il me suit ; je suis lea (acceptée) pour réagir à sa séance.
    f.appeler('u-lea', 'POST', 'abonnements', { suiveur: 'u-lea', suivi: 'u-moi' });
    f.appeler('u-jordan', 'POST', 'abonnements', { suiveur: 'u-jordan', suivi: 'u-moi' });
    f.etat.abonnements.push({ suiveur: 'u-alexis', suivi: 'u-moi', statut: 'accepte' }, { suiveur: 'u-moi', suivi: 'u-lea', statut: 'accepte' });
    const reseau = { ok: false, envois: [] };
    let file = [];
    file = poser(file, { geste: G.SABONNER, autre: 'u-public', pseudo: 'public', prive: false });
    file = poser(file, { geste: G.ACCEPTER, autre: 'u-lea', pseudo: 'lea' });
    file = poser(file, { geste: G.RETIRER_ABONNE, autre: 'u-jordan', pseudo: 'jordan', refuser: true });
    file = poser(file, { geste: G.RETIRER_ABONNE, autre: 'u-alexis', pseudo: 'alexis' });
    file = poser(file, { geste: G.REAGIR, session: 's-lea', pseudo: 'lea' });
    const hors = await vidanger(file, executeur(f, reseau));
    expect(hors.file.length).toBe(5);
    expect(hors.issues.map((x) => x.suite)).toEqual(['arret']);
    expect(Attente.resume(hors.file).enEchec).toBe(1);
    expect(f.etat.reactions.length).toBe(0);
    reseau.ok = true;
    const retour = await vidanger(recharger(hors.file), executeur(f, reseau));
    expect(retour.file).toEqual([]);
    expect(reseau.envois).toEqual(['sabonner:u-public', 'accepter:u-lea', 'retirer_abonne:u-jordan', 'retirer_abonne:u-alexis', 'reagir']);
    const lien = (a, b) => f.etat.abonnements.filter((x) => x.suiveur === a && x.suivi === b)[0] || null;
    expect(lien('u-moi', 'u-public').statut).toBe('accepte');            // compte public : accepté d'office
    expect(lien('u-lea', 'u-moi').statut).toBe('accepte');
    expect(lien('u-jordan', 'u-moi')).toBeNull();
    expect(lien('u-alexis', 'u-moi')).toBeNull();
    expect(f.etat.reactions.map((r) => r.session_id)).toEqual(['s-lea']);

    // Bloquer puis débloquer, hors ligne : le blocage efface les liens, le déblocage ne les rend pas.
    reseau.ok = false;
    let file2 = poser([], { geste: G.BLOQUER, autre: 'u-lea', pseudo: 'lea' });
    file2 = poser(file2, { geste: G.DEBLOQUER, autre: 'u-lea', pseudo: 'lea' });
    file2 = (await vidanger(file2, executeur(f, reseau))).file;
    expect(f.etat.blocages.length).toBe(0);
    reseau.ok = true;
    expect((await vidanger(recharger(file2), executeur(f, reseau))).file).toEqual([]);
    expect(f.etat.journal.filter((j) => j.op === 'blocage' || j.op === 'deblocage').map((j) => j.op)).toEqual(['blocage', 'deblocage']);
    expect(lien('u-moi', 'u-lea')).toBeNull();
    expect(f.etat.blocages).toEqual([]);
  });

  test('DISCRIMINANT — deux gestes contraires (s’abonner, puis se désabonner), un rechargement entre les deux : UN SEUL envoi, le retrait ; le serveur finit SANS abonnement', async () => {
    const f = decor();
    const reseau = { ok: false, envois: [] };
    let file = poser([], { geste: G.SABONNER, autre: 'u-lea', pseudo: 'lea', prive: true });
    file = (await vidanger(file, executeur(f, reseau))).file;   // tenté hors ligne : essais 1
    file = recharger(file);   // l'app rechargée, toujours hors ligne
    file = poser(file, { geste: G.RETIRER_ABONNEMENT, autre: 'u-lea', pseudo: 'lea' });
    expect(file.map((e) => e.donnees.geste)).toEqual(['retirer_abonnement']);
    expect(file[0].essais).toBe(0);
    reseau.ok = true;
    const r = await vidanger(file, executeur(f, reseau));
    expect(r.file).toEqual([]);
    expect(reseau.envois).toEqual(['retirer_abonnement:u-lea']);
    expect(f.etat.abonnements).toEqual([]);
    expect(f.etat.journal.filter((j) => j.op === 'abonnement').length).toBe(0);
  });

  test('DISCRIMINANT — le premier geste EN VOL quand le second se pose : le succès du premier ne retire pas le second, qui part après', async () => {
    const f = decor();
    const reseau = { ok: true, envois: [] };
    let file = poser([], { geste: G.SABONNER, autre: 'u-lea', pseudo: 'lea' });
    const enVol = Attente.prochaine(file);
    await executeur(f, reseau)(enVol);                         // l'abonnement est parti…
    file = poser(file, { geste: G.RETIRER_ABONNEMENT, autre: 'u-lea', pseudo: 'lea' });   // …le retrait se pose pendant le vol
    file = Attente.apresSucces(file, enVol);                   // la réponse revient
    expect(file.map((e) => e.donnees.geste)).toEqual(['retirer_abonnement']);
    await vidanger(file, executeur(f, reseau));
    expect(reseau.envois).toEqual(['sabonner:u-lea', 'retirer_abonnement:u-lea']);
    expect(f.etat.abonnements).toEqual([]);
  });

  test('DISCRIMINANT — un même geste rejoué ne double rien : la réponse perdue, puis « déjà là » = fait (pas un refus)', async () => {
    const f = decor();
    f.etat.abonnements.push({ suiveur: 'u-moi', suivi: 'u-lea', statut: 'accepte' });
    const reseau = { ok: true, envois: [], perdreUneFois: true };
    let file = poser([], { geste: G.SABONNER, autre: 'u-jordan', pseudo: 'jordan' });
    file = poser(file, { geste: G.REAGIR, session: 's-lea', pseudo: 'lea' });
    file = poser(file, { geste: G.BLOQUER, autre: 'u-alexis', pseudo: 'alexis' });
    // Chaque geste : écrit en base, la réponse perdue (la vidange s'arrête), puis rejoué à la vidange suivante.
    const issues = [];
    for (let i = 0; i < 4 && file.length; i++) {
      const r = await vidanger(file, executeur(f, reseau));
      file = r.file; issues.push.apply(issues, r.issues.map((x) => x.suite + (x.erreur && x.erreur.code ? ':' + x.erreur.code : '')));
    }
    expect(file).toEqual([]);
    expect(issues).toEqual(['arret', 'faite:23505', 'arret', 'faite:23505', 'arret', 'faite:23505']);
    expect(f.etat.abonnements.filter((x) => x.suiveur === 'u-moi' && x.suivi === 'u-jordan').length).toBe(1);
    expect(f.etat.blocages.length).toBe(1);
    expect(f.etat.journal.filter((j) => j.op === 'reaction').length).toBe(1);
  });

  test('DISCRIMINANT — refusé au retour (bloqué entre-temps) : l’entrée sort, une phrase, et le geste suivant part quand même', async () => {
    const f = decor();
    const reseau = { ok: false, envois: [] };
    let file = poser([], { geste: G.SABONNER, autre: 'u-lea', pseudo: 'lea' });
    file = poser(file, { geste: G.SABONNER, autre: 'u-jordan', pseudo: 'jordan' });
    file = (await vidanger(file, executeur(f, reseau))).file;
    // Pendant ce temps, lea me bloque.
    f.appeler('u-lea', 'POST', 'blocages', { bloqueur: 'u-lea', bloque: 'u-moi' });
    reseau.ok = true;
    const r = await vidanger(file, executeur(f, reseau));
    expect(r.file).toEqual([]);
    expect(r.issues.map((x) => x.suite)).toEqual(['refusee', 'envoyee']);
    expect(r.issues[0].phrase).toBe('« S’abonner à lea » n’a pas pu se faire.');
    expect(f.etat.abonnements.map((x) => x.suivi)).toEqual(['u-jordan']);
    expect(Attente.deciderEtat({ code: 'a-jour', libelle: 'À jour' }, r.file).code).toBe('a-jour');
  });

  test('les gestes de la guilde : créer, rang, défi hors ligne ; « guilde pleine » au retour se dit avec les mots de la guilde', async () => {
    const f = decor();
    const reseau = { ok: false, envois: [] };
    const guilde = (fn, args, extra) => Object.assign({ geste: G.GUILDE, fn, args }, extra || {});
    let file = poser([], guilde('guilde_creer', { p_nom: 'Les Fers', p_couleur: '#b39ad1' }));
    file = poser(file, guilde('guilde_choisir_rang', { p_rang: 'Terreur' }));
    file = poser(file, guilde('guilde_choisir_defi', { p_type: 'records', p_n: 3 }));
    file = recharger((await vidanger(file, executeur(f, reseau))).file);
    expect(f.etat.guildes).toEqual([]);
    reseau.ok = true;
    expect((await vidanger(file, executeur(f, reseau))).file).toEqual([]);
    expect(f.etat.guildes.map((g) => g.nom)).toEqual(['Les Fers']);
    expect(f.etat.membres[0].rang).toBe('Terreur');
    expect(f.etat.defis[0].type).toBe('records');

    // jordan est invité dans la guilde d'alexis, pleine quand sa réponse arrive.
    const g2 = f.rpc('u-alexis', 'guilde_creer', { p_nom: 'Pleine', p_couleur: '#b39ad1' });
    f.etat.invitations.push({ guilde_id: g2, invite: 'u-jordan', invitant: 'u-alexis', cree_le: 0 });
    for (let i = 0; i < 29; i++) f.etat.membres.push({ user_id: 'u-x' + i, guilde_id: g2, rang: 'Novice', entre_le: 100 + i });
    const rep = Attente.poser([], { table: Attente.SOCIAL, op: Attente.GESTE, id: 'r1',
      donnees: guilde('guilde_repondre', { p_guilde: g2, p_rejoindre: true }, { moi: 'u-jordan', nom: 'Pleine' }) });
    const r = await vidanger(rep, executeur(f, reseau));
    expect(r.issues.map((x) => x.suite)).toEqual(['refusee']);
    expect(r.issues[0].phrase).toBe('La guilde est complète : 30 membres.');
    expect(f.guildeDe('u-jordan')).toBeNull();
  });

  test('les autres gestes, hors ligne puis rechargés : retirer sa réaction, se désabonner, bloquer ; inviter, modifier, retirer un membre, ' +
    'transmettre, partir ; rejoindre et refuser une invitation — rien ne part hors ligne, tout part au retour, dans l’ordre', async () => {
    const f = decor();
    const ab = (a, b) => f.etat.abonnements.push({ suiveur: a, suivi: b, statut: 'accepte' });
    ['u-lea', 'u-jordan', 'u-alexis'].forEach((u) => { ab('u-moi', u); ab(u, 'u-moi'); });
    f.appeler('u-moi', 'POST', 'reactions_seance', { session_id: 's-lea', user_id: 'u-moi' });
    const g = f.rpc('u-moi', 'guilde_creer', { p_nom: 'Les Fers', p_couleur: '#b39ad1' });
    ['u-jordan', 'u-alexis'].forEach((u) => { f.rpc('u-moi', 'guilde_inviter', { p_user: u }); f.rpc(u, 'guilde_repondre', { p_guilde: g, p_rejoindre: true }); });
    // Une invitation d'une autre guilde, pour moi, que je refuserai.
    const g2 = f.rpc('u-public', 'guilde_creer', { p_nom: 'Autre', p_couleur: '#b39ad1' });
    f.etat.invitations.push({ guilde_id: g2, invite: 'u-moi', invitant: 'u-public', cree_le: 0 });
    const guilde = (fn, args, extra) => Object.assign({ geste: G.GUILDE, fn, args }, extra || {});
    const reseau = { ok: false, envois: [] };
    let file = poser([], { geste: G.RETIRER_REACTION, session: 's-lea', pseudo: 'lea' });
    file = poser(file, guilde('guilde_repondre', { p_guilde: g2, p_rejoindre: false }, { nom: 'Autre' }));
    file = poser(file, guilde('guilde_inviter', { p_user: 'u-lea' }, { pseudo: 'lea' }));
    file = poser(file, guilde('guilde_modifier', { p_nom: 'Les Fers II', p_couleur: '#8fb08a' }));
    file = poser(file, guilde('guilde_retirer_membre', { p_user: 'u-alexis' }, { pseudo: 'alexis' }));
    file = poser(file, guilde('guilde_transmettre', { p_user: 'u-jordan' }, { pseudo: 'jordan' }));
    file = poser(file, guilde('guilde_quitter', {}));
    file = poser(file, { geste: G.RETIRER_ABONNEMENT, autre: 'u-alexis', pseudo: 'alexis' });
    file = poser(file, { geste: G.BLOQUER, autre: 'u-alexis', pseudo: 'alexis' });
    file = recharger((await vidanger(file, executeur(f, reseau))).file);
    expect(file.length).toBe(9);
    expect(f.etat.reactions.length).toBe(1);
    expect(f.guildeDe('u-moi')).toBe(g);
    reseau.ok = true;
    const r = await vidanger(file, executeur(f, reseau));
    expect(r.file).toEqual([]);
    expect(r.issues.map((x) => x.suite)).toEqual(Array(9).fill('envoyee'));
    expect(reseau.envois).toEqual(['retirer_reaction', 'guilde:guilde_repondre', 'guilde:guilde_inviter', 'guilde:guilde_modifier',
      'guilde:guilde_retirer_membre', 'guilde:guilde_transmettre', 'guilde:guilde_quitter', 'retirer_abonnement:u-alexis', 'bloquer:u-alexis']);
    expect(f.etat.reactions).toEqual([]);
    expect(f.etat.invitations.map((i) => i.invite + '@' + i.guilde_id)).toEqual(['u-lea@' + g]);
    expect(f.etat.guildes.filter((x) => x.id === g)[0]).toEqual(expect.objectContaining({ nom: 'Les Fers II', admin: 'u-jordan' }));
    expect(f.guildeDe('u-moi')).toBeNull();
    expect(f.guildeDe('u-alexis')).toBeNull();
    expect(f.etat.blocages).toEqual([expect.objectContaining({ bloqueur: 'u-moi', bloque: 'u-alexis' })]);
    expect(f.etat.abonnements.some((x) => x.suiveur === 'u-alexis' || x.suivi === 'u-alexis')).toBe(false);

    // lea, de son côté, rejoint hors ligne (sa propre file), rechargée, puis le réseau.
    let fileLea = Attente.poser([], { table: Attente.SOCIAL, op: Attente.GESTE, id: 'l1',
      donnees: guilde('guilde_repondre', { p_guilde: g, p_rejoindre: true }, { moi: 'u-lea', nom: 'Les Fers II' }) });
    fileLea = recharger((await vidanger(fileLea, executeur(f, { ok: false, envois: [] }))).file);
    expect(f.guildeDe('u-lea')).toBeNull();
    expect((await vidanger(fileLea, executeur(f, { ok: true, envois: [] }))).file).toEqual([]);
    expect(f.guildeDe('u-lea')).toBe(g);
  });

  test('DISCRIMINANT — créer la guilde, la réponse perdue : rejoué, « déjà dans une guilde » = fait ; un premier envoi qui dit la même chose = refus', async () => {
    const f = decor();
    const reseau = { ok: true, envois: [], perdreUneFois: true };
    let file = poser([], { geste: G.GUILDE, fn: 'guilde_creer', args: { p_nom: 'Les Fers', p_couleur: '#b39ad1' } });
    file = (await vidanger(file, executeur(f, reseau))).file;
    expect(f.etat.guildes.length).toBe(1);
    const r = await vidanger(file, executeur(f, reseau));
    expect(r.issues.map((x) => x.suite)).toEqual(['faite']);
    expect(f.etat.guildes.length).toBe(1);
    // Déjà dans une guilde AU PREMIER ENVOI : un vrai refus.
    const r2 = await vidanger(poser([], { geste: G.GUILDE, fn: 'guilde_creer', args: { p_nom: 'Autre', p_couleur: '#b39ad1' } }),
      executeur(f, { ok: true, envois: [] }));
    expect(r2.issues.map((x) => x.suite)).toEqual(['refusee']);
    expect(r2.issues[0].phrase).toBe('Tu es déjà dans une guilde.');
  });
});

describe('107 — ce que devient un envoi qui échoue (`issueDuGeste`)', () => {
  const d = (geste, extra) => Object.assign({ moi: 'u-moi', geste, autre: 'x', pseudo: 'lea' }, extra || {});
  test('le réseau, une connexion, un jeton expiré : on réessaie (la file s’arrête comme pour une séance)', () => {
    ['', '08006', '57014', 'PGRST301', 'PGRST002', '40001'].forEach((code) => {
      expect(Social.issueDuGeste(d(G.SABONNER), { code, message: 'x' }, false)).toBe('reessayer');
    });
    expect(Social.issueDuGeste(d(G.SABONNER), {}, true)).toBe('reessayer');
  });
  test('« déjà là » (23505) pour s’abonner, bloquer, réagir : fait — pour un autre geste : refus', () => {
    expect(Social.issueDuGeste(d(G.SABONNER), { code: '23505', message: 'abonnements_pkey' }, false)).toBe('fait');
    expect(Social.issueDuGeste(d(G.BLOQUER), { code: '23505', message: 'blocages_pkey' }, false)).toBe('fait');
    expect(Social.issueDuGeste(d(G.REAGIR, { session: 's' }), { code: '23505', message: 'reactions_pkey' }, false)).toBe('fait');
    expect(Social.issueDuGeste(d(G.GUILDE, { fn: 'guilde_creer', args: {} }), { code: '23505', message: 'guildes_nom_cle_uniq' }, true)).toBe('refus');
  });
  test('tout autre refus de la base : refus (RLS, bloqué, profil introuvable, fonction absente)', () => {
    ['42501', 'P0001', '23514', 'TH404', 'PGRST202', '22P02'].forEach((code) => {
      expect(Social.issueDuGeste(d(G.SABONNER), { code, message: 'x' }, false)).toBe('refus');
    });
  });
  test('refuser une invitation déjà partie : fait ; les « déjà fait » de la guilde ne valent qu’au rejeu', () => {
    const rep = (rejoindre) => d(G.GUILDE, { fn: 'guilde_repondre', args: { p_guilde: 'g', p_rejoindre: rejoindre } });
    expect(Social.issueDuGeste(rep(false), { code: '42501', message: 'guilde_sans_invitation' }, false)).toBe('fait');
    expect(Social.issueDuGeste(rep(true), { code: '42501', message: 'guilde_sans_invitation' }, false)).toBe('refus');
    expect(Social.issueDuGeste(rep(true), { code: '42501', message: 'guilde_sans_invitation' }, true)).toBe('fait');
    const tr = d(G.GUILDE, { fn: 'guilde_transmettre', args: { p_user: 'u' } });
    expect(Social.issueDuGeste(tr, { code: '42501', message: 'guilde_pas_admin' }, false)).toBe('refus');
    expect(Social.issueDuGeste(tr, { code: '42501', message: 'guilde_pas_admin' }, true)).toBe('fait');
  });
  test('sans règle sociale (`apresEchec` sans `issueSociale`), un refus définitif sort, une coupure arrête', () => {
    const file = poser([], { geste: G.SABONNER, autre: 'u-lea', pseudo: 'lea' });
    const op = Attente.prochaine(file);
    expect(Attente.apresEchec(file, op, { code: '42501' }).suite).toBe('refusee');
    expect(Attente.apresEchec(file, op, { code: '' }).suite).toBe('arret');
  });
});

describe('107 — les phrases d’un refus : une phrase, un fait', () => {
  test('le geste dit ce qui n’a pas pu se faire ; la guilde parle avec ses mots', () => {
    const p = (x, e) => Social.phraseDuRefus(Object.assign({ moi: 'u-moi' }, x), e || { code: '42501' });
    expect(p({ geste: G.SABONNER, pseudo: 'lea' })).toBe('« S’abonner à lea » n’a pas pu se faire.');
    expect(p({ geste: G.ACCEPTER, pseudo: 'lea' })).toBe('« Accepter lea » n’a pas pu se faire.');
    expect(p({ geste: G.RETIRER_ABONNE, pseudo: 'lea', refuser: true })).toBe('« Refuser lea » n’a pas pu se faire.');
    expect(p({ geste: G.REAGIR, pseudo: 'lea', session: 's' })).toBe('« Réagir à la séance de lea » n’a pas pu se faire.');
    expect(p({ geste: G.GUILDE, fn: 'guilde_creer', args: { p_nom: 'Les Fers' } }, { code: '23505', message: 'guildes_nom_cle_uniq' }))
      .toBe('Ce nom est déjà pris.');
    expect(p({ geste: G.GUILDE, fn: 'guilde_choisir_defi', args: {} }, { code: '23514', message: 'guilde_defi_fige' }))
      .toBe(Social.PHRASE_DEFI_FIGE);
    expect(p({ geste: G.GUILDE, fn: 'guilde_inviter', pseudo: 'jordan', args: {} }, { code: 'P0001', message: 'autre' }))
      .toBe('« Inviter jordan » n’a pas pu se faire.');
  });

  test('DISCRIMINANT — « le compte est devenu privé » : un abonnement fait vers un compte PUBLIC, relu en demande, se dit ; ' +
    'vers un compte privé (l’écran disait déjà « Demande envoyée »), ou relu suivi, rien', () => {
    const ab = (pseudo, prive) => ({ moi: 'u-moi', geste: G.SABONNER, autre: 'u-' + pseudo, pseudo, prive });
    const demande = [{ user_id: 'u-melodie', pseudo: 'melodie', lien: 'demande_envoyee' }];
    expect(Social.phraseDevenuPrive([ab('melodie', false)], demande)).toBe('Le compte de melodie est devenu privé : ta demande attend son accord.');
    // Depuis la recherche, sans identifiant : par le pseudo.
    expect(Social.phraseDevenuPrive([{ moi: 'u-moi', geste: G.SABONNER, pseudo: 'melodie', prive: false }], demande)).not.toBeNull();
    expect(Social.phraseDevenuPrive([ab('melodie', true)], demande)).toBeNull();
    expect(Social.phraseDevenuPrive([ab('melodie', false)], [{ user_id: 'u-melodie', pseudo: 'melodie', lien: 'abonnement' }])).toBeNull();
    expect(Social.phraseDevenuPrive([], demande)).toBeNull();
  });
});

describe('107 — l’écran : la lecture, plus les gestes qu’elle ne contient pas encore', () => {
  const g = (geste, extra) => Object.assign({ moi: 'u-moi', geste }, extra || {});
  const LIENS = [
    { user_id: 'u-lea', pseudo: 'lea', niveau: 3, lien: 'demande_recue' },
    { user_id: 'u-jordan', pseudo: 'jordan', niveau: 3, lien: 'abonnement' },
    { user_id: 'u-jordan', pseudo: 'jordan', niveau: 3, lien: 'abonne' },
    { user_id: 'u-alexis', pseudo: 'alexis', niveau: null, lien: 'bloque' }
  ];
  test('les liens : accepter, s’abonner (demande ou suivi selon le compte), retirer, bloquer, débloquer', () => {
    const r = Social.liensRanges(Social.liensAvecGestes(LIENS, [
      g(G.ACCEPTER, { autre: 'u-lea', pseudo: 'lea' }),
      g(G.SABONNER, { autre: 'u-lea', pseudo: 'lea', prive: true }),
      g(G.SABONNER, { autre: null, pseudo: 'public', prive: false }),
      g(G.RETIRER_ABONNEMENT, { autre: 'u-jordan', pseudo: 'jordan' }),
      g(G.DEBLOQUER, { autre: 'u-alexis', pseudo: 'alexis' }),
      g(G.BLOQUER, { autre: 'u-jordan', pseudo: 'jordan' })
    ]));
    expect(r.demandesRecues).toEqual([]);
    expect(r.abonnes.map((l) => l.pseudo)).toEqual(['lea']);
    expect(r.demandesEnvoyees.map((l) => l.pseudo)).toEqual(['lea']);
    expect(r.abonnements.map((l) => l.pseudo)).toEqual(['public']);
    expect(r.bloques.map((l) => l.pseudo)).toEqual(['jordan']);
  });
  test('DISCRIMINANT — un geste déjà dans la lecture, reposé, ne change rien (un état, jamais une bascule)', () => {
    const gestes = [g(G.ACCEPTER, { autre: 'u-lea', pseudo: 'lea' }), g(G.REAGIR, { session: 's1', pseudo: 'lea' })];
    const une = Social.liensAvecGestes(LIENS, gestes);
    expect(Social.liensAvecGestes(une, gestes)).toEqual(une);
    const fil = [{ session_id: 's1', user_id: 'u-lea', pseudo: 'lea', j_ai_reagi: true }];
    expect(Social.filAvecGestes(fil, gestes)[0].j_ai_reagi).toBe(true);
    expect(Social.filAvecGestes(fil, gestes.concat([g(G.RETIRER_REACTION, { session: 's1' })]))[0].j_ai_reagi).toBe(false);
  });
  test('le profil : demande vers un compte privé, suivi d’office vers un public ; bloqué, il n’est plus visible', () => {
    const p = { id: 'u-lea', pseudo: 'lea', compte_prive: true, je_suis: null, me_suit: false };
    expect(Social.profilAvecGestes(p, [g(G.SABONNER, { autre: 'u-lea' })]).je_suis).toBe('demande');
    expect(Social.profilAvecGestes(Object.assign({}, p, { compte_prive: false }), [g(G.SABONNER, { autre: 'u-lea' })]).je_suis).toBe('accepte');
    expect(Social.profilAvecGestes(p, [g(G.SABONNER, { autre: 'u-lea' }), g(G.RETIRER_ABONNEMENT, { autre: 'u-lea' })]).je_suis).toBeNull();
    expect(Social.profilAvecGestes(p, [g(G.ACCEPTER, { autre: 'u-lea' })]).me_suit).toBe(true);
    expect(Social.profilAvecGestes(p, [g(G.BLOQUER, { autre: 'u-lea' })])).toBeNull();
    expect(Social.profilAvecGestes(p, [g(G.SABONNER, { autre: 'u-jordan' })])).toBe(p);
  });
  test('le fil : ne plus suivre retire ses séances du fil — pas du fil de la guilde ; bloquer, des deux', () => {
    const fil = [{ session_id: 's1', user_id: 'u-lea', pseudo: 'lea' }, { session_id: 's2', user_id: 'u-jordan', pseudo: 'jordan' }];
    const ne = [g(G.RETIRER_ABONNEMENT, { autre: 'u-lea' })];
    expect(Social.filAvecGestes(fil, ne).map((l) => l.session_id)).toEqual(['s2']);
    expect(Social.filAvecGestes(fil, ne, { guilde: true }).map((l) => l.session_id)).toEqual(['s1', 's2']);
    expect(Social.filAvecGestes(fil, [g(G.BLOQUER, { autre: 'u-jordan' })], { guilde: true }).map((l) => l.session_id)).toEqual(['s1']);
  });
  test('la guilde : créer, rejoindre, rang, défi, inviter, retirer, transmettre, partir', () => {
    const gu = (fn, args, extra) => g(G.GUILDE, Object.assign({ fn, args }, extra || {}));
    const vide = { g: null, invitations: [{ guilde_id: 'g1', nom: 'Les Fers', couleur: '#b39ad1', membres: 3 }] };
    const cree = Social.guildeAvecGestes(vide, [gu('guilde_creer', { p_nom: 'À moi', p_couleur: '#8fb08a' }, { monPseudo: 'moi' })], 'u-moi');
    expect(cree.g).toEqual({ nom: 'À moi', couleur: '#8fb08a', blason: 'bouclier', admin: true, membres: 1 });
    expect(cree.membres.map((m) => m.pseudo + ' · ' + m.rang)).toEqual(['moi · Novice']);
    const rejoint = Social.guildeAvecGestes(vide, [gu('guilde_repondre', { p_guilde: 'g1', p_rejoindre: true }, { nom: 'Les Fers', couleur: '#b39ad1', membres: 3 })], 'u-moi');
    expect([rejoint.g.nom, rejoint.g.membres, rejoint.g.admin, rejoint.invitations.length]).toEqual(['Les Fers', 4, false, 0]);
    expect(Social.guildeAvecGestes(vide, [gu('guilde_repondre', { p_guilde: 'g1', p_rejoindre: false })], 'u-moi').invitations).toEqual([]);
    const lue = { g: { nom: 'F', couleur: '#b39ad1', admin: true, membres: 2 }, semaine: { defi: 'seances', n: null },
      membres: [{ user_id: 'u-moi', pseudo: 'moi', rang: 'Novice', moi: true }, { user_id: 'u-jordan', pseudo: 'jordan', rang: 'Squatteur' }] };
    const apres = Social.guildeAvecGestes(lue, [gu('guilde_choisir_rang', { p_rang: 'Terreur' }), gu('guilde_choisir_defi', { p_type: 'records', p_n: 3 }),
      gu('guilde_inviter', { p_user: 'u-lea' }), gu('guilde_retirer_membre', { p_user: 'u-jordan' }), gu('guilde_transmettre', { p_user: 'u-jordan' })], 'u-moi');
    expect(apres.membres.map((m) => m.rang)).toEqual(['Terreur']);
    expect([apres.semaine.defi, apres.semaine.n, apres.invites['u-lea'], apres.g.membres, apres.g.admin]).toEqual(['records', 3, true, 1, false]);
    expect(Social.guildeAvecGestes(lue, [gu('guilde_quitter', {})], 'u-moi').g).toBeNull();
    // La lecture n'est jamais modifiée sur place.
    expect(lue.membres[0].rang).toBe('Novice');
  });
});
