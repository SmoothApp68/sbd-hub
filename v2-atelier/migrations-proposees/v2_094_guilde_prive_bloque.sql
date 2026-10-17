-- v2_094 — La guilde respecte le compte privé et le blocage (audit du 16/10/2026 : 05 #6, #7 ; décision D5 d'Aurélien ;
-- prompt 121).
-- PROPOSÉE par Claude Code : Claude.ai la relit et la lance, APRÈS v2_093 — et après la fusion de la PR 121 (l'app de
-- 121 dit « un membre » pour un membre sans pseudo ; une app d'avant afficherait « null · Novice » dans les Membres).
-- L'app de 121 marche aussi AVANT la migration : elle reçoit encore tout, et l'affiche comme aujourd'hui.
--
-- 1. D5 — décision d'Aurélien du 16/10/2026, mot pour mot : « on ne voit pas si privé (privé compte que pour les
--    inconnus, pas amis, donc guilde ne voit pas le détail) ». Aujourd'hui, rejoindre une guilde ouvre toutes les
--    séances d'un compte privé (titres, dates, tonnages, médailles des 30 derniers jours) aux membres qu'il n'a
--    jamais approuvés (`guilde_fil`, `guilde_records_seance` : `guilde_commune` seulement — audit 05 #7).
--    Désormais une séance du fil de la guilde se voit seulement si son auteur a un compte PUBLIC, ou si je suis son
--    abonné ACCEPTÉ — exactement ce que mon propre fil me montre déjà de lui (le cercle « inconnu » de SOCIAL §1 ne voit
--    rien). Un compte public reste visible comme aujourd'hui. Les chiffres de la guilde ne changent pas : la jauge du
--    défi, « La guilde cette semaine » et la Progression comptent toujours chacun (`guilde_semaine`,
--    `guilde_progression`) — ce sont des nombres de la guilde, pas le détail d'une séance.
--    Nouvelle fonction interne `guilde_voit_seances(lecteur, auteur)` : moi, ou auteur public (`profiles.compte_prive`
--    faux), ou abonnement accepté (`abonnements.statut = 'accepte'`) ; appelable par personne d'autre que les fonctions
--    de la guilde (SECURITY DEFINER).
--
-- 2. 05 #6 — bloquer n'avait aucun effet dans la guilde (seuls le fil et ses médailles passaient par `guilde_commune`,
--    qui exclut les blocages). Désormais, entre deux personnes qui se bloquent (dans un sens ou dans l'autre,
--    `social_bloque`) :
--      · `guilde_liste_membres` rend l'autre SANS pseudo, sans rang, sans titre (l'app dit « un membre ») — son
--        identifiant reste, pour « Retirer » et « Transmettre » de l'administrateur ;
--      · `guilde_progression` ne rend plus sa ligne (son nom et sa part du mois) ;
--      · un tiers ne peut plus INVITER dans ma guilde quelqu'un que j'ai bloqué ou qui m'a bloqué
--        (`guilde_invitations_avant_ajout`, refus `guilde_bloque`), ni lui la REJOINDRE par une invitation déjà là
--        (`guilde_membres_avant_ajout`, même refus) ; `guilde_invitations_recues` tait une telle invitation.
--    Deux personnes qui se bloquent ET sont déjà dans la même guilde y restent (la guilde est permanente ; SOCIAL-V1 n'a
--    pas de règle de départ pour elle) : chacune ne voit plus l'autre que comme « un membre ». Le pré-contrôle dit
--    combien de paires sont dans ce cas.
--
-- Aucune politique RLS touchée ou ajoutée (`reactions_guilde` et `guilde_peut_reagir` inchangées) ; aucune colonne
-- interdite rendue ; les fonctions redéfinies gardent leur signature (CREATE OR REPLACE), SECURITY DEFINER, `search_path`
-- figé et leurs droits (`authenticated` seulement pour les lectures, personne pour les déclencheurs et l'interne).
--
-- UNE SEULE TRANSACTION (BEGIN … COMMIT) : un contrôle qui échoue n'en laisse rien.
-- ESSAI À BLANC : remplacer le COMMIT final par ROLLBACK — les pré et post-contrôles lèvent une exception si quelque
-- chose ne va pas, et rien ne reste. Puis la lancer telle quelle.
-- Essayée sur Postgres 16 local (`tests/sql/v2_094_bouchon.sql` + v2_080, v2_082, v2_083, v2_087, v2_092, v2_093, puis
-- `tests/sql/v2_094_essai_avant.sql` → v2_094 → `tests/sql/v2_094_essai_apres.sql`).

BEGIN;

-- ── Pré-contrôles ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_prive int; n_paires int; n_inv int;
BEGIN
  IF to_regclass('public.guildes') IS NULL OR to_regclass('public.guilde_membres') IS NULL
     OR to_regclass('public.guilde_invitations') IS NULL OR to_regclass('public.guilde_scores') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : v2_080 (guilde) absente';
  END IF;
  IF to_regprocedure('public.social_bloque(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : social_bloque(uuid, uuid) absente (v2_078)';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='abonnements'
      AND column_name IN ('suiveur','suivi','statut')) <> 3 THEN
    RAISE EXCEPTION 'pré-contrôle : abonnements(suiveur, suivi, statut) absente (v2_078)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'
                 AND column_name='compte_prive') THEN
    RAISE EXCEPTION 'pré-contrôle : profiles.compte_prive absente (v2_078)';
  END IF;
  -- v2_093 lancée d'abord (la chaîne des migrations de la guilde) : `guilde_semaine` rend `series_cible`.
  IF to_regprocedure('public.guilde_semaine()') IS NULL
     OR pg_get_function_result('public.guilde_semaine()'::regprocedure) NOT LIKE '%series_cible%' THEN
    RAISE EXCEPTION 'pré-contrôle : v2_093 absente — la lancer d''abord';
  END IF;
  -- Les fonctions redéfinies ici doivent être encore celles de v2_080 (sinon : déjà lancée, ou changées depuis).
  IF to_regprocedure('public.guilde_voit_seances(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'pré-contrôle : guilde_voit_seances existe déjà (v2_094 déjà lancée ?)';
  END IF;
  IF pg_get_functiondef('public.guilde_fil()'::regprocedure) NOT LIKE '%guilde_commune(auth.uid(), s.user_id)%'
     OR pg_get_functiondef('public.guilde_records_seance(uuid)'::regprocedure) NOT LIKE '%guilde_commune(auth.uid(), s.user_id)%'
     OR pg_get_functiondef('public.guilde_liste_membres()'::regprocedure) LIKE '%social_bloque%'
     OR pg_get_functiondef('public.guilde_progression()'::regprocedure) LIKE '%social_bloque%'
     OR pg_get_functiondef('public.guilde_invitations_avant_ajout()'::regprocedure) NOT LIKE '%guilde_invite_non_mutuel%'
     OR pg_get_functiondef('public.guilde_invitations_avant_ajout()'::regprocedure) LIKE '%guilde_bloque%'
     OR pg_get_functiondef('public.guilde_membres_avant_ajout()'::regprocedure) NOT LIKE '%guilde_pleine%'
     OR pg_get_functiondef('public.guilde_membres_avant_ajout()'::regprocedure) LIKE '%guilde_bloque%'
     OR pg_get_functiondef('public.guilde_invitations_recues()'::regprocedure) NOT LIKE '%social_bloque(auth.uid(), i.invitant)%' THEN
    RAISE EXCEPTION 'pré-contrôle : une fonction de la guilde a changé depuis v2_080 (ou v2_094 déjà lancée)';
  END IF;
  SELECT count(DISTINCT m.user_id) INTO n_prive FROM guilde_membres m JOIN profiles p ON p.id = m.user_id
    WHERE coalesce(p.compte_prive, true);
  SELECT count(*) INTO n_paires FROM guilde_membres x JOIN guilde_membres y ON y.guilde_id = x.guilde_id AND x.user_id < y.user_id
    WHERE social_bloque(x.user_id, y.user_id);
  SELECT count(*) INTO n_inv FROM guilde_invitations i
    WHERE EXISTS (SELECT 1 FROM guilde_membres m WHERE m.guilde_id = i.guilde_id AND social_bloque(m.user_id, i.invite));
  RAISE NOTICE 'pré-contrôle : % membre(s) de guilde à compte privé (leurs séances ne se verront plus que de leurs abonnés), % paire(s) de membres qui se bloquent dans une même guilde (chacun ne verra plus l''autre que comme « un membre »), % invitation(s) en attente vers une personne bloquée avec un membre (tues, et refusées à l''entrée)',
    n_prive, n_paires, n_inv;
END $$;

-- ── 1. D5 — le fil de la guilde : un compte privé ne se voit que de ses abonnés ─────────────────────────────────
-- Interne : qui voit les séances de qui, dans la guilde. Moi ; un compte public ; mon abonnement accepté.
-- (Un compte sans ligne de profil, ou `compte_prive` nul : privé — le défaut de SOCIAL §2.)
CREATE FUNCTION public.guilde_voit_seances(p_lecteur uuid, p_auteur uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p_lecteur = p_auteur
      OR NOT coalesce((SELECT p.compte_prive FROM profiles p WHERE p.id = p_auteur), true)
      OR EXISTS (SELECT 1 FROM abonnements a WHERE a.suiveur = p_lecteur AND a.suivi = p_auteur AND a.statut = 'accepte') $f$;

-- Corps de v2_080, la condition D5 en plus. Signature identique.
CREATE OR REPLACE FUNCTION public.guilde_fil()
RETURNS TABLE(session_id uuid, user_id uuid, pseudo text, titre text, debut timestamptz, fin timestamptz,
              tonnage_kg numeric, j_ai_reagi boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT s.id, s.user_id, p.username, s.titre, s.debut, s.fin,
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t WHERE t.session_id=s.id AND coalesce(t.type_serie,'travail')='travail' AND t.charge_kg > 0 AND t.reps > 0),
    EXISTS (SELECT 1 FROM reactions_seance r WHERE r.session_id=s.id AND r.user_id=auth.uid())
  FROM sessions s JOIN profiles p ON p.id = s.user_id
  WHERE s.statut='terminee' AND s.visibilite <> 'private' AND s.debut >= now() - interval '30 days'
    AND s.user_id <> auth.uid() AND p.deleted_at IS NULL AND guilde_commune(auth.uid(), s.user_id)
    AND guilde_voit_seances(auth.uid(), s.user_id)
  ORDER BY s.debut DESC LIMIT 200 $f$;

CREATE OR REPLACE FUNCTION public.guilde_records_seance(p_session uuid)
RETURNS TABLE(set_id uuid, battu_le timestamptz, exercise_slug text, type text, valeur numeric, charge numeric, reps integer, unite text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT r.set_id, r.battu_le, r.exercise_slug, r.type, r.valeur, r.charge, r.reps, r.unite FROM records r JOIN sessions s ON s.id=r.session_id
  WHERE r.session_id=p_session AND s.statut='terminee' AND s.visibilite <> 'private'
    AND guilde_commune(auth.uid(), s.user_id) AND guilde_voit_seances(auth.uid(), s.user_id) $f$;

-- ── 2. 05 #6 — le blocage dans la guilde ──────────────────────────────────────────────────────────────────────
-- Les membres : quelqu'un qui me bloque ou que je bloque, sans pseudo, sans rang, sans titre (« un membre »).
CREATE OR REPLACE FUNCTION public.guilde_liste_membres()
RETURNS TABLE(user_id uuid, pseudo text, rang text, titre text, moi boolean, entre_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT m.user_id,
    CASE WHEN m.user_id <> auth.uid() AND social_bloque(auth.uid(), m.user_id) THEN NULL ELSE p.username END,
    CASE WHEN m.user_id <> auth.uid() AND social_bloque(auth.uid(), m.user_id) THEN NULL ELSE m.rang END,
    CASE WHEN m.user_id <> auth.uid() AND social_bloque(auth.uid(), m.user_id) THEN NULL
         WHEN p.jeu_actif THEN p.jeu_titre END,
    m.user_id = auth.uid(), m.entre_le
  FROM guilde_membres m JOIN profiles p ON p.id = m.user_id
  WHERE m.guilde_id = guilde_de(auth.uid()) AND p.deleted_at IS NULL
  ORDER BY m.entre_le, m.user_id $f$;

-- La Progression : sans la ligne de quelqu'un qui me bloque ou que je bloque.
CREATE OR REPLACE FUNCTION public.guilde_progression()
RETURNS TABLE(pseudo text, moi boolean, exercices integer, exercices_record integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p.username, x.user_id = auth.uid(), x.exercices, x.exercices_record
  FROM guilde_scores x JOIN guilde_membres m ON m.user_id = x.user_id JOIN profiles p ON p.id = x.user_id
  WHERE m.guilde_id = guilde_de(auth.uid()) AND x.mois = guilde_mois_courant() AND p.deleted_at IS NULL
    AND (x.user_id = auth.uid() OR NOT social_bloque(auth.uid(), x.user_id)) $f$;

-- Interne : quelqu'un de la guilde a-t-il un blocage avec cette personne (dans un sens ou dans l'autre) ?
CREATE FUNCTION public.guilde_bloque_avec(p_guilde uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM guilde_membres m WHERE m.guilde_id = p_guilde AND m.user_id <> p_user
                 AND social_bloque(m.user_id, p_user)) $f$;

-- INVITER : corps de v2_080, et jamais quelqu'un qui a un blocage avec un membre.
CREATE OR REPLACE FUNCTION public.guilde_invitations_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF guilde_de(NEW.invitant) IS DISTINCT FROM NEW.guilde_id THEN
    RAISE EXCEPTION 'guilde_invitant_non_membre' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT social_mutuel(NEW.invitant, NEW.invite) THEN
    RAISE EXCEPTION 'guilde_invite_non_mutuel' USING ERRCODE = 'check_violation';
  END IF;
  IF guilde_de(NEW.invite) IS NOT DISTINCT FROM NEW.guilde_id THEN
    RAISE EXCEPTION 'guilde_deja_membre' USING ERRCODE = 'check_violation';
  END IF;
  IF guilde_bloque_avec(NEW.guilde_id, NEW.invite) THEN
    RAISE EXCEPTION 'guilde_bloque' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM guilde_membres WHERE guilde_id = NEW.guilde_id) >= 30 THEN
    RAISE EXCEPTION 'guilde_pleine' USING ERRCODE = 'check_violation';
  END IF;
  NEW.cree_le := now();
  RETURN NEW;
END $f$;

-- ENTRER : corps de v2_080, et jamais avec quelqu'un qui a un blocage avec moi (une invitation d'avant le blocage).
CREATE OR REPLACE FUNCTION public.guilde_membres_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM 1 FROM guildes WHERE id = NEW.guilde_id FOR UPDATE;
  IF (SELECT count(*) FROM guilde_membres WHERE guilde_id = NEW.guilde_id) >= 30 THEN
    RAISE EXCEPTION 'guilde_pleine' USING ERRCODE = 'check_violation';
  END IF;
  IF guilde_bloque_avec(NEW.guilde_id, NEW.user_id) THEN
    RAISE EXCEPTION 'guilde_bloque' USING ERRCODE = 'check_violation';
  END IF;
  NEW.rang := 'Novice'; NEW.entre_le := clock_timestamp();
  RETURN NEW;
END $f$;

-- Mes invitations reçues : corps de v2_080, sans celles d'une guilde où quelqu'un a un blocage avec moi.
CREATE OR REPLACE FUNCTION public.guilde_invitations_recues()
RETURNS TABLE(guilde_id uuid, nom text, blason text, couleur text, invitant text, membres integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT g.id, g.nom, g.blason, g.couleur, p.username, (SELECT count(*)::int FROM guilde_membres m WHERE m.guilde_id = g.id)
  FROM guilde_invitations i JOIN guildes g ON g.id = i.guilde_id JOIN profiles p ON p.id = i.invitant
  WHERE i.invite = auth.uid() AND NOT social_bloque(auth.uid(), i.invitant) AND NOT guilde_bloque_avec(g.id, auth.uid())
  ORDER BY i.cree_le $f$;

-- ── Les droits ────────────────────────────────────────────────────────────────────────────────────────────────
-- Les internes : personne par l'API (les fonctions de la guilde les appellent, SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.guilde_voit_seances(uuid,uuid), public.guilde_bloque_avec(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- Les lectures redéfinies : `authenticated` seulement (CREATE OR REPLACE garde les droits ; on les redit).
REVOKE ALL ON FUNCTION public.guilde_fil(), public.guilde_records_seance(uuid), public.guilde_liste_membres(),
  public.guilde_progression(), public.guilde_invitations_recues() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilde_fil(), public.guilde_records_seance(uuid), public.guilde_liste_membres(),
  public.guilde_progression(), public.guilde_invitations_recues() TO authenticated;
-- Les déclencheurs : personne.
REVOKE ALL ON FUNCTION public.guilde_invitations_avant_ajout(), public.guilde_membres_avant_ajout() FROM PUBLIC, anon, authenticated;

-- ── Post-contrôles ────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF pg_get_functiondef('public.guilde_fil()'::regprocedure) NOT LIKE '%guilde_voit_seances(auth.uid(), s.user_id)%'
     OR pg_get_functiondef('public.guilde_records_seance(uuid)'::regprocedure) NOT LIKE '%guilde_voit_seances(auth.uid(), s.user_id)%' THEN
    RAISE EXCEPTION 'post-contrôle : le fil de la guilde ne respecte pas le compte privé';
  END IF;
  IF pg_get_functiondef('public.guilde_liste_membres()'::regprocedure) NOT LIKE '%social_bloque(auth.uid(), m.user_id)%'
     OR pg_get_functiondef('public.guilde_progression()'::regprocedure) NOT LIKE '%social_bloque(auth.uid(), x.user_id)%'
     OR pg_get_functiondef('public.guilde_invitations_avant_ajout()'::regprocedure) NOT LIKE '%guilde_bloque_avec(NEW.guilde_id, NEW.invite)%'
     OR pg_get_functiondef('public.guilde_membres_avant_ajout()'::regprocedure) NOT LIKE '%guilde_bloque_avec(NEW.guilde_id, NEW.user_id)%'
     OR pg_get_functiondef('public.guilde_invitations_recues()'::regprocedure) NOT LIKE '%guilde_bloque_avec(g.id, auth.uid())%' THEN
    RAISE EXCEPTION 'post-contrôle : le blocage ne s''applique pas partout dans la guilde';
  END IF;
  IF has_function_privilege('authenticated', 'public.guilde_voit_seances(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.guilde_voit_seances(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guilde_bloque_avec(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.guilde_bloque_avec(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-contrôle : une fonction interne s''appelle par l''API';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['public.guilde_fil()', 'public.guilde_records_seance(uuid)', 'public.guilde_liste_membres()',
               'public.guilde_progression()', 'public.guilde_invitations_recues()']) AS f(sig)
             WHERE NOT has_function_privilege('authenticated', f.sig, 'EXECUTE') OR has_function_privilege('anon', f.sig, 'EXECUTE')) THEN
    RAISE EXCEPTION 'post-contrôle : une lecture de la guilde doit rester à authenticated seulement';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'guilde%'
             AND p.proname NOT IN ('guilde_semaine_courante','guilde_mois_courant','guilde_membres_avant_modif')
             AND (NOT p.prosecdef OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'post-contrôle : fonction de guilde sans SECURITY DEFINER ou sans search_path';
  END IF;
  -- Aucune politique ajoutée : toujours une seule sur les tables de la guilde ; reactions_guilde inchangée.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('guildes','guilde_membres','guilde_invitations','guilde_defis','guilde_scores')) <> 1 THEN
    RAISE EXCEPTION 'post-contrôle : une seule politique attendue (guilde_scores_miens)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS a(nom)
             WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'guilde%'
             AND a.nom IN ('poids_corps_kg','note','rpe','ressenti','douleur')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite rendue';
  END IF;
END $$;

COMMIT;
