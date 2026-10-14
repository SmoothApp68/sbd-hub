-- v2_082_groupe — le groupe de séance, éphémère (décidé le 14/10/2026, maquettes `maquette-social-groupe-v1.html` et
-- `maquette-groupe-direct-interactive.html`). PROPOSÉE par Claude Code (prompt 91), sur le modèle de v2_078 et v2_080 :
-- Claude.ai la relit et la lance, APRÈS v2_080 et v2_081.
--
-- Un groupe vit le temps d'une séance : lancé depuis sa séance en cours, 2 à 6 personnes, abonnés MUTUELS seulement, un
-- groupe à la fois par personne, jamais deux personnes qui se bloquent. Chacun garde SA séance : aucune donnée de séance
-- n'est mélangée — le groupe ne porte que l'identifiant de la séance de chacun, la liste de ses exercices (pour « Suivre
-- la séance de X ») et son XP de la séance (nulle jeu éteint). CES RÈGLES SONT EN BASE (contraintes et déclencheurs), pas
-- seulement dans l'app.
--
-- Le direct (la dernière série validée de chacun) et les messages sont RÉSERVÉS AUX MEMBRES : ni abonnés, ni guilde. Les
-- messages (≤ 140 caractères) sont effacés à l'extinction du groupe. Le récap du « combat » compte TOUT ce que chacun a
-- fait dans sa séance, même avant d'avoir rejoint (décision d'Aurélien) ; il se FIGE pour chacun à la fermeture
-- (`groupe_recaps`, lisible par son propriétaire seul, depuis le détail de sa séance) ; le groupe s'éteint quand tous
-- l'ont fermé (les messages et les invitations partent avec lui).
--
-- « Un membre sans série validée depuis 45 min compte comme terminé » : la règle de la séance vivante vit dans l'app
-- (`Seance.estVivante`, ECRAN-SAISIE §7 duovicies.1 ter) ; la base rend les faits (statut, début, dernière série validée)
-- et ne la recopie pas.
--
-- Aucune politique ajoutée sur sessions/sets/records : les membres ne se lisent QUE par les fonctions ci-dessous
-- (SECURITY DEFINER — une politique qui lirait `sessions` passerait par son RLS, propriétaire seul : la leçon de v2_078),
-- qui ne rendent que les colonnes autorisées (jamais poids_corps_kg, note, rpe, ressenti, douleur, santé).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='groupes') THEN
    RAISE EXCEPTION 'pré-contrôle : groupes existe déjà';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='social_mutuel' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'pré-contrôle : v2_078 (social_mutuel) absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guildes') THEN
    RAISE EXCEPTION 'pré-contrôle : v2_080 (guildes) absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sets'
                 AND column_name='validee_a') THEN
    RAISE EXCEPTION 'pré-contrôle : sets.validee_a absente';
  END IF;
END $$;

-- ── LES TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.groupes (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  createur uuid NOT NULL,
  cree_le  timestamptz NOT NULL DEFAULT now()
);

