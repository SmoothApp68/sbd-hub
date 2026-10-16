// tests/banc/faux-social.js — le faux serveur du social (87, SOCIAL-V1, migration v2_078 ; 89, étage 2, v2_079 ; 90, la guilde, v2_080 ;
// 91, le groupe de séance, v2_082 ; 106, la fin du groupe et le message gardé hors ligne, v2_087).
//
// ⚠️ C'EST LUI QUI PROUVE LA CONFIDENTIALITÉ AU BANC : il imite les règles de la migration — les cercles
// (`social_suit`, `social_mutuel`), le blocage (dans les deux sens, qui efface les abonnements et les
// réactions croisées), le compte privé (une demande vers un compte public est acceptée d'office), les
// politiques d'écriture (on n'écrit que pour soi ; seul le suivi accepte ; on ne réagit qu'à une séance
// terminée, non privée, d'une personne qu'on suit) et les fonctions de lecture, qui ne rendent QUE les
// colonnes autorisées. Chaque réponse est passée à la garde « aucune donnée interdite » (`fuites`).
//
// Les AUTRES personnes vivent à part (`etat.profils`, `etat.sessions`, `etat.sets`, `etat.records`) : la
// synchronisation de l'app (`GET sessions`, `GET sets`) ne les voit jamais, comme le RLS de la vraie base.
// Les séances de la personne connectée sont celles de la base de papier du banc (`base.sessions`…).
//
// `moi` : l'identifiant qui joue `auth.uid()`. Le banc agit au nom d'une autre personne par `comme(id, f)`.

const CHAMPS_INTERDITS = ['poids_corps_kg', 'note', 'rpe', 'ressenti', 'douleur'];
// 89 (v2_079) — les seules colonnes de `scores_force` : pas de poids de corps.
const COLONNES_SCORES = ['user_id', 'exercise_slug', 'score', 'charge_kg', 'maj_le'];
// 90 (v2_080) — la guilde : les contraintes de la migration, recopiées telles quelles.
const GUILDE = {
  RANGS: ['Squatteur', 'Bencheur', 'Terreur', 'Pousseur', 'Tireur', 'Chargeur', 'Gymbro', 'Motiveur', 'Novice'],
  DEFIS: ['seances', 'records', 'variete'],
  COULEURS: ['#b39ad1', '#8fb08a', '#6fa3d8', '#d9b45a', '#d98f6f', '#7fc4c0', '#c98fb4', '#a3a9b3'],
  MAX: 30,
  TYPES_RECORDS: ['charge_a_reps', 'reps_a_charge', 'charge_max', 'cap', 'duree_s', 'distance_m'],
  // 107 — les fonctions de guilde qui ÉCRIVENT (les gestes, qui passent par la file de l'app).
  ECRITURES: ['guilde_creer', 'guilde_modifier', 'guilde_inviter', 'guilde_repondre', 'guilde_quitter', 'guilde_retirer_membre',
    'guilde_transmettre', 'guilde_choisir_defi', 'guilde_choisir_rang'],
  COLONNES_SCORES: ['user_id', 'semaine', 'seances', 'prevues', 'records_semaine', 'mois', 'exercices', 'exercices_record', 'maj_le']
};
// 91 (v2_082) — le groupe de séance : les contraintes de la migration, recopiées telles quelles.
// 106 (v2_087) — la fin : une séance sans série validée depuis 45 min est finie (la règle de la séance vivante,
// `Seance.MINUTES_VIVANTE`, que la migration recopie : un test vérifie les trois) ; les messages d'un groupe fini
// s'effacent 24 h après sa fin.
const GROUPE = { MAX: 6, TEXTE_MAX: 140, EXERCICES_MAX: 60, DIRECT: 20, MESSAGES: 30, MINUTES_FIN: 45, HEURES_MESSAGES: 24 };
// La clé du nom : translate(lower(btrim(nom)), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy').
function cleDuNom(nom) {
  const de = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', vers = 'aaaaaaceeeeiiiinooooouuuuyy';
  return Array.from(String(nom).trim().toLowerCase()).map((c) => { const i = de.indexOf(c); return i < 0 ? c : vers[i]; }).join('');
}

