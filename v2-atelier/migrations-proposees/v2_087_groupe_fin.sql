-- v2_087_groupe_fin — la fin du groupe de séance, et le message gardé hors ligne (décisions d'Aurélien du 15/10/2026,
-- SOCIAL-V1 §7.3). PROPOSÉE par Claude Code (prompt 106), sur le modèle de v2_082 : Claude.ai la relit et la lance,
-- APRÈS v2_082.
--
-- 1. « LE GROUPE EST TERMINÉ DÈS QUE TOUTES LES SÉANCES SONT FINIES » — la base sait maintenant quand une séance du
--    groupe est finie : `terminee`, ou plus vivante (règle de la séance vivante, `Seance.MINUTES_VIVANTE` : sans série
--    validée depuis 45 min, un membre compte comme terminé ; sans série, le début de la séance ; une séance pas encore
--    arrivée en base vaut « commencée à l'entrée dans le groupe » — exactement `Social.membreTermine`). Un test lit ce
--    fichier et vérifie que les 45 minutes d'ici sont celles de l'app. À la fin du groupe, `groupes.fini_le` garde
--    l'instant de la fin (une fois posée, elle ne bouge plus : un membre qui revient après 45 min ne rouvre pas le
--    groupe) et les invitations partent (plus personne n'entre). « LE RÉCAP DU COMBAT RESTE À VIE DANS CHAQUE SÉANCE » :
--    tant que le groupe existe, il se lit depuis chaque séance tel qu'il est (`groupe_recap_seance`, même pour qui est
--    parti vers un autre groupe) ; il se FIGE pour chacun à la fermeture de son récap (v2_082) et, pour tous ceux qui
--    restent, à l'extinction (`groupe_recaps`). Pas de gel à la fin même : une XP publiée un peu après la fin d'une
--    séance (la fin partie par la file d'envoi) compte encore.
--
-- 2. « CHACUN PEUT LANCER OU REJOINDRE UN AUTRE GROUPE DÈS QUE SA SÉANCE EST FINIE, SANS ATTENDRE LES AUTRES » — l'index
--    `groupe_membres_un_a_la_fois` reste (UNE place ouverte par personne, la garantie la plus forte) ; lancer ou
--    rejoindre FERME d'abord ma place dans le groupe précédent SI MA séance y est finie (`groupe_liberer`), sinon
--    `groupe_deja_dans_un`. Les autres continuent ; mon récap de ce groupe-là se fige à sa fin, comme le leur. On
--    n'entre plus dans un groupe FINI (et non plus « dont un membre a fermé le récap » : celui qui est parti vers un
--    autre groupe a fermé sa place, le groupe vit encore pour les autres).
--
-- 3. « LES MESSAGES S'EFFACENT QUAND TOUT LE MONDE A FERMÉ LE RÉCAP, OU AU PLUS TARD 24 H APRÈS LA FIN DU GROUPE » —
--    l'extinction de v2_082 reste (tous fermés : le groupe, ses messages et ses invitations partent ; les récaps figés
--    restent). Et SANS FONCTION SERVEUR PROGRAMMÉE (ni cron, ni Edge Function) : l'ENTRETIEN (`groupe_entretien`)
--    passe au début de CHAQUE lecture et de CHAQUE écriture du groupe, par n'importe qui. Il constate les fins (et les
--    pose), retire les invitations des groupes finis, et efface les messages des groupes finis depuis 24 h. Un groupe
--    dont plus personne ne rouvre l'app est donc entretenu par le geste suivant de n'importe quel autre groupe.
--
-- 4. LE MESSAGE ÉCRIT HORS LIGNE (décision 1 : gardé sur le téléphone, il part au retour du réseau) — `groupe_envoyer`
--    prend l'identifiant du message, fabriqué par l'app (renvoyé après un rechargement, il ne se double pas), et le
--    groupe pour lequel il a été écrit (gardé longtemps, il ne part jamais dans un AUTRE groupe : `groupe_pas_membre`).
--    Après 24 h de groupe fini, plus aucun message n'entre (`groupe_eteint`). L'ancienne signature (le texte seul)
--    est remplacée par une signature à défauts : un appel `{ p_texte }` d'une app d'avant reste valide.
--
-- Les lectures du groupe deviennent VOLATILE (elles entretiennent) ; l'app les appelle par POST (`client.rpc`), comme
-- avant. Aucune politique ajoutée, ni sur les tables du groupe ni sur sessions, sets, records ; aucune colonne interdite
-- rendue ; toutes les fonctions SECURITY DEFINER, `search_path` figé, `authenticated` seulement (les internes : personne).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='groupe_membres') THEN
    RAISE EXCEPTION 'pré-contrôle : v2_082 (groupe_membres) absente';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groupes'
             AND column_name='fini_le') THEN
    RAISE EXCEPTION 'pré-contrôle : groupes.fini_le existe déjà (v2_087 déjà passée ?)';
  END IF;
  IF to_regprocedure('public.groupe_envoyer(text)') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : v2_082 (groupe_envoyer(text)) absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='groupe_membres_un_a_la_fois') THEN
    RAISE EXCEPTION 'pré-contrôle : l''index groupe_membres_un_a_la_fois est absent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions'
                 AND column_name='fin') THEN
    RAISE EXCEPTION 'pré-contrôle : sessions.fin absente';
  END IF;