-- Un membre : SA séance (aucune clé étrangère : la séance peut arriver en base après le groupe, par la file d'envoi),
-- la liste de ses exercices (des identifiants du catalogue, rien d'autre), son XP de la séance (nulle jeu éteint),
-- `ferme` : il a fermé le récap du groupe.
CREATE TABLE public.groupe_membres (
  groupe_id  uuid NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  exercices  text[] NOT NULL DEFAULT '{}' CONSTRAINT groupe_membres_exercices CHECK (cardinality(exercices) <= 60),
  xp         integer CONSTRAINT groupe_membres_xp CHECK (xp BETWEEN 0 AND 100000),
  entre_le   timestamptz NOT NULL DEFAULT clock_timestamp(),
  ferme      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (groupe_id, user_id)
);
-- UN GROUPE À LA FOIS PAR PERSONNE (celui dont elle n'a pas encore fermé le récap) ; une séance dans un seul groupe.
CREATE UNIQUE INDEX groupe_membres_un_a_la_fois ON public.groupe_membres (user_id) WHERE NOT ferme;
CREATE UNIQUE INDEX groupe_membres_une_seance ON public.groupe_membres (session_id);

CREATE TABLE public.groupe_invitations (
  groupe_id uuid NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  invite    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitant  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cree_le   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (groupe_id, invite)
);
CREATE INDEX groupe_invitations_invite ON public.groupe_invitations (invite);

-- Les messages : 1 à 140 caractères, effacés avec le groupe (cascade).
CREATE TABLE public.groupe_messages (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id uuid NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texte     text NOT NULL CONSTRAINT groupe_messages_texte CHECK (texte = btrim(texte) AND char_length(texte) BETWEEN 1 AND 140),
  cree_le   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX groupe_messages_groupe ON public.groupe_messages (groupe_id, cree_le);

-- Le récap FIGÉ, un par personne et par groupe : il survit au groupe, lisible par son propriétaire seul (depuis le
-- détail de sa séance). Pas les messages. Aucune colonne de poids, de note, d'effort ; le récap porte des pseudos et des
-- totaux (tonnage, séries, records, XP).
CREATE TABLE public.groupe_recaps (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  groupe_id  uuid NOT NULL,
  session_id uuid NOT NULL,
  le         timestamptz NOT NULL,
  recap      jsonb NOT NULL,
  fige_le    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, groupe_id)
);
CREATE INDEX groupe_recaps_seance ON public.groupe_recaps (session_id);

-- ── LES RÈGLES, EN BASE ────────────────────────────────────────────────────────────────────────────────────────────
-- Mon groupe vivant (celui dont je n'ai pas fermé le récap).
CREATE FUNCTION public.groupe_de(p_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_id FROM groupe_membres WHERE user_id = p_user AND NOT ferme $f$;

-- Bloqué avec un membre du groupe (dans un sens ou dans l'autre).
CREATE FUNCTION public.groupe_bloque_avec(p_groupe uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM groupe_membres m WHERE m.groupe_id = p_groupe AND m.user_id <> p_user
                 AND social_bloque(m.user_id, p_user)) $f$;

-- 6 MEMBRES AU PLUS (la ligne du groupe est verrouillée : deux entrées simultanées ne passent pas à 7) ; jamais avec
-- quelqu'un qu'on bloque ou qui nous bloque ; plus d'entrée une fois le récap fermé par un membre (le groupe s'éteint).
CREATE FUNCTION public.groupe_membres_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM 1 FROM groupes WHERE id = NEW.groupe_id FOR UPDATE;
  IF (SELECT count(*) FROM groupe_membres WHERE groupe_id = NEW.groupe_id) >= 6 THEN
    RAISE EXCEPTION 'groupe_plein' USING ERRCODE = 'check_violation';
  END IF;
  IF groupe_bloque_avec(NEW.groupe_id, NEW.user_id) THEN
    RAISE EXCEPTION 'groupe_bloque' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM groupe_membres WHERE groupe_id = NEW.groupe_id AND ferme) THEN
    RAISE EXCEPTION 'groupe_eteint' USING ERRCODE = 'check_violation';
  END IF;
  -- Une séance : la mienne (ou pas encore arrivée en base), jamais celle d'un autre.
  IF EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND user_id <> NEW.user_id) THEN
    RAISE EXCEPTION 'groupe_seance_d_un_autre' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.entre_le := clock_timestamp(); NEW.ferme := false; NEW.xp := NULL;
  RETURN NEW;
END $f$;
CREATE TRIGGER groupe_membres_avant_ajout BEFORE INSERT ON public.groupe_membres
  FOR EACH ROW EXECUTE FUNCTION public.groupe_membres_avant_ajout();

-- Seuls changent : la liste des exercices, l'XP, et `ferme` (de faux à vrai, jamais l'inverse).
CREATE FUNCTION public.groupe_membres_avant_modif() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF NEW.groupe_id <> OLD.groupe_id OR NEW.user_id <> OLD.user_id OR NEW.session_id <> OLD.session_id
     OR NEW.entre_le <> OLD.entre_le OR (OLD.ferme AND NOT NEW.ferme) THEN
    RAISE EXCEPTION 'groupe_membre_modification' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER groupe_membres_avant_modif BEFORE UPDATE ON public.groupe_membres
  FOR EACH ROW EXECUTE FUNCTION public.groupe_membres_avant_modif();

-- L'EXTINCTION : quand tous les membres ont fermé le récap (ou sont partis), le groupe disparaît — et avec lui ses
-- messages et ses invitations (cascade). Les récaps figés restent.
CREATE FUNCTION public.groupe_membres_apres() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid := coalesce(NEW.groupe_id, OLD.groupe_id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM groupe_membres WHERE groupe_id = g AND NOT ferme) THEN
    DELETE FROM groupes WHERE id = g;
  END IF;
  RETURN NULL;
END $f$;
CREATE TRIGGER groupe_membres_apres AFTER UPDATE OF ferme OR DELETE ON public.groupe_membres
  FOR EACH ROW EXECUTE FUNCTION public.groupe_membres_apres();

-- INVITER : un membre (récap non fermé), et SEULEMENT un de ses abonnés mutuels, sans blocage avec aucun membre, pas
-- déjà membre, groupe non plein.
CREATE FUNCTION public.groupe_invitations_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF groupe_de(NEW.invitant) IS DISTINCT FROM NEW.groupe_id THEN
    RAISE EXCEPTION 'groupe_invitant_non_membre' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT social_mutuel(NEW.invitant, NEW.invite) THEN
    RAISE EXCEPTION 'groupe_invite_non_mutuel' USING ERRCODE = 'check_violation';
  END IF;
  IF groupe_bloque_avec(NEW.groupe_id, NEW.invite) THEN
    RAISE EXCEPTION 'groupe_bloque' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM groupe_membres WHERE groupe_id = NEW.groupe_id AND user_id = NEW.invite) THEN
    RAISE EXCEPTION 'groupe_deja_membre' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM groupe_membres WHERE groupe_id = NEW.groupe_id) >= 6 THEN
    RAISE EXCEPTION 'groupe_plein' USING ERRCODE = 'check_violation';
  END IF;
  NEW.cree_le := now();
  RETURN NEW;
