// tests/banc/faux-social.js — le faux serveur du social (87, SOCIAL-V1, migration v2_078).
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

function creer(base, options) {
  const o = options || {};
  const etat = {
    moi: o.moi || 'u-banc',
    profils: [], sessions: [], sets: [], records: [],
    abonnements: [], blocages: [], reactions: [],
    journal: [], fuites: [], appels: [],
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

  const refus = (code, message, status) => {
    etat.journal.push({ op: 'refus', refus: code, message });
    return { status: status || 400, data: { code, message, details: message } };
  };

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
    reactions_seance: {
      POST(corps) {
        const l = Array.isArray(corps) ? corps[0] : corps;
        const s = session(l && l.session_id);
        if (!l || l.user_id !== etat.moi || !visible(s) || !suit(etat.moi, s.user_id)) return refus('42501', 'reactions_ajout', 403);
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

  // Rend `{ status, data }` si la requête est sociale, `null` sinon.
  function gerer(methode, url, corps) {
    const morceaux = url.pathname.split('/');
    const nom = morceaux.pop();
    if (morceaux.pop() === 'rpc' && RPC[nom]) {
      const data = RPC[nom](corps || {});
      etat.appels.push(nom);
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

  return { etat, gerer, comme, appeler, rpc, suit, mutuel, bloque, tonnage };
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

module.exports = { creer, champsInterdits, CHAMPS_INTERDITS };