function creer(base, options) {
  const o = options || {};
  const etat = {
    moi: o.moi || 'u-banc',
    profils: [], sessions: [], sets: [], records: [],
    abonnements: [], blocages: [], reactions: [], scores: [],
    // 90 (v2_080) — la guilde.
    guildes: [], membres: [], invitations: [], defis: [], gscores: [],
    // 91 (v2_082) — le groupe de séance.
    groupes: [], gmembres: [], ginvitations: [], gmessages: [], grecaps: [],
    journal: [], fuites: [], appels: [],
    // 114 (v2_091) — la base ne garde ni ne rend plus la charge à côté du score. `false` : la base d'avant v2_091
    // (la charge exigée, NOT NULL), pour prouver que l'app marche des deux côtés de la migration.
    v2_091: o.v2_091 !== false,
    maintenant: o.maintenant || (() => new Date())
  };

  const profils = () => base.profiles.map((p) => Object.assign({ compte_prive: true, deleted_at: null }, p)).concat(etat.profils);
  const profil = (id) => profils().filter((p) => p.id === id)[0] || null;
  const sessions = () => base.sessions.concat(etat.sessions);
  const sets = () => base.sets.concat(etat.sets);
  const records = () => (base.records || []).concat(etat.records);
  const session = (id) => sessions().filter((s) => s.id === id)[0] || null;
  const visible = (s) => !!s && (s.statut || 'terminee') === 'terminee' && (s.visibilite || 'mutuels') !== 'private';

  const bloque = (a, b) => etat.blocages.some((x) => (x.bloqueur === a && x.bloque === b) || (x.bloqueur === b && x.bloque === a));
  const suit = (a, b) => etat.abonnements.some((x) => x.suiveur === a && x.suivi === b && x.statut === 'accepte') && !bloque(a, b);
  const mutuel = (a, b) => suit(a, b) && suit(b, a);

  // Le tonnage de la migration révisée = `Bilan.volumeKg` : séries `travail`, charge > 0, reps > 0, au centième.
  const tonnage = (sid) => Math.round(sets().filter((t) => t.session_id === sid && (t.type_serie || 'travail') === 'travail' &&
    Number(t.charge_kg) > 0 && Number(t.reps) > 0).reduce((x, t) => x + Number(t.charge_kg) * Number(t.reps), 0) * 100) / 100;
  const niveau = (p) => (p.jeu_actif === false ? null : (p.jeu_niveau === undefined ? null : p.jeu_niveau));
  const titre = (p) => (p.jeu_actif === false ? null : (p.jeu_titre === undefined ? null : p.jeu_titre));
  const jour = (iso) => String(iso).slice(0, 10);

  // 89 — les séries comptées d'une personne (séances terminées, non privées), et la fenêtre « 6 mois » de v2_079.
  const comptees = (user) => {
    const out = [];
    sessions().filter((s) => s.user_id === user && visible(s)).forEach((s) => {
      sets().filter((t) => t.session_id === s.id && (t.type_serie || 'travail') === 'travail' && Number(t.charge_kg) > 0 &&
        Number(t.reps) > 0).forEach((t) => out.push({ session_id: s.id, debut: s.debut, slug: t.exercise_slug,
        charge: Number(t.charge_kg), reps: Number(t.reps), rang: t.rang || 0 }));
    });
    return out.sort((x, y) => String(x.debut).localeCompare(String(y.debut)) || (x.rang - y.rang));
  };
  const debutSixMois = () => {
    const m = etat.maintenant();
    return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 5, 1)).toISOString();
  };

  const refus = (code, message, status) => {
    etat.journal.push({ op: 'refus', refus: code, message });
    return { status: status || 400, data: { code, message, details: message } };
  };

  // ── 90 (v2_080) — LA GUILDE : les règles de la migration ──
  // Une RPC qui échoue lève `Refus` (le message de l'exception SQL) ; `gerer` le rend comme PostgREST.
  function Refus(code, message) { this.code = code; this.message = message; }
  const leve = (code, message) => { throw new Refus(code, message); };
  const guildeDe = (u) => { const m = etat.membres.filter((x) => x.user_id === u)[0]; return m ? m.guilde_id : null; };
  const guilde = (id) => etat.guildes.filter((g) => g.id === id)[0] || null;
  const membresDe = (gid) => etat.membres.filter((m) => m.guilde_id === gid)
    .sort((a, b) => (a.entre_le - b.entre_le) || String(a.user_id).localeCompare(String(b.user_id)));
  const commune = (a, b) => !!guildeDe(a) && guildeDe(a) === guildeDe(b) && !bloque(a, b);
  // La semaine et le mois de l'app (heure locale du banc = celle de l'appareil).
  const jourLocal = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const lundiCourant = () => { const m = etat.maintenant(); return jourLocal(new Date(m.getFullYear(), m.getMonth(), m.getDate() - ((m.getDay() + 6) % 7))); };
  const moisCourant = () => { const m = etat.maintenant(); return jourLocal(new Date(m.getFullYear(), m.getMonth(), 1)); };
  let horloge = 0;
  // `guilde_membres_avant_ajout` : 30 au plus ; rang Novice ; l'ordre d'entrée.
  function ajouterMembre(user, gid) {
    if (guildeDe(user)) leve('23505', 'duplicate key value violates unique constraint "guilde_membres_pkey"');
    if (membresDe(gid).length >= GUILDE.MAX) leve('23514', 'guilde_pleine');
    etat.membres.push({ user_id: user, guilde_id: gid, rang: 'Novice', entre_le: ++horloge });
  }
  // `guilde_membres_apres_depart` : sans membre, la guilde disparaît (et ce qui en dépend) ; l'administrateur parti,
  // l'administration passe au plus ancien.
  function retirerMembre(user) {
    const m = etat.membres.filter((x) => x.user_id === user)[0];
    if (!m) return;
    etat.membres = etat.membres.filter((x) => x !== m);
    const g = guilde(m.guilde_id);
    if (!g) return;
    const reste = membresDe(g.id);
    if (!reste.length) {
      etat.guildes = etat.guildes.filter((x) => x !== g);
      etat.invitations = etat.invitations.filter((i) => i.guilde_id !== g.id);
      etat.defis = etat.defis.filter((d) => d.guilde_id !== g.id);
    } else if (g.admin === user) {
      g.admin = reste[0].user_id;
    }
  }
  function verifierGuilde(nom, couleur) {
    const n = String(nom || '').trim();
    if (n.length < 3 || n.length > 24) leve('23514', 'new row for relation "guildes" violates check constraint "guildes_nom_longueur"');
    if (GUILDE.COULEURS.indexOf(couleur) < 0) leve('23514', 'new row for relation "guildes" violates check constraint "guildes_couleur"');
    return n;
  }
  const nomPris = (n, sauf) => etat.guildes.some((g) => g.id !== sauf && cleDuNom(g.nom) === cleDuNom(n));
  const semaineLancee = (gid) => {
    const lundi = lundiCourant(), ids = membresDe(gid).map((m) => m.user_id);
    const l = new Date(lundi + 'T12:00:00'), fin = jourLocal(new Date(l.getFullYear(), l.getMonth(), l.getDate() + 7));
    return sessions().some((s) => ids.indexOf(s.user_id) >= 0 && (s.statut || 'terminee') === 'terminee' &&
      jourLocal(new Date(s.debut)) >= lundi && jourLocal(new Date(s.debut)) < fin &&
      // v2_083 — seule une séance terminée APRÈS la création de la guilde lance la semaine (coalesce(fin, debut) > cree_le).
      new Date(s.fin || s.debut).getTime() > new Date((etat.guildes.filter((x) => x.id === gid)[0] || {}).cree_le || 0).getTime());
  };
  const seancesDeLaSemaine = (gid) => {
    const lundi = lundiCourant(), ids = membresDe(gid).map((m) => m.user_id);
    const l = new Date(lundi + 'T12:00:00');
    const fin = jourLocal(new Date(l.getFullYear(), l.getMonth(), l.getDate() + 7));
    return sessions().filter((s) => ids.indexOf(s.user_id) >= 0 && visible(s) && jourLocal(new Date(s.debut)) >= lundi &&
      jourLocal(new Date(s.debut)) < fin && sets().some((t) => t.session_id === s.id && (t.type_serie || 'travail') === 'travail'));
  };

  // ── 91 (v2_082) — LE GROUPE DE SÉANCE : les règles de la migration ──
  // Mon groupe vivant : celui dont je n'ai pas fermé le récap (`groupe_membres_un_a_la_fois`).
  const groupeDe = (u) => { const m = etat.gmembres.filter((x) => x.user_id === u && !x.ferme)[0]; return m ? m.groupe_id : null; };
  const gmembresDe = (gid) => etat.gmembres.filter((m) => m.groupe_id === gid)
    .sort((a, b) => String(a.entre_le).localeCompare(String(b.entre_le)) || String(a.user_id).localeCompare(String(b.user_id)));
  const bloqueAvec = (gid, u) => gmembresDe(gid).some((m) => m.user_id !== u && bloque(m.user_id, u));
  const instant = () => etat.maintenant().toISOString();
  // `clock_timestamp()` : l'ordre d'entrée est strict, même deux entrées dans la même milliseconde.
  let dernierInstant = 0;
  const instantStrict = () => { dernierInstant = Math.max(etat.maintenant().getTime(), dernierInstant + 1); return new Date(dernierInstant).toISOString(); };
  // 106 (v2_087) — `groupe_fin_de_seance` : la fin de LA séance d'un membre (null : vivante). `terminee` → sa fin ;
  // sinon l'activité (dernière série validée, à défaut le début de la séance en cours, à défaut l'entrée dans le groupe)
  // + 45 min, si elles sont passées. La règle de `Social.membreTermine`, sur les faits de `groupe_etat`.
  function finDeSeance(m) {
    const s = session(m.session_id), sienne = s && s.user_id === m.user_id ? s : null;
    const v = sienne ? sets().filter((t) => t.session_id === m.session_id && t.validee_a).map((t) => Date.parse(t.validee_a)) : [];
    const activite = v.length ? Math.max.apply(null, v)
      : (sienne && sienne.statut === 'en_cours' ? Date.parse(sienne.debut) : Date.parse(m.entre_le));
    if (sienne && (sienne.statut || 'terminee') === 'terminee') return sienne.fin ? Date.parse(sienne.fin) : activite;
    return etat.maintenant().getTime() - activite >= GROUPE.MINUTES_FIN * 60000 ? activite + GROUPE.MINUTES_FIN * 60000 : null;
  }
  // `groupe_fini_le` : la fin posée, sinon — toutes les séances finies — la dernière d'entre elles.
  function finiLe(gid) {
    const g = etat.groupes.filter((x) => x.id === gid)[0];
    if (!g) return null;
    if (g.fini_le) return g.fini_le;
    const fins = gmembresDe(gid).map(finDeSeance);
    return fins.length && fins.every((f) => f !== null) ? new Date(Math.max.apply(null, fins)).toISOString() : null;
  }
  // `groupe_figer` : à l'extinction, le récap se fige pour chaque membre encore là (un récap déjà figé ne bouge plus).
  function figer(gid) {
    const g = etat.groupes.filter((x) => x.id === gid)[0];
    if (!g) return;
    gmembresDe(gid).forEach((m) => {
      if (etat.grecaps.some((r) => r.user_id === m.user_id && r.groupe_id === gid)) return;
      etat.grecaps.push({ user_id: m.user_id, groupe_id: gid, session_id: m.session_id, le: g.cree_le, recap: recapJson(gid, m.user_id) });
    });
  }
  // `groupe_entretien`, au début de chaque lecture et de chaque écriture du groupe (pas de fonction programmée) : les
  // groupes qui viennent de finir (fin posée, invitations retirées), puis les messages des groupes finis depuis 24 h.
  function entretien() {
    etat.groupes.filter((g) => !g.fini_le).forEach((g) => {
      const f = finiLe(g.id);
      if (!f) return;
      g.fini_le = f;
      etat.ginvitations = etat.ginvitations.filter((i) => i.groupe_id !== g.id);
      etat.journal.push({ op: 'groupe-fini', groupe: g.id });
    });
    const limite = etat.maintenant().getTime() - GROUPE.HEURES_MESSAGES * 3600000;
    const vieux = etat.groupes.filter((g) => g.fini_le && Date.parse(g.fini_le) <= limite).map((g) => g.id);
    const avant = etat.gmessages.length;
    etat.gmessages = etat.gmessages.filter((x) => vieux.indexOf(x.groupe_id) < 0);
    if (etat.gmessages.length < avant) etat.journal.push({ op: 'groupe-messages-effaces', n: avant - etat.gmessages.length });
  }
  // `groupe_liberer` : ma place ouverte se ferme si MA séance y est finie (les autres continuent) ; vivante, refus.
  function liberer(user) {
    const gid = groupeDe(user);
    if (!gid) return;
    const m = etat.gmembres.filter((x) => x.groupe_id === gid && x.user_id === user)[0];
    if (finDeSeance(m) === null) leve('23505', 'groupe_deja_dans_un');
    m.ferme = true;
    eteindreSiFini(gid);
  }
  // `groupe_membres_avant_ajout` : 6 au plus, jamais avec quelqu'un qu'on bloque, plus d'entrée dans un groupe FINI
  // (v2_087), jamais la séance d'un autre ; un groupe à la fois (l'index unique).
  function ajouterAuGroupe(user, gid, session, exercices) {
    if (groupeDe(user)) leve('23505', 'duplicate key value violates unique constraint "groupe_membres_un_a_la_fois"');
    if (gmembresDe(gid).length >= GROUPE.MAX) leve('23514', 'groupe_plein');
    if (bloqueAvec(gid, user)) leve('23514', 'groupe_bloque');
    if (finiLe(gid)) leve('23514', 'groupe_eteint');
    const s = session && sessions().filter((x) => x.id === session)[0];
    if (s && s.user_id !== user) leve('42501', 'groupe_seance_d_un_autre');
    if (etat.gmembres.some((m) => m.session_id === session)) leve('23505', 'duplicate key value violates unique constraint "groupe_membres_une_seance"');
    etat.gmembres.push({ groupe_id: gid, user_id: user, session_id: session, exercices: (exercices || []).slice(0, GROUPE.EXERCICES_MAX),
      xp: null, entre_le: instantStrict(), ferme: false });
  }
  // `groupe_membres_apres` : quand tous ont fermé le récap (ou sont partis), le groupe s'éteint — messages et invitations avec
  // lui ; v2_087 : le récap se fige d'abord pour ceux qui restent.
  function eteindreSiFini(gid) {
    if (gmembresDe(gid).some((m) => !m.ferme)) return;
    figer(gid);
    etat.groupes = etat.groupes.filter((g) => g.id !== gid);
    etat.gmembres = etat.gmembres.filter((m) => m.groupe_id !== gid);
    etat.ginvitations = etat.ginvitations.filter((i) => i.groupe_id !== gid);
    etat.gmessages = etat.gmessages.filter((x) => x.groupe_id !== gid);
    etat.journal.push({ op: 'groupe-eteint' });
  }
  // `groupe_recap_de` : TOUT ce que chacun a fait dans SA séance (même avant d'avoir rejoint) — tonnage (`Bilan.volumeKg`),
  // séries de travail, séries médaillées du journal (une par série), XP (nulle jeu éteint).
  function recapDe(gid, moi) {
    return gmembresDe(gid).map((m) => ({ m, p: profil(m.user_id) })).filter((x) => x.p && !x.p.deleted_at).map((x) => {
      const m = x.m, s = session(m.session_id), sienne = !!s && s.user_id === m.user_id;
      const siennes = sienne ? sets().filter((t) => t.session_id === m.session_id) : [];
      const travail = siennes.filter((t) => (t.type_serie || 'travail') === 'travail');
      return { pseudo: x.p.username, moi: m.user_id === moi,
        tonnage_kg: Math.round(travail.filter((t) => Number(t.charge_kg) > 0 && Number(t.reps) > 0)
          .reduce((a, t) => a + Number(t.charge_kg) * Number(t.reps), 0) * 100) / 100,
        series: travail.length,
        records: sienne ? new Set(records().filter((r) => r.session_id === m.session_id).map((r) => r.set_id)).size : 0,
        xp: x.p.jeu_actif === false ? null : (m.xp === undefined ? null : m.xp), entre_le: m.entre_le };
    });
  }
  // `groupe_recap_json` : le récap vu par `moi`, la forme figée.
  const recapJson = (gid, moi) => ({ membres: recapDe(gid, moi).map((x) => ({ pseudo: x.pseudo, moi: x.moi, tonnage_kg: x.tonnage_kg,
    series: x.series, records: x.records, xp: x.xp })) });

  // ── Les fonctions de lecture (v2_078), colonnes autorisées seulement ──
  const RPC = {
    social_profil(a) {
      const moi = etat.moi;
      return profils().filter((p) => p.username === a.p_pseudo && !p.deleted_at && !bloque(moi, p.id)).map((p) => {
        const ab = etat.abonnements.filter((x) => x.suiveur === moi && x.suivi === p.id)[0];
        return { id: p.id, pseudo: p.username, niveau: niveau(p), titre: titre(p), compte_prive: p.compte_prive !== false,
                 je_suis: ab ? ab.statut : null, me_suit: suit(p.id, moi) };
      });
    },
    social_rechercher(a) {
      const moi = etat.moi, d = String(a.p_debut || '').trim().toLowerCase();
      if (d.length < 2) return [];
      return profils().filter((p) => String(p.username || '').toLowerCase().indexOf(d) === 0 && !p.deleted_at &&
        p.id !== moi && !bloque(moi, p.id)).sort((x, y) => String(x.username).localeCompare(String(y.username))).slice(0, 20)
        .map((p) => ({ pseudo: p.username, niveau: niveau(p), compte_prive: p.compte_prive !== false }));
    },
    social_fil() {
      const moi = etat.moi, depuis = etat.maintenant().getTime() - 30 * 86400000;
      return sessions().filter((s) => visible(s) && new Date(s.debut).getTime() >= depuis && suit(moi, s.user_id))
        .sort((x, y) => String(y.debut).localeCompare(String(x.debut))).slice(0, 200)
        .map((s) => ({ session_id: s.id, user_id: s.user_id, pseudo: (profil(s.user_id) || {}).username, titre: s.titre || null,
          debut: s.debut, fin: s.fin || null, tonnage_kg: tonnage(s.id),
          j_ai_reagi: etat.reactions.some((r) => r.session_id === s.id && r.user_id === moi) }));
    },
    social_records_seance(a) {
      const s = session(a.p_session);
      if (!visible(s) || !suit(etat.moi, s.user_id)) return [];
      return records().filter((r) => r.session_id === s.id).map((r) => ({ set_id: r.set_id, battu_le: r.battu_le,
        exercise_slug: r.exercise_slug, type: r.type, valeur: r.valeur, charge: r.charge === undefined ? null : r.charge,
        reps: r.reps === undefined ? null : r.reps, unite: r.unite === undefined ? null : r.unite }));
    },
    social_calendrier(a) {
      const de = a.p_de, aa = a.p_a;
      const ecart = (Date.parse(aa) - Date.parse(de)) / 86400000;
      if (!(ecart <= 62) || !suit(etat.moi, a.p_user)) return [];
      return sessions().filter((s) => s.user_id === a.p_user && visible(s) && jour(s.debut) >= de && jour(s.debut) <= aa)
        .sort((x, y) => String(x.debut).localeCompare(String(y.debut)))
        .map((s) => ({ session_id: s.id, titre: s.titre || null, debut: s.debut, tonnage_kg: tonnage(s.id) }));
    },
    social_detail_seance(a) {
      const s = session(a.p_session);
      if (!visible(s) || !mutuel(etat.moi, s.user_id)) return [];
      return sets().filter((t) => t.session_id === s.id).sort((x, y) => (x.rang || 0) - (y.rang || 0))
        .map((t) => ({ exercise_slug: t.exercise_slug, rang: t.rang, charge_kg: t.charge_kg, reps: t.reps,
          duree_s: t.duree_s === undefined ? null : t.duree_s, distance_m: t.distance_m === undefined ? null : t.distance_m,
          type_serie: t.type_serie || 'travail' }));
    },
    social_mes_reactions(a) {
      const s = session(a.p_session);
      if (!s || s.user_id !== etat.moi) return 0;
      return etat.reactions.filter((r) => r.session_id === s.id).length;
    },
    // ── 89 (v2_079) — l'étage 2, MUTUELS SEULEMENT. « Série comptée » : travail, charge > 0, reps > 0. ──
    social_exercices_ami(a) {
      if (!mutuel(etat.moi, a.p_user)) return [];
      const depuis = debutSixMois(), par = {};
      comptees(a.p_user).filter((x) => x.debut >= depuis).forEach((x) => {
        const e = par[x.slug] = par[x.slug] || { exercise_slug: x.slug, charge_max: 0, s: {} };
        e.s[x.session_id] = true;
        if (x.charge > e.charge_max) e.charge_max = x.charge;
      });
      return Object.keys(par).map((k) => ({ exercise_slug: k, charge_max: par[k].charge_max, seances: Object.keys(par[k].s).length }))
        .sort((x, y) => (y.seances - x.seances) || (y.charge_max - x.charge_max) || x.exercise_slug.localeCompare(y.exercise_slug))
        .slice(0, 12);
    },
    social_series_exercice(a) {
      if (!mutuel(etat.moi, a.p_user)) return [];
      const depuis = debutSixMois();
      return comptees(a.p_user).filter((x) => x.slug === a.p_slug && x.debut >= depuis)
        .map((x) => ({ session_id: x.session_id, debut: x.debut, charge_kg: x.charge, reps: x.reps }));
    },
    social_periode(a) {
      const ecart = (Date.parse(a.p_a) - Date.parse(a.p_de)) / 86400000;
      if (!(ecart <= 366) || !mutuel(etat.moi, a.p_user)) return [];
      const l = comptees(a.p_user).filter((x) => jour(x.debut) >= a.p_de && jour(x.debut) <= a.p_a);
      if (!l.length) return [];
      const agreger = (xs, slug) => {
        const s = {};
        xs.forEach((x) => { s[x.session_id] = true; });
        return { exercise_slug: slug, seances: Object.keys(s).length, series: xs.length, reps: xs.reduce((t, x) => t + x.reps, 0),
          tonnage_kg: Math.round(xs.reduce((t, x) => t + x.charge * x.reps, 0) * 100) / 100,
          charge_max: xs.reduce((m, x) => Math.max(m, x.charge), 0) };
      };
      const slugs = Array.from(new Set(l.map((x) => x.slug)));
      return slugs.map((k) => agreger(l.filter((x) => x.slug === k), k)).concat([agreger(l, null)]);
    },
    social_scores_force(a) {
      const moi = etat.moi;
      return etat.scores.filter((f) => f.exercise_slug === a.p_slug && (f.user_id === moi || mutuel(moi, f.user_id)))
        .filter((f) => { const p = profil(f.user_id); return p && !p.deleted_at; })
        .map((f) => ({ user_id: f.user_id, pseudo: profil(f.user_id).username, score: f.score,
          // v2_091 : `CASE WHEN f.user_id = auth.uid() THEN f.charge_kg END` — jamais la charge d'un autre.
          charge_kg: etat.v2_091 && f.user_id !== moi ? null : f.charge_kg, moi: f.user_id === moi }));
    },
    // 114 (v2_091) — la meilleure charge de mes MUTUELS sur 12 mois, dans leurs séances visibles, pour ceux qui ont un
    // score publié sur l'exercice ; jamais la mienne. Avant v2_091 la fonction n'existe pas (PGRST202).
    social_meilleures_charges(a) {
      if (!etat.v2_091) leve('PGRST202', 'Could not find the function public.social_meilleures_charges(p_slug) in the schema cache');
      const moi = etat.moi, m = etat.maintenant();
      const depuis = new Date(m.getFullYear() - 1, m.getMonth(), m.getDate(), m.getHours(), m.getMinutes(), m.getSeconds()).toISOString();
      const avecScore = Array.from(new Set(etat.scores.filter((f) => f.exercise_slug === a.p_slug).map((f) => f.user_id)));
      return avecScore.filter((u) => u !== moi && mutuel(moi, u) && profil(u) && !profil(u).deleted_at).map((u) => {
        const l = comptees(u).filter((x) => x.slug === a.p_slug && new Date(x.debut).toISOString() >= depuis);
        return l.length ? { user_id: u, charge_max: Math.max.apply(null, l.map((x) => x.charge)) } : null;
      }).filter(Boolean);
    },
    // ── 90 (v2_080) — LA GUILDE ──
    guilde_creer(a) {
      const moi = etat.moi;
      if (guildeDe(moi)) leve('23505', 'guilde_deja_dans_une');
      const nom = verifierGuilde(a.p_nom, a.p_couleur);
      if (nomPris(nom)) leve('23505', 'duplicate key value violates unique constraint "guildes_nom_cle_uniq"');
      const g = { id: 'g-' + (++horloge), nom, blason: 'bouclier', couleur: a.p_couleur, admin: moi, cree_le: instant() };
      etat.guildes.push(g);
      ajouterMembre(moi, g.id);
      etat.invitations = etat.invitations.filter((i) => i.invite !== moi);
      etat.journal.push({ op: 'guilde-creee', nom });
      return g.id;
    },
    guilde_modifier(a) {
      const g = etat.guildes.filter((x) => x.admin === etat.moi)[0];
      if (!g) leve('42501', 'guilde_pas_admin');
      const nom = verifierGuilde(a.p_nom, a.p_couleur);
      if (nomPris(nom, g.id)) leve('23505', 'duplicate key value violates unique constraint "guildes_nom_cle_uniq"');
      g.nom = nom; g.couleur = a.p_couleur;
      return null;
    },
    // `guilde_invitations_avant_ajout` : un membre invite SEULEMENT un de ses abonnés mutuels, pas déjà membre.
    guilde_inviter(a) {
      const moi = etat.moi, gid = guildeDe(moi);
      if (!gid) leve('23514', 'guilde_invitant_non_membre');
      if (!mutuel(moi, a.p_user)) leve('23514', 'guilde_invite_non_mutuel');
      if (guildeDe(a.p_user) === gid) leve('23514', 'guilde_deja_membre');
      if (membresDe(gid).length >= GUILDE.MAX) leve('23514', 'guilde_pleine');
      if (!etat.invitations.some((i) => i.guilde_id === gid && i.invite === a.p_user)) {
        etat.invitations.push({ guilde_id: gid, invite: a.p_user, invitant: moi, cree_le: ++horloge });
      }
      etat.journal.push({ op: 'guilde-invitation', invite: a.p_user });
      return null;
    },
    guilde_repondre(a) {
      const moi = etat.moi;
      if (!etat.invitations.some((i) => i.guilde_id === a.p_guilde && i.invite === moi)) leve('42501', 'guilde_sans_invitation');
      if (a.p_rejoindre) {
        if (guildeDe(moi)) leve('23505', 'guilde_deja_dans_une');
        ajouterMembre(moi, a.p_guilde);
        etat.invitations = etat.invitations.filter((i) => i.invite !== moi);
      } else {
        etat.invitations = etat.invitations.filter((i) => !(i.guilde_id === a.p_guilde && i.invite === moi));
      }
      return null;
    },
    guilde_quitter() { retirerMembre(etat.moi); etat.journal.push({ op: 'guilde-depart' }); return null; },
    guilde_retirer_membre(a) {
      const g = guilde(guildeDe(a.p_user));
      if (a.p_user === etat.moi || !g || g.admin !== etat.moi) leve('42501', 'guilde_pas_admin');
      retirerMembre(a.p_user);
      return null;
    },
    guilde_transmettre(a) {
      const g = guilde(guildeDe(a.p_user));
      if (!g || g.admin !== etat.moi) leve('42501', 'guilde_pas_admin');
      g.admin = a.p_user;
      return null;
    },
    // Les défis SÛRS seulement (contrainte `guilde_defis_type`) ; `n` nul pour les séances, 1 à 100 sinon.
    guilde_choisir_defi(a) {
      const g = etat.guildes.filter((x) => x.admin === etat.moi)[0];
      if (!g) leve('42501', 'guilde_pas_admin');
      // `guilde_semaine_lancee` : figé dès qu'un membre a terminé une séance cette semaine.
      if (semaineLancee(g.id)) leve('23514', 'guilde_defi_fige');
      const n = a.p_n === null || a.p_n === undefined ? null : Number(a.p_n);
      if (GUILDE.DEFIS.indexOf(a.p_type) < 0) leve('23514', 'new row for relation "guilde_defis" violates check constraint "guilde_defis_type"');
      if (!((a.p_type === 'seances' && n === null) || (a.p_type !== 'seances' && n >= 1 && n <= 100))) {
        leve('23514', 'new row for relation "guilde_defis" violates check constraint "guilde_defis_n"');
      }
      const semaine = lundiCourant();
      etat.defis = etat.defis.filter((d) => !(d.guilde_id === g.id && d.semaine === semaine));
      etat.defis.push({ guilde_id: g.id, semaine, type: a.p_type, n });
      etat.journal.push({ op: 'guilde-defi', type: a.p_type, n });
      return null;
    },
    guilde_choisir_rang(a) {
      const m = etat.membres.filter((x) => x.user_id === etat.moi)[0];
      if (!m) leve('42501', 'guilde_pas_membre');
      if (GUILDE.RANGS.indexOf(a.p_rang) < 0) leve('23514', 'new row for relation "guilde_membres" violates check constraint "guilde_membres_rang"');
      m.rang = a.p_rang;
      return null;
    },
    guilde_moi() {
      const g = guilde(guildeDe(etat.moi));
      return g ? [{ id: g.id, nom: g.nom, blason: g.blason, couleur: g.couleur, admin: g.admin === etat.moi, membres: membresDe(g.id).length }] : [];
    },
    guilde_liste_membres() {
      const gid = guildeDe(etat.moi);
      if (!gid) return [];
      return membresDe(gid).map((m) => ({ m, p: profil(m.user_id) })).filter((x) => x.p && !x.p.deleted_at).map((x) => ({
        user_id: x.m.user_id, pseudo: x.p.username, rang: x.m.rang, titre: titre(x.p), moi: x.m.user_id === etat.moi, entre_le: x.m.entre_le }));
    },
    guilde_invitations_recues() {
      const moi = etat.moi;
      return etat.invitations.filter((i) => i.invite === moi && !bloque(moi, i.invitant)).sort((a, b) => a.cree_le - b.cree_le).map((i) => {
        const g = guilde(i.guilde_id);
        return { guilde_id: g.id, nom: g.nom, blason: g.blason, couleur: g.couleur, invitant: (profil(i.invitant) || {}).username,
          membres: membresDe(g.id).length };
      });
    },
    guilde_semaine() {
      const gid = guildeDe(etat.moi);
      if (!gid) return [];
      const lundi = lundiCourant(), ids = membresDe(gid).map((m) => m.user_id);
      const d = etat.defis.filter((x) => x.guilde_id === gid && x.semaine === lundi)[0];
      const sc = etat.gscores.filter((x) => ids.indexOf(x.user_id) >= 0 && x.semaine === lundi);
      const ss = seancesDeLaSemaine(gid), sids = ss.map((s) => s.id);
      const travail = sets().filter((t) => sids.indexOf(t.session_id) >= 0 && (t.type_serie || 'travail') === 'travail');
      const medailles = new Set(records().filter((r) => sids.indexOf(r.session_id) >= 0 && GUILDE.TYPES_RECORDS.indexOf(r.type) >= 0)
        .map((r) => r.set_id));
      return [{ semaine: lundi, defi: d ? d.type : 'seances', n: d ? d.n : null, defi_modifiable: !semaineLancee(gid),
        seances_faites: sc.reduce((x, s) => x + Math.min(s.seances, s.prevues), 0), seances_prevues: sc.reduce((x, s) => x + s.prevues, 0),
        records_semaine: sc.reduce((x, s) => x + s.records_semaine, 0),
        exercices: new Set(travail.map((t) => t.exercise_slug)).size, seances: ss.length, medailles: medailles.size,
        tonnage_kg: Math.round(travail.filter((t) => Number(t.charge_kg) > 0 && Number(t.reps) > 0)
          .reduce((x, t) => x + Number(t.charge_kg) * Number(t.reps), 0) * 100) / 100 }];
    },
    guilde_progression() {
      const gid = guildeDe(etat.moi);
      if (!gid) return [];
      const ids = membresDe(gid).map((m) => m.user_id), mois = moisCourant();
      return etat.gscores.filter((x) => ids.indexOf(x.user_id) >= 0 && x.mois === mois)
        .filter((x) => { const p = profil(x.user_id); return p && !p.deleted_at; })
        .map((x) => ({ pseudo: profil(x.user_id).username, moi: x.user_id === etat.moi, exercices: x.exercices, exercices_record: x.exercices_record }));
    },
    guilde_fil() {
      const moi = etat.moi, depuis = etat.maintenant().getTime() - 30 * 86400000;
      return sessions().filter((s) => visible(s) && new Date(s.debut).getTime() >= depuis && s.user_id !== moi && commune(moi, s.user_id))
        .sort((x, y) => String(y.debut).localeCompare(String(x.debut))).slice(0, 200)
        .map((s) => ({ session_id: s.id, user_id: s.user_id, pseudo: (profil(s.user_id) || {}).username, titre: s.titre || null,
          debut: s.debut, fin: s.fin || null, tonnage_kg: tonnage(s.id),
          j_ai_reagi: etat.reactions.some((r) => r.session_id === s.id && r.user_id === moi) }));
    },
    guilde_records_seance(a) {
      const s = session(a.p_session);
      if (!visible(s) || !commune(etat.moi, s.user_id)) return [];
      return records().filter((r) => r.session_id === s.id).map((r) => ({ set_id: r.set_id, battu_le: r.battu_le,
        exercise_slug: r.exercise_slug, type: r.type, valeur: r.valeur, charge: r.charge === undefined ? null : r.charge,
        reps: r.reps === undefined ? null : r.reps, unite: r.unite === undefined ? null : r.unite }));
    },
    // ── 91 (v2_082) — LE GROUPE DE SÉANCE ──
    groupe_creer(a) {
      const moi = etat.moi;
      liberer(moi);
      const g = { id: 'gr-' + (++horloge), createur: moi, cree_le: instant(), fini_le: null };
      etat.groupes.push(g);
      try { ajouterAuGroupe(moi, g.id, a.p_session, a.p_exercices); } catch (e) { etat.groupes = etat.groupes.filter((x) => x !== g); throw e; }
      etat.journal.push({ op: 'groupe-cree' });
      return g.id;
    },
    // `groupe_invitations_avant_ajout` : un membre invite SEULEMENT un de ses abonnés mutuels, sans blocage avec aucun membre.
    groupe_inviter(a) {
      const moi = etat.moi, gid = groupeDe(moi);
      if (!gid) leve('23514', 'groupe_invitant_non_membre');
      if (!mutuel(moi, a.p_user)) leve('23514', 'groupe_invite_non_mutuel');
      if (bloqueAvec(gid, a.p_user)) leve('23514', 'groupe_bloque');
      if (gmembresDe(gid).some((m) => m.user_id === a.p_user)) leve('23514', 'groupe_deja_membre');
      if (gmembresDe(gid).length >= GROUPE.MAX) leve('23514', 'groupe_plein');
      if (!etat.ginvitations.some((i) => i.groupe_id === gid && i.invite === a.p_user)) {
        etat.ginvitations.push({ groupe_id: gid, invite: a.p_user, invitant: moi, cree_le: ++horloge });
      }
      etat.journal.push({ op: 'groupe-invitation', invite: a.p_user });
      return null;
    },
    groupe_annuler_invitation(a) {
      const gid = groupeDe(etat.moi);
      etat.ginvitations = etat.ginvitations.filter((i) => !(i.groupe_id === gid && i.invite === a.p_user));
      return null;
    },
    groupe_repondre(a) {
      const moi = etat.moi;
      if (!etat.ginvitations.some((i) => i.groupe_id === a.p_groupe && i.invite === moi)) leve('42501', 'groupe_sans_invitation');
      if (a.p_rejoindre) {
        liberer(moi);
        ajouterAuGroupe(moi, a.p_groupe, a.p_session, a.p_exercices);
        etat.journal.push({ op: 'groupe-rejoint', user: moi });
      }
      etat.ginvitations = etat.ginvitations.filter((i) => !(i.groupe_id === a.p_groupe && i.invite === moi));
      return null;
    },
    // Partir sans récap (séance abandonnée) : ma place s'efface ; le dernier éteint le groupe.
    groupe_quitter() {
      const gid = groupeDe(etat.moi);
      if (!gid) return null;
      etat.gmembres = etat.gmembres.filter((m) => !(m.user_id === etat.moi && m.groupe_id === gid));
      etat.journal.push({ op: 'groupe-quitte', user: etat.moi });
      eteindreSiFini(gid);
      return null;
    },
    groupe_publier(a) {
      const m = etat.gmembres.filter((x) => x.user_id === etat.moi && !x.ferme)[0];
      if (!m) leve('42501', 'groupe_pas_membre');
      if (a.p_exercices && a.p_exercices.length > GROUPE.EXERCICES_MAX) leve('23514', 'groupe_membres_exercices');
      const xp = a.p_xp === undefined ? null : a.p_xp;
      if (xp !== null && !(Number.isInteger(xp) && xp >= 0 && xp <= 100000)) leve('23514', 'groupe_membres_xp');
      if (a.p_exercices) m.exercices = a.p_exercices.slice();
      m.xp = xp;
      etat.journal.push({ op: 'groupe-publie', exercices: m.exercices.slice(), xp: m.xp });
      return null;
    },
    // Les messages : membres seulement, 1 à 140 caractères (`groupe_messages_texte`). v2_087 : pour le groupe où il a été
    // écrit (`p_groupe`), une seule fois (`p_id`) ; plus rien 24 h après la fin du groupe.
    groupe_envoyer(a) {
      const gid = groupeDe(etat.moi);
      if (!gid || (a.p_groupe && a.p_groupe !== gid)) leve('42501', 'groupe_pas_membre');
      const g = etat.groupes.filter((x) => x.id === gid)[0];
      if (g && g.fini_le && Date.parse(g.fini_le) <= etat.maintenant().getTime() - GROUPE.HEURES_MESSAGES * 3600000) leve('23514', 'groupe_eteint');
      const texte = String(a.p_texte === null || a.p_texte === undefined ? '' : a.p_texte).trim();
      if (texte.length < 1 || Array.from(texte).length > GROUPE.TEXTE_MAX) {
        leve('23514', 'new row for relation "groupe_messages" violates check constraint "groupe_messages_texte"');
      }
      const id = a.p_id || 'gm-' + (++horloge);
      if (etat.gmessages.some((x) => x.id === id)) return null;
      etat.gmessages.push({ id, groupe_id: gid, user_id: etat.moi, texte, cree_le: instant(), n: ++horloge });
      etat.journal.push({ op: 'groupe-message', texte });
      return null;
    },
    // Fermer le récap : il se FIGE pour moi, puis je sors ; le dernier éteint le groupe.
    groupe_fermer() {
      const moi = etat.moi, gid = groupeDe(moi);
      if (!gid) return null;
      const m = etat.gmembres.filter((x) => x.groupe_id === gid && x.user_id === moi)[0];
      const g = etat.groupes.filter((x) => x.id === gid)[0];
      if (!etat.grecaps.some((r) => r.user_id === moi && r.groupe_id === gid)) {
        etat.grecaps.push({ user_id: moi, groupe_id: gid, session_id: m.session_id, le: g.cree_le, recap: recapJson(gid, moi) });
      }
      m.ferme = true;
      etat.journal.push({ op: 'groupe-ferme', user: moi });
      eteindreSiFini(gid);
      return null;
    },
    groupe_moi() {
      const gid = groupeDe(etat.moi), g = etat.groupes.filter((x) => x.id === gid)[0];
      return g ? [{ id: g.id, cree_le: g.cree_le, membres: gmembresDe(g.id).length }] : [];
    },
    // Les membres et l'état de leur séance (statut, début, dernière série validée), leur liste d'exercices.
    groupe_etat() {
      const moi = etat.moi, gid = groupeDe(moi);
      if (!gid) return [];
      return gmembresDe(gid).map((m) => ({ m, p: profil(m.user_id) })).filter((x) => x.p && !x.p.deleted_at).map((x) => {
        const m = x.m, s = session(m.session_id), sienne = s && s.user_id === m.user_id ? s : null;
        const v = sienne ? sets().filter((t) => t.session_id === m.session_id && t.validee_a).map((t) => t.validee_a).sort() : [];
        return { user_id: m.user_id, pseudo: x.p.username, moi: m.user_id === moi, session_id: m.session_id,
          statut: sienne ? (sienne.statut || 'terminee') : null, debut: sienne ? sienne.debut : null,
          derniere: v.length ? v[v.length - 1] : null, exercices: m.exercices.slice(), ferme: m.ferme, entre_le: m.entre_le };
      });
    },
    // LE DIRECT — RÉSERVÉ AUX MEMBRES : les dernières séries validées des AUTRES membres, dans leur séance du groupe.
    groupe_direct() {
      const moi = etat.moi;
      const gid = groupeDe(moi);
      if (!gid) return [];
      const out = [];
      gmembresDe(gid).filter((m) => m.user_id !== moi && !bloque(moi, m.user_id)).forEach((m) => {
        const p = profil(m.user_id), s = session(m.session_id);
        if (!p || p.deleted_at || !s || s.user_id !== m.user_id) return;
        sets().filter((t) => t.session_id === m.session_id && t.validee_a).forEach((t) => out.push({ pseudo: p.username,
          exercise_slug: t.exercise_slug, charge_kg: t.charge_kg === undefined ? null : t.charge_kg, reps: t.reps === undefined ? null : t.reps,
          duree_s: t.duree_s === undefined ? null : t.duree_s, distance_m: t.distance_m === undefined ? null : t.distance_m,
          type_serie: t.type_serie || 'travail', validee_a: t.validee_a }));
      });
      return out.sort((x, y) => String(y.validee_a).localeCompare(String(x.validee_a))).slice(0, GROUPE.DIRECT);
    },
    groupe_messages_lire() {
      const moi = etat.moi, gid = groupeDe(moi);
      if (!gid) return [];
      return etat.gmessages.filter((x) => x.groupe_id === gid && !bloque(moi, x.user_id))
        .filter((x) => { const p = profil(x.user_id); return p && !p.deleted_at; })
        .sort((a, b) => b.n - a.n).slice(0, GROUPE.MESSAGES).reverse()
        .map((x) => ({ pseudo: profil(x.user_id).username, moi: x.user_id === moi, texte: x.texte, cree_le: x.cree_le }));
    },
    // Mes invitations : qui m'invite, la liste d'exercices de sa séance, combien ils sont (pas un groupe fini, v2_087).
    groupe_invitations_recues() {
      const moi = etat.moi;
      return etat.ginvitations.filter((i) => i.invite === moi && !bloque(moi, i.invitant) && !finiLe(i.groupe_id)).sort((a, b) => a.cree_le - b.cree_le).map((i) => {
        const p = profil(i.invitant), m = gmembresDe(i.groupe_id).filter((x) => x.user_id === i.invitant)[0];
        return { groupe_id: i.groupe_id, invitant: p && !p.deleted_at ? p.username : null, exercices: m ? m.exercices.slice() : [],
          membres: gmembresDe(i.groupe_id).length };
      }).filter((x) => x.invitant);
    },
    groupe_invitations_envoyees() {
      const gid = groupeDe(etat.moi);
      return etat.ginvitations.filter((i) => gid && i.groupe_id === gid).map((i) => ({ user_id: i.invite, pseudo: (profil(i.invite) || {}).username }))
        .sort((a, b) => String(a.pseudo).localeCompare(String(b.pseudo)));
    },
    groupe_recap() {
      const gid = groupeDe(etat.moi);
      if (!gid) return [];
      const g = etat.groupes.filter((x) => x.id === gid)[0];
      return recapDe(gid, etat.moi).map((x) => ({ pseudo: x.pseudo, moi: x.moi, tonnage_kg: x.tonnage_kg, series: x.series,
        records: x.records, xp: x.xp, le: g.cree_le }));
    },
    // v2_087 — le récap figé d'une de MES séances ; sinon, tant que le groupe existe, celui du moment.
    groupe_recap_seance(a) {
      const figes = etat.grecaps.filter((r) => r.session_id === a.p_session && r.user_id === etat.moi);
      if (figes.length) return figes.slice(-1).map((r) => ({ le: r.le, recap: JSON.parse(JSON.stringify(r.recap)) }));
      const m = etat.gmembres.filter((x) => x.session_id === a.p_session && x.user_id === etat.moi)[0];
      const g = m && etat.groupes.filter((x) => x.id === m.groupe_id)[0];
      return g ? [{ le: g.cree_le, recap: recapJson(g.id, etat.moi) }] : [];
    },
    social_liens() {
      const moi = etat.moi, out = [];
      const ligne = (p, lien) => ({ user_id: p.id, pseudo: p.username, niveau: lien === 'bloque' ? null : niveau(p), lien });
      etat.abonnements.forEach((x) => {
        if (x.suivi === moi) { const p = profil(x.suiveur); if (p && !p.deleted_at) out.push(ligne(p, x.statut === 'demande' ? 'demande_recue' : 'abonne')); }
        if (x.suiveur === moi) { const p = profil(x.suivi); if (p && !p.deleted_at) out.push(ligne(p, x.statut === 'demande' ? 'demande_envoyee' : 'abonnement')); }
      });
      etat.blocages.filter((b) => b.bloqueur === moi).forEach((b) => { const p = profil(b.bloque); if (p) out.push(ligne(p, 'bloque')); });
      return out;
    }
  };

  // Les filtres PostgREST (`col=eq.valeur`).
  function filtres(url) {
    const f = {};
    url.searchParams.forEach((v, k) => { const m = /^eq\.(.*)$/.exec(v); if (m) f[k] = m[1]; });
    return f;
  }
  const correspond = (ligne, f) => Object.keys(f).every((k) => String(ligne[k]) === f[k]);

  function bloquerApres(b) {
    // 91 (v2_082) — `groupe_apres_blocage` : bloquer en plein groupe fait partir celui qui bloque (en silence), et retire
    // les invitations entre eux.
    const gid = groupeDe(b.bloqueur);
    if (gid && gmembresDe(gid).some((m) => m.user_id === b.bloque)) {
      etat.gmembres = etat.gmembres.filter((m) => !(m.user_id === b.bloqueur && m.groupe_id === gid));
      eteindreSiFini(gid);
    }
    etat.ginvitations = etat.ginvitations.filter((i) => !((i.invitant === b.bloqueur && i.invite === b.bloque) ||
      (i.invitant === b.bloque && i.invite === b.bloqueur)));
    // `blocages_apres_ajout` : les abonnements dans les DEUX sens, et les réactions croisées.
    etat.abonnements = etat.abonnements.filter((x) => !((x.suiveur === b.bloqueur && x.suivi === b.bloque) ||
      (x.suiveur === b.bloque && x.suivi === b.bloqueur)));
    etat.reactions = etat.reactions.filter((r) => {
      const s = session(r.session_id);
      if (!s) return true;
      return !((r.user_id === b.bloque && s.user_id === b.bloqueur) || (r.user_id === b.bloqueur && s.user_id === b.bloque));
    });
  }

  const TABLES = {
    abonnements: {
      POST(corps) {
        const l = Array.isArray(corps) ? corps[0] : corps;
        if (!l || l.suiveur !== etat.moi) return refus('42501', 'abonnements_ajout', 403);
        if (l.suiveur === l.suivi) return refus('23514', 'abonnements_check');
        if (bloque(l.suiveur, l.suivi)) return refus('P0001', 'bloque');
        if (etat.abonnements.some((x) => x.suiveur === l.suiveur && x.suivi === l.suivi)) return refus('23505', 'abonnements_pkey', 409);
        const cible = profil(l.suivi);
        const prive = !cible || cible.compte_prive !== false;
        const ligne = { suiveur: l.suiveur, suivi: l.suivi, statut: prive ? 'demande' : 'accepte',
          cree_le: new Date().toISOString(), accepte_le: prive ? null : new Date().toISOString() };
        etat.abonnements.push(ligne);
        etat.journal.push({ op: 'abonnement', ligne: Object.assign({}, ligne) });
        return { status: 201, data: [] };
      },
      PATCH(corps, f) {
        const lignes = etat.abonnements.filter((x) => correspond(x, f) && x.suivi === etat.moi);
        for (const x of lignes) {
          if (!(x.statut === 'demande' && corps.statut === 'accepte') || Object.keys(corps).some((k) => k !== 'statut')) {
            return refus('P0001', 'modification refusée');
          }
        }
        lignes.forEach((x) => { x.statut = 'accepte'; x.accepte_le = new Date().toISOString(); });
        etat.journal.push({ op: 'acceptation', n: lignes.length });
        return { status: 204, data: [] };
      },
      DELETE(corps, f) {
        const avant = etat.abonnements.length;
        etat.abonnements = etat.abonnements.filter((x) => !(correspond(x, f) && (x.suiveur === etat.moi || x.suivi === etat.moi)));
        etat.journal.push({ op: 'retrait-abonnement', n: avant - etat.abonnements.length });
        return { status: 204, data: [] };
      }
    },
    blocages: {
      POST(corps) {
        const l = Array.isArray(corps) ? corps[0] : corps;
        if (!l || l.bloqueur !== etat.moi) return refus('42501', 'blocages_miens', 403);
        if (etat.blocages.some((x) => x.bloqueur === l.bloqueur && x.bloque === l.bloque)) return refus('23505', 'blocages_pkey', 409);
        const b = { bloqueur: l.bloqueur, bloque: l.bloque, cree_le: new Date().toISOString() };
        etat.blocages.push(b);
        bloquerApres(b);
        etat.journal.push({ op: 'blocage', ligne: Object.assign({}, b) });
        return { status: 201, data: [] };
      },
      DELETE(corps, f) {
        etat.blocages = etat.blocages.filter((x) => !(correspond(x, f) && x.bloqueur === etat.moi));
        etat.journal.push({ op: 'deblocage' });
        return { status: 204, data: [] };
      }
    },
    // 89 (v2_079) — mes scores de force : écrits par leur propriétaire seul, et SEULEMENT ces colonnes. ⚠️ Un corps qui
    // porte autre chose (le poids de corps, par exemple) est refusé ET compté comme une fuite. 114 (v2_091) : la
    // charge est refusée ; avant v2_091 (`etat.v2_091 = false`), elle est exigée.
    scores_force: {
      POST(corps) {
        const lignes = Array.isArray(corps) ? corps : [corps];
        for (const l of lignes) {
          const autres = Object.keys(l || {}).filter((k) => COLONNES_SCORES.indexOf(k) < 0);
          if (autres.length) {
            etat.fuites.push({ table: 'scores_force', champs: autres });
            return refus('PGRST204', 'scores_force : colonne inconnue ' + autres.join(', '));
          }
          if (!l || l.user_id !== etat.moi) return refus('42501', 'scores_force_miens', 403);
          if (!(Number(l.score) > 0 && Number(l.score) < 2000)) return refus('23514', 'scores_force_score_check');
          const charge = l.charge_kg === undefined || l.charge_kg === null ? null : l.charge_kg;
          if (etat.v2_091) {
            // v2_091 : `scores_force_sans_charge CHECK (charge_kg IS NULL)`.
            if (charge !== null) return refus('23514', 'scores_force_sans_charge');
          } else {
            // v2_079 : `charge_kg numeric NOT NULL CHECK (charge_kg > 0 AND charge_kg < 1000)`.
            if (charge === null) return refus('23502', 'null value in column "charge_kg" of relation "scores_force" violates not-null constraint');
            if (!(Number(charge) > 0 && Number(charge) < 1000)) return refus('23514', 'scores_force_charge_kg_check');
          }
        }
        lignes.forEach((l) => {
          etat.scores = etat.scores.filter((f) => !(f.user_id === l.user_id && f.exercise_slug === l.exercise_slug));
          etat.scores.push({ user_id: l.user_id, exercise_slug: l.exercise_slug, score: Number(l.score),
            charge_kg: l.charge_kg === undefined || l.charge_kg === null ? null : Number(l.charge_kg),
            maj_le: new Date().toISOString() });
        });
        etat.journal.push({ op: 'scores', n: lignes.length, corps: JSON.parse(JSON.stringify(lignes)) });
        return { status: 201, data: [] };
      },
      DELETE(corps, f) {
        const avant = etat.scores.length;
        etat.scores = etat.scores.filter((x) => !(correspond(x, f) && x.user_id === etat.moi));
        etat.journal.push({ op: 'retrait-scores', n: avant - etat.scores.length });
        return { status: 204, data: [] };
      }
    },
    // 90 (v2_080) — mes nombres de guilde : écrits par leur propriétaire seul, et SEULEMENT ces colonnes (une autre est
    // refusée ET comptée comme une fuite). Les contraintes de la table, recopiées.
    guilde_scores: {
      POST(corps) {
        const lignes = Array.isArray(corps) ? corps : [corps];
        for (const l of lignes) {
          const autres = Object.keys(l || {}).filter((k) => GUILDE.COLONNES_SCORES.indexOf(k) < 0);
          if (autres.length) {
            etat.fuites.push({ table: 'guilde_scores', champs: autres });
            return refus('PGRST204', 'guilde_scores : colonne inconnue ' + autres.join(', '));
          }
          if (!l || l.user_id !== etat.moi) return refus('42501', 'guilde_scores_miens', 403);
          const entier = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
          const lundi = /^\d{4}-\d{2}-\d{2}$/.test(l.semaine) && new Date(l.semaine + 'T12:00:00').getDay() === 1;
          if (!lundi || !/^\d{4}-\d{2}-01$/.test(l.mois) || !entier(l.seances, 0, 100) || !entier(l.prevues, 0, 14) ||
            !entier(l.records_semaine, 0, 1000) || !entier(l.exercices, 0, 500) || !entier(l.exercices_record, 0, 500) ||
            l.exercices_record > l.exercices) return refus('23514', 'guilde_scores_check');
        }
        lignes.forEach((l) => {
          etat.gscores = etat.gscores.filter((x) => x.user_id !== l.user_id);
          etat.gscores.push(Object.assign({}, l, { maj_le: new Date().toISOString() }));
        });
        etat.journal.push({ op: 'guilde-scores', corps: JSON.parse(JSON.stringify(lignes)) });
        return { status: 201, data: [] };
      }
    },
    reactions_seance: {
      POST(corps) {
        const l = Array.isArray(corps) ? corps[0] : corps;
        const s = session(l && l.session_id);
        // `reactions_ajout` (v2_078 : une personne que je suis) OU `reactions_guilde` (v2_080 : un membre de ma guilde).
        if (!l || l.user_id !== etat.moi || !visible(s) || !(suit(etat.moi, s.user_id) ||
          (s.user_id !== etat.moi && commune(etat.moi, s.user_id)))) return refus('42501', 'reactions_ajout', 403);
        if (etat.reactions.some((r) => r.session_id === l.session_id && r.user_id === l.user_id)) return refus('23505', 'reactions_pkey', 409);
        etat.reactions.push({ session_id: l.session_id, user_id: l.user_id, cree_le: new Date().toISOString() });
        etat.journal.push({ op: 'reaction', session_id: l.session_id });
        return { status: 201, data: [] };
      },
      DELETE(corps, f) {
        etat.reactions = etat.reactions.filter((r) => !(correspond(r, f) && r.user_id === etat.moi));
        etat.journal.push({ op: 'retrait-reaction' });
        return { status: 204, data: [] };
      }
    }
  };

  const GROUPE_ETAT = ['groupes', 'gmembres', 'ginvitations', 'gmessages', 'grecaps'];
  // Rend `{ status, data }` si la requête est sociale, `null` sinon.
  function gerer(methode, url, corps) {
    const morceaux = url.pathname.split('/');
    const nom = morceaux.pop();
    if (morceaux.pop() === 'rpc' && RPC[nom]) {
      let data;
      etat.appels.push(nom);
      // 106 (v2_087) — chaque fonction du groupe entretient d'abord ; et, comme une transaction, un refus annule tout.
      const avant = /^groupe_/.test(nom) ? JSON.stringify(GROUPE_ETAT.map((k) => etat[k])) : null;
      try {
        if (avant) entretien();
        data = RPC[nom](corps || {});
      } catch (e) {
        if (e instanceof Refus) {
          if (avant) JSON.parse(avant).forEach((v, i) => { etat[GROUPE_ETAT[i]] = v; });
          return refus(e.code, e.message, e.code === '42501' ? 403 : e.code === '23505' ? 409 : 400);
        }
        throw e;
      }
      const interdits = champsInterdits(data);
      if (interdits.length) etat.fuites.push({ fonction: nom, champs: interdits });
      return { status: 200, data };
    }
    if (!TABLES[nom]) return null;
    const t = TABLES[nom][methode];
    if (!t) return refus('42501', nom + ' : ' + methode + ' non pris en charge', 403);
    return t(corps, filtres(url));
  }

  // Agir au nom d'une autre personne (son « auth.uid() »), le temps de `f`.
  function comme(id, f) {
    const avant = etat.moi;
    etat.moi = id;
    try { return f(); } finally { etat.moi = avant; }
  }
  // Un appel direct (sans navigateur), au nom de `id` : `appeler('u-lea', 'POST', 'abonnements', {...})`.
  function appeler(id, methode, nom, corps, recherche) {
    const url = new URL('https://banc.supabase.co/rest/v1/' + nom + (recherche ? '?' + recherche : ''));
    return comme(id, () => gerer(methode, url, corps));
  }
  function rpc(id, nom, args) {
    return comme(id, () => gerer('POST', new URL('https://banc.supabase.co/rest/v1/rpc/' + nom), args || {})).data;
  }

  return { etat, gerer, comme, appeler, rpc, suit, mutuel, bloque, tonnage, guildeDe, lundiCourant, moisCourant, groupeDe, finiLe };
}

function champsInterdits(x) {
  const trouves = [];
  (function voir(v) {
    if (Array.isArray(v)) return v.forEach(voir);
    if (v && typeof v === 'object') {
      Object.keys(v).forEach((k) => {
        if (CHAMPS_INTERDITS.indexOf(k) >= 0 && trouves.indexOf(k) < 0) trouves.push(k);
        voir(v[k]);
      });
    }
  })(x);
  return trouves;
}

module.exports = { creer, champsInterdits, CHAMPS_INTERDITS, GUILDE, GROUPE, cleDuNom };