END $f$;
CREATE TRIGGER groupe_invitations_avant_ajout BEFORE INSERT ON public.groupe_invitations
  FOR EACH ROW EXECUTE FUNCTION public.groupe_invitations_avant_ajout();

-- DEUX PERSONNES QUI SE BLOQUENT NE SONT PAS DANS LE MÊME GROUPE : bloquer en plein groupe fait partir celui qui bloque
-- (en silence ; sa séance continue), et retire les invitations entre eux.
CREATE FUNCTION public.groupe_apres_blocage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  DELETE FROM groupe_membres m WHERE m.user_id = NEW.bloqueur AND NOT m.ferme
    AND EXISTS (SELECT 1 FROM groupe_membres x WHERE x.groupe_id = m.groupe_id AND x.user_id = NEW.bloque);
  DELETE FROM groupe_invitations WHERE (invitant = NEW.bloqueur AND invite = NEW.bloque)
    OR (invitant = NEW.bloque AND invite = NEW.bloqueur);
  RETURN NULL;
END $f$;
CREATE TRIGGER groupe_apres_blocage AFTER INSERT ON public.blocages
  FOR EACH ROW EXECUTE FUNCTION public.groupe_apres_blocage();

-- ── LES DROITS ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- AUCUNE écriture ni lecture directe : seulement les fonctions ci-dessous. Aucune politique.
ALTER TABLE public.groupes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupe_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupe_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupe_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupe_recaps ENABLE ROW LEVEL SECURITY;