END $$;

-- ── LA FIN DU GROUPE ───────────────────────────────────────────────────────────────────────────────────────────────
-- L'instant de la fin, posé une fois par l'entretien (nul : le groupe vit).
ALTER TABLE public.groupes ADD COLUMN fini_le timestamptz;

-- La fin de LA séance d'un membre dans le groupe (nulle : elle est vivante). LA RÈGLE DE LA SÉANCE VIVANTE, celle de
-- `Social.membreTermine` : `terminee` → finie (à sa fin) ; sinon l'activité = la dernière série validée, à défaut le
-- début de la séance en cours, à défaut l'entrée dans le groupe (la séance pas encore arrivée en base) ; finie 45 min
-- après l'activité (« sans série validée depuis 45 min, un membre compte comme terminé »).
CREATE FUNCTION public.groupe_fin_de_seance(p_groupe uuid, p_user uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT CASE
    WHEN s.statut = 'terminee' THEN coalesce(s.fin, x.activite)
    WHEN now() - x.activite >= interval '45 minutes' THEN x.activite + interval '45 minutes'
  END
  FROM groupe_membres m
    LEFT JOIN sessions s ON s.id = m.session_id AND s.user_id = m.user_id
    CROSS JOIN LATERAL (SELECT coalesce(
      (SELECT max(t.validee_a) FROM sets t WHERE t.session_id = m.session_id AND t.user_id = m.user_id),
      CASE WHEN s.statut = 'en_cours' THEN s.debut END,
      m.entre_le) AS activite) x
  WHERE m.groupe_id = p_groupe AND m.user_id = p_user $f$;

-- La fin du groupe : celle qui est posée, sinon — si TOUTES les séances sont finies — la dernière d'entre elles.
CREATE FUNCTION public.groupe_fini_le(p_groupe uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT coalesce(g.fini_le,
    (SELECT CASE WHEN count(*) > 0 AND bool_and(x.f IS NOT NULL) THEN max(x.f) END
     FROM (SELECT groupe_fin_de_seance(m.groupe_id, m.user_id) AS f FROM groupe_membres m WHERE m.groupe_id = g.id) x))
  FROM groupes g WHERE g.id = p_groupe $f$;

-- Le récap du « combat », vu par `p_moi` (la forme de v2_082, `groupe_fermer`).
CREATE FUNCTION public.groupe_recap_json(p_groupe uuid, p_moi uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT jsonb_build_object('membres', coalesce(jsonb_agg(jsonb_build_object('pseudo', x.pseudo, 'moi', x.moi,
           'tonnage_kg', x.tonnage_kg, 'series', x.series, 'records', x.records, 'xp', x.xp) ORDER BY x.entre_le), '[]'::jsonb))
  FROM groupe_recap_de(p_groupe, p_moi) x $f$;

-- FIGER le récap pour chaque membre encore là, à l'extinction (un récap déjà figé — à la fermeture du sien — ne bouge
-- plus). Sans la ligne du groupe (un groupe en train de s'effacer), rien.
CREATE FUNCTION public.groupe_figer(p_groupe uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  INSERT INTO groupe_recaps (user_id, groupe_id, session_id, le, recap)
  SELECT m.user_id, g.id, m.session_id, g.cree_le, groupe_recap_json(g.id, m.user_id)
  FROM groupes g JOIN groupe_membres m ON m.groupe_id = g.id
  WHERE g.id = p_groupe
  ON CONFLICT (user_id, groupe_id) DO NOTHING $f$;

-- L'ENTRETIEN, au début de chaque lecture et de chaque écriture du groupe (pas de fonction programmée) : les groupes
-- qui viennent de finir (fin posée, invitations retirées), puis les messages des groupes finis depuis 24 h. Un groupe
-- verrouillé par un autre geste en cours est laissé au geste suivant (SKIP LOCKED : on n'attend pas).
CREATE FUNCTION public.groupe_entretien() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE r record; f timestamptz;
BEGIN
  FOR r IN SELECT id FROM groupes WHERE fini_le IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LOOP
    f := groupe_fini_le(r.id);
    IF f IS NOT NULL THEN
      UPDATE groupes SET fini_le = f WHERE id = r.id;
      DELETE FROM groupe_invitations WHERE groupe_id = r.id;
    END IF;
  END LOOP;
  DELETE FROM groupe_messages x USING groupes g
    WHERE x.groupe_id = g.id AND g.fini_le IS NOT NULL AND g.fini_le <= now() - interval '24 hours';
END $f$;

-- LIBÉRER ma place : sans place ouverte, rien ; ma séance du groupe finie, ma place se ferme (les autres continuent ;
-- mon récap se lit depuis ma séance, et se fige à l'extinction) ; vivante, `groupe_deja_dans_un`.
CREATE FUNCTION public.groupe_liberer(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid := groupe_de(p_user);
BEGIN
  IF g IS NULL THEN RETURN; END IF;
  IF groupe_fin_de_seance(g, p_user) IS NULL THEN
    RAISE EXCEPTION 'groupe_deja_dans_un' USING ERRCODE = 'unique_violation';
  END IF;
  UPDATE groupe_membres SET ferme = true WHERE groupe_id = g AND user_id = p_user;
END $f$;

-- ── LES DÉCLENCHEURS, RÉVISÉS ──────────────────────────────────────────────────────────────────────────────────────
-- On n'entre plus dans un groupe FINI (v2_082 : « dont un membre a fermé le récap »). Le reste, inchangé.
CREATE OR REPLACE FUNCTION public.groupe_membres_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM 1 FROM groupes WHERE id = NEW.groupe_id FOR UPDATE;
  IF (SELECT count(*) FROM groupe_membres WHERE groupe_id = NEW.groupe_id) >= 6 THEN
    RAISE EXCEPTION 'groupe_plein' USING ERRCODE = 'check_violation';
  END IF;
  IF groupe_bloque_avec(NEW.groupe_id, NEW.user_id) THEN
    RAISE EXCEPTION 'groupe_bloque' USING ERRCODE = 'check_violation';
  END IF;
  IF groupe_fini_le(NEW.groupe_id) IS NOT NULL THEN
    RAISE EXCEPTION 'groupe_eteint' USING ERRCODE = 'check_violation';
  END IF;
  -- Une séance : la mienne (ou pas encore arrivée en base), jamais celle d'un autre.
  IF EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND user_id <> NEW.user_id) THEN
    RAISE EXCEPTION 'groupe_seance_d_un_autre' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.entre_le := clock_timestamp(); NEW.ferme := false; NEW.xp := NULL;
  RETURN NEW;
END $f$;

-- L'EXTINCTION (tous fermés, ou partis) : le récap se fige d'abord pour ceux qui restent, puis le groupe disparaît, et
-- avec lui ses messages et ses invitations (cascade).
CREATE OR REPLACE FUNCTION public.groupe_membres_apres() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid := coalesce(NEW.groupe_id, OLD.groupe_id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM groupe_membres WHERE groupe_id = g AND NOT ferme) THEN
    PERFORM groupe_figer(g);
    DELETE FROM groupes WHERE id = g;
  END IF;
  RETURN NULL;
END $f$;

-- ── LES GESTES, RÉVISÉS (chacun commence par l'entretien) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.groupe_creer(p_session uuid, p_exercices text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'groupe_sans_compte' USING ERRCODE = 'insufficient_privilege'; END IF;
  PERFORM groupe_entretien();
  PERFORM groupe_liberer(auth.uid());
  INSERT INTO groupes (createur) VALUES (auth.uid()) RETURNING id INTO g;
  INSERT INTO groupe_membres (groupe_id, user_id, session_id, exercices) VALUES (g, auth.uid(), p_session, coalesce(p_exercices, '{}'));
  RETURN g;
END $f$;

CREATE OR REPLACE FUNCTION public.groupe_inviter(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM groupe_entretien();
  INSERT INTO groupe_invitations (groupe_id, invite, invitant) VALUES (groupe_de(auth.uid()), p_user, auth.uid())
    ON CONFLICT (groupe_id, invite) DO NOTHING;
END $f$;

CREATE OR REPLACE FUNCTION public.groupe_annuler_invitation(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM groupe_entretien();
  DELETE FROM groupe_invitations WHERE groupe_id = groupe_de(auth.uid()) AND invite = p_user;
END $f$;

-- Rejoindre : ma place précédente se ferme si MA séance y est finie (sinon `groupe_deja_dans_un`).
CREATE OR REPLACE FUNCTION public.groupe_repondre(p_groupe uuid, p_rejoindre boolean, p_session uuid, p_exercices text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM groupe_entretien();
  IF NOT EXISTS (SELECT 1 FROM groupe_invitations WHERE groupe_id = p_groupe AND invite = auth.uid()) THEN
    RAISE EXCEPTION 'groupe_sans_invitation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_rejoindre THEN
    PERFORM groupe_liberer(auth.uid());
    INSERT INTO groupe_membres (groupe_id, user_id, session_id, exercices)
      VALUES (p_groupe, auth.uid(), p_session, coalesce(p_exercices, '{}'));
    DELETE FROM groupe_invitations WHERE groupe_id = p_groupe AND invite = auth.uid();
  ELSE
    DELETE FROM groupe_invitations WHERE groupe_id = p_groupe AND invite = auth.uid();
  END IF;
END $f$;

CREATE OR REPLACE FUNCTION public.groupe_quitter() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM groupe_entretien();
  DELETE FROM groupe_membres WHERE user_id = auth.uid() AND NOT ferme;
END $f$;

CREATE OR REPLACE FUNCTION public.groupe_publier(p_exercices text[], p_xp integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM groupe_entretien();
  UPDATE groupe_membres SET exercices = coalesce(p_exercices, exercices), xp = p_xp
    WHERE user_id = auth.uid() AND NOT ferme;
  IF NOT FOUND THEN RAISE EXCEPTION 'groupe_pas_membre' USING ERRCODE = 'insufficient_privilege'; END IF;
END $f$;

-- LE MESSAGE : pour le groupe où il a été écrit (`p_groupe`), une fois (`p_id`, fabriqué par l'app). Les défauts gardent
-- valide l'appel d'une app d'avant (`{ p_texte }`).
DROP FUNCTION public.groupe_envoyer(text);
CREATE FUNCTION public.groupe_envoyer(p_texte text, p_groupe uuid DEFAULT NULL, p_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid;
BEGIN
  PERFORM groupe_entretien();
  g := groupe_de(auth.uid());
  IF g IS NULL OR (p_groupe IS NOT NULL AND p_groupe <> g) THEN
    RAISE EXCEPTION 'groupe_pas_membre' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM groupes WHERE id = g AND fini_le IS NOT NULL AND fini_le <= now() - interval '24 hours') THEN
    RAISE EXCEPTION 'groupe_eteint' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO groupe_messages (id, groupe_id, user_id, texte) VALUES (coalesce(p_id, gen_random_uuid()), g, auth.uid(), btrim(p_texte))
    ON CONFLICT (id) DO NOTHING;
END $f$;

-- Fermer le récap du groupe : il se fige pour moi (v2_082), puis je sors ; le dernier éteint le groupe.
CREATE OR REPLACE FUNCTION public.groupe_fermer() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid; s uuid; le timestamptz;
BEGIN
  PERFORM groupe_entretien();
  g := groupe_de(auth.uid());
  IF g IS NULL THEN RETURN; END IF;
  SELECT session_id INTO s FROM groupe_membres WHERE groupe_id = g AND user_id = auth.uid();
  SELECT cree_le INTO le FROM groupes WHERE id = g;
  INSERT INTO groupe_recaps (user_id, groupe_id, session_id, le, recap) VALUES (auth.uid(), g, s, le, groupe_recap_json(g, auth.uid()))
    ON CONFLICT (user_id, groupe_id) DO NOTHING;
  UPDATE groupe_membres SET ferme = true WHERE groupe_id = g AND user_id = auth.uid();
END $f$;

-- ── LES LECTURES, RÉVISÉES (VOLATILE : elles entretiennent d'abord) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.groupe_moi()
RETURNS TABLE(id uuid, cree_le timestamptz, membres integer)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_entretien();
  SELECT g.id, g.cree_le, (SELECT count(*)::int FROM groupe_membres m WHERE m.groupe_id = g.id)
  FROM groupes g WHERE g.id = groupe_de(auth.uid()) $f$;

CREATE OR REPLACE FUNCTION public.groupe_etat()
RETURNS TABLE(user_id uuid, pseudo text, moi boolean, session_id uuid, statut text, debut timestamptz,
              derniere timestamptz, exercices text[], ferme boolean, entre_le timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_entretien();
  SELECT m.user_id, p.username, m.user_id = auth.uid(), m.session_id, s.statut, s.debut,
    (SELECT max(t.validee_a) FROM sets t WHERE t.session_id = m.session_id AND t.user_id = m.user_id),
    m.exercices, m.ferme, m.entre_le
  FROM groupe_membres m JOIN profiles p ON p.id = m.user_id
    LEFT JOIN sessions s ON s.id = m.session_id AND s.user_id = m.user_id
  WHERE m.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL
  ORDER BY m.entre_le, m.user_id $f$;

CREATE OR REPLACE FUNCTION public.groupe_direct()
RETURNS TABLE(pseudo text, exercise_slug text, charge_kg numeric, reps integer, duree_s integer, distance_m numeric,
              type_serie text, validee_a timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_entretien();
  SELECT p.username, t.exercise_slug, t.charge_kg, t.reps, t.duree_s, t.distance_m, t.type_serie, t.validee_a
  FROM groupe_membres m JOIN profiles p ON p.id = m.user_id JOIN sets t ON t.session_id = m.session_id AND t.user_id = m.user_id
  WHERE m.groupe_id = groupe_de(auth.uid()) AND m.user_id <> auth.uid() AND t.validee_a IS NOT NULL
    AND p.deleted_at IS NULL AND NOT social_bloque(auth.uid(), m.user_id)
  ORDER BY t.validee_a DESC LIMIT 20 $f$;

CREATE OR REPLACE FUNCTION public.groupe_messages_lire()
RETURNS TABLE(pseudo text, moi boolean, texte text, cree_le timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_entretien();
  SELECT x.pseudo, x.moi, x.texte, x.cree_le FROM (
    SELECT p.username AS pseudo, g.user_id = auth.uid() AS moi, g.texte, g.cree_le
    FROM groupe_messages g JOIN profiles p ON p.id = g.user_id
    WHERE g.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL AND NOT social_bloque(auth.uid(), g.user_id)
    ORDER BY g.cree_le DESC LIMIT 30) x
  ORDER BY x.cree_le $f$;

-- Mes invitations : celles d'un groupe qui n'est pas fini (v2_082 : « dont aucun membre n'a fermé le récap »).
CREATE OR REPLACE FUNCTION public.groupe_invitations_recues()
RETURNS TABLE(groupe_id uuid, invitant text, exercices text[], membres integer)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_entretien();
  SELECT i.groupe_id, p.username, coalesce(m.exercices, '{}'),
    (SELECT count(*)::int FROM groupe_membres x WHERE x.groupe_id = i.groupe_id)
  FROM groupe_invitations i JOIN profiles p ON p.id = i.invitant
    LEFT JOIN groupe_membres m ON m.groupe_id = i.groupe_id AND m.user_id = i.invitant
  WHERE i.invite = auth.uid() AND p.deleted_at IS NULL AND NOT social_bloque(auth.uid(), i.invitant)
    AND groupe_fini_le(i.groupe_id) IS NULL
  ORDER BY i.cree_le $f$;

CREATE OR REPLACE FUNCTION public.groupe_invitations_envoyees()
RETURNS TABLE(user_id uuid, pseudo text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_entretien();
  SELECT i.invite, p.username FROM groupe_invitations i JOIN profiles p ON p.id = i.invite
  WHERE i.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL ORDER BY p.username $f$;

CREATE OR REPLACE FUNCTION public.groupe_recap()
RETURNS TABLE(pseudo text, moi boolean, tonnage_kg numeric, series integer, records integer, xp integer, le timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
  SELECT groupe_entretien();
  SELECT x.pseudo, x.moi, x.tonnage_kg, x.series, x.records, x.xp, (SELECT cree_le FROM groupes WHERE id = groupe_de(auth.uid()))
  FROM groupe_recap_de(groupe_de(auth.uid()), auth.uid()) x WHERE groupe_de(auth.uid()) IS NOT NULL $f$;

-- Le récap d'une de MES séances (zéro ou une ligne), son propriétaire seul : figé (à ma fermeture, ou à l'extinction) ;
-- sinon, tant que le groupe existe, celui du moment — « Faite en groupe avec … » se lit dès que MA séance est finie,
-- même si je suis parti vers un autre groupe sans fermer celui-ci.
CREATE OR REPLACE FUNCTION public.groupe_recap_seance(p_session uuid)
RETURNS TABLE(le timestamptz, recap jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
#variable_conflict use_column
DECLARE g uuid;
BEGIN
  PERFORM groupe_entretien();
  IF EXISTS (SELECT 1 FROM groupe_recaps r WHERE r.session_id = p_session AND r.user_id = auth.uid()) THEN
    RETURN QUERY SELECT r.le, r.recap FROM groupe_recaps r WHERE r.session_id = p_session AND r.user_id = auth.uid()
      ORDER BY r.fige_le DESC LIMIT 1;
    RETURN;
  END IF;
  SELECT m.groupe_id INTO g FROM groupe_membres m WHERE m.session_id = p_session AND m.user_id = auth.uid();
  IF g IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT x.cree_le, groupe_recap_json(g, auth.uid()) FROM groupes x WHERE x.id = g;
END $f$;

-- ── LES DROITS ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Les fonctions internes : personne par l'API (ni anon, ni authenticated).
REVOKE ALL ON FUNCTION public.groupe_fin_de_seance(uuid,uuid), public.groupe_fini_le(uuid), public.groupe_recap_json(uuid,uuid),
  public.groupe_figer(uuid), public.groupe_entretien(), public.groupe_liberer(uuid) FROM PUBLIC, anon, authenticated;
-- Le geste du message, nouvelle signature : authenticated seulement.
REVOKE ALL ON FUNCTION public.groupe_envoyer(text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_envoyer(text,uuid,uuid) TO authenticated;
-- Les fonctions remplacées (CREATE OR REPLACE) gardent les droits de v2_082 ; on le redit, par sûreté.
REVOKE ALL ON FUNCTION public.groupe_creer(uuid,text[]), public.groupe_inviter(uuid), public.groupe_annuler_invitation(uuid),
  public.groupe_repondre(uuid,boolean,uuid,text[]), public.groupe_quitter(), public.groupe_publier(text[],integer),
  public.groupe_fermer(), public.groupe_moi(), public.groupe_etat(), public.groupe_direct(), public.groupe_messages_lire(),
  public.groupe_invitations_recues(), public.groupe_invitations_envoyees(), public.groupe_recap(),
  public.groupe_recap_seance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_creer(uuid,text[]), public.groupe_inviter(uuid), public.groupe_annuler_invitation(uuid),
  public.groupe_repondre(uuid,boolean,uuid,text[]), public.groupe_quitter(), public.groupe_publier(text[],integer),
  public.groupe_fermer(), public.groupe_moi(), public.groupe_etat(), public.groupe_direct(), public.groupe_messages_lire(),
  public.groupe_invitations_recues(), public.groupe_invitations_envoyees(), public.groupe_recap(),
  public.groupe_recap_seance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.groupe_membres_avant_ajout(), public.groupe_membres_apres() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='groupe_envoyer') <> 1
     OR to_regprocedure('public.groupe_envoyer(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'post-contrôle : groupe_envoyer attendu une fois, (text, uuid, uuid)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groupes'
                 AND column_name='fini_le') THEN
    RAISE EXCEPTION 'post-contrôle : groupes.fini_le absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='groupe_membres_un_a_la_fois'
                 AND indexdef LIKE '%WHERE (NOT ferme)%') THEN
    RAISE EXCEPTION 'post-contrôle : l''index « un groupe à la fois » a changé';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('groupes','groupe_membres','groupe_invitations','groupe_messages','groupe_recaps')) THEN
    RAISE EXCEPTION 'post-contrôle : aucune politique attendue sur les tables du groupe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('sessions','sets','records')
             AND policyname NOT IN ('sessions_owner','sets_owner','records_ajout','records_lecture')) THEN
    RAISE EXCEPTION 'post-contrôle : politique inattendue sur sessions/sets/records';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('groupe_membres_avant_ajout',
      'groupe_membres_avant_modif','groupe_membres_apres','groupe_invitations_avant_ajout','groupe_apres_blocage')) <> 5 THEN
    RAISE EXCEPTION 'post-contrôle : déclencheurs attendus 5';
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
             AND p.proname IN ('groupe_de','groupe_bloque_avec','groupe_recap_de','groupe_fin_de_seance','groupe_fini_le',
                               'groupe_recap_json','groupe_figer','groupe_entretien','groupe_liberer')
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'post-contrôle : une fonction interne du groupe est appelable par l''API';
  END IF;
  -- Les lectures entretiennent : aucune ne reste STABLE (une lecture STABLE ne pourrait pas effacer).
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
             AND p.proname IN ('groupe_moi','groupe_etat','groupe_direct','groupe_messages_lire','groupe_invitations_recues',
                               'groupe_invitations_envoyees','groupe_recap','groupe_recap_seance')
             AND p.provolatile <> 'v') THEN
    RAISE EXCEPTION 'post-contrôle : une lecture du groupe n''entretient pas (non VOLATILE)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS a(nom)
             WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'groupe%'
             AND a.nom IN ('poids_corps_kg','note','rpe','ressenti','douleur')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite rendue';
  END IF;
END $$;