-- ── LES GESTES (une fonction chacun ; l'appelant est auth.uid()) ───────────────────────────────────────────────────
-- Lancer un groupe depuis sa séance en cours.
CREATE FUNCTION public.groupe_creer(p_session uuid, p_exercices text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'groupe_sans_compte' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF groupe_de(auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'groupe_deja_dans_un' USING ERRCODE = 'unique_violation'; END IF;
  INSERT INTO groupes (createur) VALUES (auth.uid()) RETURNING id INTO g;
  INSERT INTO groupe_membres (groupe_id, user_id, session_id, exercices) VALUES (g, auth.uid(), p_session, coalesce(p_exercices, '{}'));
  RETURN g;
END $f$;

CREATE FUNCTION public.groupe_inviter(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  INSERT INTO groupe_invitations (groupe_id, invite, invitant) VALUES (groupe_de(auth.uid()), p_user, auth.uid())
    ON CONFLICT (groupe_id, invite) DO NOTHING;
END $f$;

CREATE FUNCTION public.groupe_annuler_invitation(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  DELETE FROM groupe_invitations WHERE groupe_id = groupe_de(auth.uid()) AND invite = p_user $f$;

-- Rejoindre (avec sa séance, déjà commencée) ou retirer l'invitation, en silence. « Pas maintenant » n'appelle rien :
-- l'invitation reste, tant que le groupe vit.
CREATE FUNCTION public.groupe_repondre(p_groupe uuid, p_rejoindre boolean, p_session uuid, p_exercices text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM groupe_invitations WHERE groupe_id = p_groupe AND invite = auth.uid()) THEN
    RAISE EXCEPTION 'groupe_sans_invitation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_rejoindre THEN
    IF groupe_de(auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'groupe_deja_dans_un' USING ERRCODE = 'unique_violation'; END IF;
    INSERT INTO groupe_membres (groupe_id, user_id, session_id, exercices)
      VALUES (p_groupe, auth.uid(), p_session, coalesce(p_exercices, '{}'));
    DELETE FROM groupe_invitations WHERE groupe_id = p_groupe AND invite = auth.uid();
  ELSE
    DELETE FROM groupe_invitations WHERE groupe_id = p_groupe AND invite = auth.uid();
  END IF;
END $f$;

-- Partir sans récap (séance abandonnée) : ma place s'efface, le groupe continue — ou s'éteint si j'étais le dernier.
CREATE FUNCTION public.groupe_quitter() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  DELETE FROM groupe_membres WHERE user_id = auth.uid() AND NOT ferme $f$;

-- Ma liste d'exercices (pour qui suit ma séance) et mon XP de la séance (nulle jeu éteint).
CREATE FUNCTION public.groupe_publier(p_exercices text[], p_xp integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  UPDATE groupe_membres SET exercices = coalesce(p_exercices, exercices), xp = p_xp
    WHERE user_id = auth.uid() AND NOT ferme;
  IF NOT FOUND THEN RAISE EXCEPTION 'groupe_pas_membre' USING ERRCODE = 'insufficient_privilege'; END IF;
END $f$;

CREATE FUNCTION public.groupe_envoyer(p_texte text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid := groupe_de(auth.uid());
BEGIN
  IF g IS NULL THEN RAISE EXCEPTION 'groupe_pas_membre' USING ERRCODE = 'insufficient_privilege'; END IF;
  INSERT INTO groupe_messages (groupe_id, user_id, texte) VALUES (g, auth.uid(), btrim(p_texte));
END $f$;

-- Le récap du « combat », membre par membre : TOUT ce que chacun a fait dans SA séance (même avant d'avoir rejoint).
--   tonnage_kg : `Bilan.volumeKg` (séries de travail, charge > 0, reps > 0, au centième) ;
--   series     : ses séries de travail ;
--   records    : les séries médaillées du journal des records (une par série, la règle du fil et du récap) ;
--   xp         : son XP de la séance, nulle si son jeu est éteint.
CREATE FUNCTION public.groupe_recap_de(p_groupe uuid, p_moi uuid)
RETURNS TABLE(pseudo text, moi boolean, tonnage_kg numeric, series integer, records integer, xp integer, entre_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p.username, m.user_id = p_moi,
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t JOIN sessions s ON s.id = t.session_id
       WHERE t.session_id = m.session_id AND s.user_id = m.user_id AND coalesce(t.type_serie,'travail') = 'travail'
         AND t.charge_kg > 0 AND t.reps > 0),
    (SELECT count(*)::int FROM sets t JOIN sessions s ON s.id = t.session_id
       WHERE t.session_id = m.session_id AND s.user_id = m.user_id AND coalesce(t.type_serie,'travail') = 'travail'),
    (SELECT count(DISTINCT r.set_id)::int FROM records r JOIN sessions s ON s.id = r.session_id
       WHERE r.session_id = m.session_id AND s.user_id = m.user_id),
    CASE WHEN p.jeu_actif THEN m.xp END,
    m.entre_le
  FROM groupe_membres m JOIN profiles p ON p.id = m.user_id
  WHERE m.groupe_id = p_groupe AND p.deleted_at IS NULL
  ORDER BY m.entre_le, m.user_id $f$;

-- Fermer le récap du groupe : il se FIGE pour moi (lisible depuis le détail de ma séance), puis je sors ; le dernier
-- éteint le groupe (déclencheur).
CREATE FUNCTION public.groupe_fermer() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid := groupe_de(auth.uid()); r jsonb; s uuid; le timestamptz;
BEGIN
  IF g IS NULL THEN RETURN; END IF;
  SELECT session_id INTO s FROM groupe_membres WHERE groupe_id = g AND user_id = auth.uid();
  SELECT cree_le INTO le FROM groupes WHERE id = g;
  SELECT jsonb_build_object('membres', coalesce(jsonb_agg(jsonb_build_object('pseudo', x.pseudo, 'moi', x.moi,
           'tonnage_kg', x.tonnage_kg, 'series', x.series, 'records', x.records, 'xp', x.xp) ORDER BY x.entre_le), '[]'::jsonb))
    INTO r FROM groupe_recap_de(g, auth.uid()) x;
  INSERT INTO groupe_recaps (user_id, groupe_id, session_id, le, recap) VALUES (auth.uid(), g, s, le, r)
    ON CONFLICT (user_id, groupe_id) DO NOTHING;
  UPDATE groupe_membres SET ferme = true WHERE groupe_id = g AND user_id = auth.uid();
END $f$;

-- ── LES LECTURES (membres seulement) ───────────────────────────────────────────────────────────────────────────────
-- Mon groupe vivant (zéro ou une ligne).
CREATE FUNCTION public.groupe_moi()
RETURNS TABLE(id uuid, cree_le timestamptz, membres integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT g.id, g.cree_le, (SELECT count(*)::int FROM groupe_membres m WHERE m.groupe_id = g.id)
  FROM groupes g WHERE g.id = groupe_de(auth.uid()) $f$;

-- Les membres et l'état de leur séance (statut, début, dernière série validée : l'app en tire « terminé » par la règle
-- de la séance vivante), leur liste d'exercices. Ni charge, ni série ici.
CREATE FUNCTION public.groupe_etat()
RETURNS TABLE(user_id uuid, pseudo text, moi boolean, session_id uuid, statut text, debut timestamptz,
              derniere timestamptz, exercices text[], ferme boolean, entre_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT m.user_id, p.username, m.user_id = auth.uid(), m.session_id, s.statut, s.debut,
    (SELECT max(t.validee_a) FROM sets t WHERE t.session_id = m.session_id AND t.user_id = m.user_id),
    m.exercices, m.ferme, m.entre_le
  FROM groupe_membres m JOIN profiles p ON p.id = m.user_id
    LEFT JOIN sessions s ON s.id = m.session_id AND s.user_id = m.user_id
  WHERE m.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL
  ORDER BY m.entre_le, m.user_id $f$;

-- LE DIRECT — RÉSERVÉ AUX MEMBRES : les 20 dernières séries validées des AUTRES membres, dans LEUR séance du groupe.
-- Exercice, charge × reps (ou durée, distance), l'heure de validation. Rien d'autre.
CREATE FUNCTION public.groupe_direct()
RETURNS TABLE(pseudo text, exercise_slug text, charge_kg numeric, reps integer, duree_s integer, distance_m numeric,
              type_serie text, validee_a timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p.username, t.exercise_slug, t.charge_kg, t.reps, t.duree_s, t.distance_m, t.type_serie, t.validee_a
  FROM groupe_membres m JOIN profiles p ON p.id = m.user_id JOIN sets t ON t.session_id = m.session_id AND t.user_id = m.user_id
  WHERE m.groupe_id = groupe_de(auth.uid()) AND m.user_id <> auth.uid() AND t.validee_a IS NOT NULL
    AND p.deleted_at IS NULL AND NOT social_bloque(auth.uid(), m.user_id)
  ORDER BY t.validee_a DESC LIMIT 20 $f$;

-- Les messages du groupe, membres seulement (les 30 derniers).
CREATE FUNCTION public.groupe_messages_lire()
RETURNS TABLE(pseudo text, moi boolean, texte text, cree_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT x.pseudo, x.moi, x.texte, x.cree_le FROM (
    SELECT p.username AS pseudo, g.user_id = auth.uid() AS moi, g.texte, g.cree_le
    FROM groupe_messages g JOIN profiles p ON p.id = g.user_id
    WHERE g.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL AND NOT social_bloque(auth.uid(), g.user_id)
    ORDER BY g.cree_le DESC LIMIT 30) x
  ORDER BY x.cree_le $f$;

-- Mes invitations reçues : qui m'invite, la liste d'exercices de sa séance (« Suivre la séance de X »), combien ils sont.
CREATE FUNCTION public.groupe_invitations_recues()
RETURNS TABLE(groupe_id uuid, invitant text, exercices text[], membres integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT i.groupe_id, p.username, coalesce(m.exercices, '{}'),
    (SELECT count(*)::int FROM groupe_membres x WHERE x.groupe_id = i.groupe_id)
  FROM groupe_invitations i JOIN profiles p ON p.id = i.invitant
    LEFT JOIN groupe_membres m ON m.groupe_id = i.groupe_id AND m.user_id = i.invitant
  WHERE i.invite = auth.uid() AND p.deleted_at IS NULL AND NOT social_bloque(auth.uid(), i.invitant)
    AND NOT EXISTS (SELECT 1 FROM groupe_membres f WHERE f.groupe_id = i.groupe_id AND f.ferme)
  ORDER BY i.cree_le $f$;

-- Mes invitations envoyées (pour « Annuler »).
CREATE FUNCTION public.groupe_invitations_envoyees()
RETURNS TABLE(user_id uuid, pseudo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT i.invite, p.username FROM groupe_invitations i JOIN profiles p ON p.id = i.invite
  WHERE i.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL ORDER BY p.username $f$;

-- Le récap du « combat » en direct (avant de le fermer).
CREATE FUNCTION public.groupe_recap()
RETURNS TABLE(pseudo text, moi boolean, tonnage_kg numeric, series integer, records integer, xp integer, le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT x.pseudo, x.moi, x.tonnage_kg, x.series, x.records, x.xp, (SELECT cree_le FROM groupes WHERE id = groupe_de(auth.uid()))
  FROM groupe_recap_de(groupe_de(auth.uid()), auth.uid()) x WHERE groupe_de(auth.uid()) IS NOT NULL $f$;

-- Le récap figé d'une de MES séances (zéro ou une ligne) : son propriétaire seul.
CREATE FUNCTION public.groupe_recap_seance(p_session uuid)
RETURNS TABLE(le timestamptz, recap jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT r.le, r.recap FROM groupe_recaps r WHERE r.session_id = p_session AND r.user_id = auth.uid() $f$;

REVOKE ALL ON FUNCTION public.groupe_de(uuid), public.groupe_bloque_avec(uuid,uuid), public.groupe_recap_de(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.groupe_creer(uuid,text[]), public.groupe_inviter(uuid), public.groupe_annuler_invitation(uuid),
  public.groupe_repondre(uuid,boolean,uuid,text[]), public.groupe_quitter(), public.groupe_publier(text[],integer), public.groupe_envoyer(text),
  public.groupe_fermer(), public.groupe_moi(), public.groupe_etat(), public.groupe_direct(), public.groupe_messages_lire(),
  public.groupe_invitations_recues(), public.groupe_invitations_envoyees(), public.groupe_recap(),
  public.groupe_recap_seance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_creer(uuid,text[]), public.groupe_inviter(uuid), public.groupe_annuler_invitation(uuid),
  public.groupe_repondre(uuid,boolean,uuid,text[]), public.groupe_quitter(), public.groupe_publier(text[],integer), public.groupe_envoyer(text),
  public.groupe_fermer(), public.groupe_moi(), public.groupe_etat(), public.groupe_direct(), public.groupe_messages_lire(),
  public.groupe_invitations_recues(), public.groupe_invitations_envoyees(), public.groupe_recap(),
  public.groupe_recap_seance(uuid) TO authenticated;
-- Les fonctions de déclencheur ne s'appellent pas par l'API.
REVOKE ALL ON FUNCTION public.groupe_membres_avant_ajout(), public.groupe_membres_avant_modif(), public.groupe_membres_apres(),
  public.groupe_invitations_avant_ajout(), public.groupe_apres_blocage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.groupes, public.groupe_membres, public.groupe_invitations, public.groupe_messages, public.groupe_recaps
  FROM anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('groupes','groupe_membres','groupe_invitations','groupe_messages','groupe_recaps')) THEN
    RAISE EXCEPTION 'post-contrôle : aucune politique attendue sur les tables du groupe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
             AND c.relname IN ('groupes','groupe_membres','groupe_invitations','groupe_messages','groupe_recaps')
             AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'post-contrôle : RLS absent sur une table du groupe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('sessions','sets','records')
             AND policyname NOT IN ('sessions_owner','sets_owner','records_ajout','records_lecture')) THEN
    RAISE EXCEPTION 'post-contrôle : politique inattendue sur sessions/sets/records';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('groupe_membres_avant_ajout',
      'groupe_membres_avant_modif','groupe_membres_apres','groupe_invitations_avant_ajout','groupe_apres_blocage')) <> 5 THEN
    RAISE EXCEPTION 'post-contrôle : déclencheurs attendus 5';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name IN ('groupes','groupe_membres','groupe_invitations','groupe_messages','groupe_recaps')
             AND column_name IN ('poids_corps_kg','note','rpe','ressenti','douleur')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite dans une table du groupe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'groupe%'
             AND p.proname <> 'groupe_membres_avant_modif' AND (NOT p.prosecdef OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'post-contrôle : fonction du groupe sans SECURITY DEFINER ou sans search_path';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'groupe%'
             AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'post-contrôle : fonction du groupe ouverte à anon, ou sans search_path';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
             AND p.proname IN ('groupe_de','groupe_bloque_avec','groupe_recap_de')
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'post-contrôle : une fonction interne du groupe est appelable par l''API';
  END IF;
  -- Les colonnes rendues (RETURNS TABLE) sont dans proargnames.
  IF EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS a(nom)
             WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'groupe%'
             AND a.nom IN ('poids_corps_kg','note','rpe','ressenti','douleur')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite rendue';
  END IF;
END $$;
