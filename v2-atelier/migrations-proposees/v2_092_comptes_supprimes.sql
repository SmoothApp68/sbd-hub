-- v2_092 — Un compte supprimé ne reste ni administrateur, ni créateur, ni pseudo dans les récaps des autres
-- (audit du 16/10/2026 : vérification en base de Claude.ai, et décision D7 d'Aurélien ; prompt 118).
-- PROPOSÉE par Claude Code : Claude.ai la relit et la lance, APRÈS v2_087 — et APRÈS la fusion de la PR 118 (l'app
-- de 118 sait dire « un ancien membre » ; une app d'avant afficherait un pseudo vide).
-- Aucun DELETE de données de personne : seulement des guildes déjà sans membre (s'il en reste, voir 1).
--
-- 1. `guildes.admin` — AUCUNE CLÉ ÉTRANGÈRE. Le déclencheur de départ (v2_080, `guilde_membres_apres_depart`) passe
--    déjà l'administration au plus ancien membre quand l'administrateur part, cascade d'un compte supprimé comprise ;
--    mais rien ne GARANTIT qu'un administrateur existe. Désormais : clé étrangère vers `auth.users`, ON DELETE SET
--    NULL (la colonne devient nullable — NOT NULL et SET NULL ne vont pas ensemble, et une clé qui bloquerait la
--    suppression d'un compte n'est pas acceptable). L'ordre des deux actions (la cascade sur `guilde_membres`, le SET
--    NULL sur `guildes`) n'est pas garanti : le déclencheur de départ transmet donc AUSSI quand l'administrateur est
--    NULL — dans les deux ordres, la guilde finit au plus ancien membre (la règle de transmission de v2_080, SOCIAL-V1),
--    ou disparaît si elle n'a plus personne. Les guildes déjà orphelines (administrateur absent d'`auth.users`) sont
--    réparées par la même règle avant de poser la clé ; une guilde orpheline SANS membre est effacée (elle aurait
--    déjà dû l'être).
--
-- 2. `groupes.createur` — AUCUNE CLÉ ÉTRANGÈRE, et AUCUN POUVOIR : la colonne n'est lue par aucune fonction (le groupe
--    n'a pas d'administrateur). Un groupe vidé de ses membres se termine déjà (v2_082/v2_087 : `groupe_membres_apres`
--    fige les récaps et efface le groupe quand plus personne n'a de place ouverte, cascade d'un compte supprimé
--    comprise). Ne reste que l'identifiant d'un compte qui n'existe plus : clé étrangère, ON DELETE SET NULL.
--
-- 3. D7 — « FAITE EN GROUPE AVEC UN ANCIEN MEMBRE », CHIFFRES GARDÉS. Le récap figé (`groupe_recaps.recap`) porte le
--    pseudo et les totaux de chaque membre, sans son identifiant : rien ne permettait de le retrouver. Choix : PAR LA
--    BASE, À LA SUPPRESSION (et pas à la lecture : le pseudo est figé dans le JSON, il ne vient pas d'une jointure) —
--      · le récap figé porte désormais l'identifiant de chaque membre (`uid`, ajouté par `groupe_recap_json`), JAMAIS
--        rendu à l'app (`groupe_recap_seance` le retire, `groupe_recap_public`) ;
--      · un déclencheur AFTER DELETE sur `profiles` (la ligne part par `delete_user_complete_data`, ou en cascade
--        d'`auth.users` — les deux chemins passent ici, sans réécrire la fonction de suppression, dont le corps n'est
--        pas au dépôt) remplace, dans les récaps des AUTRES, l'entrée du compte supprimé par
--        `{ pseudo: null, ancien: true, … }` : ses chiffres restent, son pseudo et son identifiant partent. L'app dit
--        « un ancien membre ».
--      · Un récap figé AVANT cette migration n'a pas d'`uid` : il se rapproche par le pseudo du compte supprimé (au
--        moment de la suppression), seulement sur une entrée qui n'est pas « moi ». Limite connue : un membre qui a
--        changé de pseudo depuis ce récap-là n'y est pas retrouvé. Les récaps des comptes DÉJÀ supprimés ne sont pas
--        touchés (leur pseudo n'est plus connu) : le pré-contrôle en donne le nombre.
--
-- Aucune politique RLS touchée ; aucune colonne interdite rendue ; toutes les fonctions SECURITY DEFINER, search_path
-- figé, appelables par personne d'autre qu'`authenticated` pour celles qui l'étaient (les internes : personne).
--
-- UNE SEULE TRANSACTION (BEGIN … COMMIT) : un contrôle qui échoue n'en laisse rien.
-- ESSAI À BLANC : remplacer le COMMIT final par ROLLBACK — les pré et post-contrôles lèvent une exception si quelque
-- chose ne va pas, et rien ne reste. Puis la lancer telle quelle.
-- Essayée sur Postgres 16 local (schéma de bouchon + v2_080, v2_082, v2_087), scénarios en fin de fichier de test
-- `tests/sql/v2_092_essai.sql`.

BEGIN;

-- ── Pré-contrôles ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_g int; n_gv int; n_c int; n_r int;
BEGIN
  IF to_regclass('public.guildes') IS NULL OR to_regclass('public.groupes') IS NULL OR to_regclass('public.groupe_recaps') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : v2_080 / v2_082 absentes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groupes'
                 AND column_name='fini_le') THEN
    RAISE EXCEPTION 'pré-contrôle : v2_087 (groupes.fini_le) absente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guildes'::regclass AND contype='f')
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.groupes'::regclass AND contype='f') THEN
    RAISE EXCEPTION 'pré-contrôle : une clé étrangère existe déjà sur guildes ou groupes (v2_092 déjà lancée ?)';
  END IF;
  IF to_regprocedure('public.groupe_recap_de(uuid,uuid)') IS NULL OR to_regprocedure('public.groupe_recap_json(uuid,uuid)') IS NULL
     OR to_regprocedure('public.groupe_recap_seance(uuid)') IS NULL OR to_regprocedure('public.guilde_membres_apres_depart()') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : fonctions du groupe ou de la guilde absentes';
  END IF;
  -- `groupe_recap_de` est REDÉFINIE ici (une colonne de plus) : son corps doit être encore celui de v2_082.
  IF pg_get_functiondef('public.groupe_recap_de(uuid,uuid)'::regprocedure) NOT LIKE '%count(DISTINCT r.set_id)%'
     OR pg_get_functiondef('public.groupe_recap_de(uuid,uuid)'::regprocedure) NOT LIKE '%p.deleted_at IS NULL%'
     OR pg_get_functiondef('public.groupe_recap_de(uuid,uuid)'::regprocedure) NOT LIKE '%CASE WHEN p.jeu_actif THEN m.xp END%' THEN
    RAISE EXCEPTION 'pré-contrôle : groupe_recap_de a changé depuis v2_082 — relire v2_092 avant de la lancer';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_apres_suppression_recaps') THEN
    RAISE EXCEPTION 'pré-contrôle : le déclencheur profiles_apres_suppression_recaps existe déjà';
  END IF;
  SELECT count(*) INTO n_g FROM guildes g WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.admin);
  SELECT count(*) INTO n_gv FROM guildes g WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.admin)
    AND NOT EXISTS (SELECT 1 FROM guilde_membres m WHERE m.guilde_id = g.id);
  SELECT count(*) INTO n_c FROM groupes g WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.createur);
  SELECT count(*) INTO n_r FROM groupe_recaps r, jsonb_array_elements(r.recap->'membres') e
    WHERE NOT coalesce((e->>'moi')::boolean, false) AND e->>'pseudo' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.username = e->>'pseudo');
  RAISE NOTICE 'pré-contrôle : % guilde(s) à administrateur disparu (dont % sans membre, effacée(s)), % groupe(s) à créateur disparu, % entrée(s) de récap au pseudo inconnu aujourd''hui (compte supprimé avant v2_092, ou pseudo changé : non touchées)',
    n_g, n_gv, n_c, n_r;
END $$;

-- ── 1. guildes.admin ──────────────────────────────────────────────────────────────────────────────────────────
-- La transmission de v2_080, et AUSSI quand l'administrateur est vide (la clé l'a mis à NULL avant la cascade).
CREATE OR REPLACE FUNCTION public.guilde_membres_apres_depart() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE suivant uuid; a uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM guildes WHERE id = OLD.guilde_id) THEN RETURN OLD; END IF;
  SELECT user_id INTO suivant FROM guilde_membres WHERE guilde_id = OLD.guilde_id
    ORDER BY entre_le, user_id LIMIT 1;
  SELECT admin INTO a FROM guildes WHERE id = OLD.guilde_id;
  IF suivant IS NULL THEN
    DELETE FROM guildes WHERE id = OLD.guilde_id;
  ELSIF a IS NULL OR a = OLD.user_id THEN
    UPDATE guildes SET admin = suivant WHERE id = OLD.guilde_id;
  END IF;
  RETURN OLD;
END $f$;

-- Les guildes déjà orphelines : le plus ancien membre, ou la guilde disparaît si elle n'a plus personne.
DELETE FROM public.guildes g WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.admin)
  AND NOT EXISTS (SELECT 1 FROM public.guilde_membres m WHERE m.guilde_id = g.id);
UPDATE public.guildes g SET admin = (SELECT m.user_id FROM public.guilde_membres m WHERE m.guilde_id = g.id
                                     ORDER BY m.entre_le, m.user_id LIMIT 1)
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.admin);

ALTER TABLE public.guildes ALTER COLUMN admin DROP NOT NULL;
ALTER TABLE public.guildes ADD CONSTRAINT guildes_admin_fkey FOREIGN KEY (admin) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. groupes.createur ───────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.groupes ALTER COLUMN createur DROP NOT NULL;
UPDATE public.groupes g SET createur = NULL WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = g.createur);
ALTER TABLE public.groupes ADD CONSTRAINT groupes_createur_fkey FOREIGN KEY (createur) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 3. D7 — le récap figé garde ses chiffres, pas le pseudo d'un compte supprimé ────────────────────────────────
-- `groupe_recap_de` rend aussi l'identifiant du membre (en DERNIÈRE colonne : `groupe_recap` lit les autres par leur
-- nom). Corps de v2_082, inchangé par ailleurs.
DROP FUNCTION public.groupe_recap_de(uuid, uuid);
CREATE FUNCTION public.groupe_recap_de(p_groupe uuid, p_moi uuid)
RETURNS TABLE(pseudo text, moi boolean, tonnage_kg numeric, series integer, records integer, xp integer, entre_le timestamptz,
              user_id uuid)
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
    m.entre_le,
    m.user_id
  FROM groupe_membres m JOIN profiles p ON p.id = m.user_id
  WHERE m.groupe_id = p_groupe AND p.deleted_at IS NULL
  ORDER BY m.entre_le, m.user_id $f$;

-- Le récap (figé ou du moment) porte l'identifiant de chaque membre (`uid`), pour qu'un compte supprimé s'y retrouve.
CREATE OR REPLACE FUNCTION public.groupe_recap_json(p_groupe uuid, p_moi uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT jsonb_build_object('membres', coalesce(jsonb_agg(jsonb_build_object('pseudo', x.pseudo, 'moi', x.moi,
           'tonnage_kg', x.tonnage_kg, 'series', x.series, 'records', x.records, 'xp', x.xp, 'uid', x.user_id)
           ORDER BY x.entre_le), '[]'::jsonb))
  FROM groupe_recap_de(p_groupe, p_moi) x $f$;

-- Ce que l'app reçoit : le récap SANS les identifiants.
CREATE FUNCTION public.groupe_recap_public(p_recap jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT CASE WHEN jsonb_typeof(p_recap->'membres') = 'array'
    THEN jsonb_set(p_recap, '{membres}', coalesce((SELECT jsonb_agg(e - 'uid' ORDER BY o)
           FROM jsonb_array_elements(p_recap->'membres') WITH ORDINALITY t(e, o)), '[]'::jsonb))
    ELSE p_recap END $f$;

-- L'entrée d'un compte supprimé : ses chiffres, sans pseudo ni identifiant. Par l'identifiant (récaps figés après
-- v2_092) ; sinon (récaps d'avant), par le pseudo du compte au moment de la suppression, jamais sur l'entrée « moi ».
CREATE FUNCTION public.groupe_recap_anonymiser(p_recap jsonb, p_uid uuid, p_pseudo text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT CASE WHEN jsonb_typeof(p_recap->'membres') = 'array'
    THEN jsonb_set(p_recap, '{membres}', coalesce((SELECT jsonb_agg(
           CASE WHEN (e ? 'uid' AND e->>'uid' = p_uid::text)
                  OR (NOT (e ? 'uid') AND NOT coalesce((e->>'moi')::boolean, false) AND p_pseudo IS NOT NULL
                      AND e->>'pseudo' = p_pseudo)
                THEN (e - 'uid') || jsonb_build_object('pseudo', NULL, 'ancien', true)
                ELSE e END ORDER BY o)
           FROM jsonb_array_elements(p_recap->'membres') WITH ORDINALITY t(e, o)), '[]'::jsonb))
    ELSE p_recap END $f$;

-- Le récap d'une de MES séances : celui de v2_087, rendu SANS identifiants.
CREATE OR REPLACE FUNCTION public.groupe_recap_seance(p_session uuid)
RETURNS TABLE(le timestamptz, recap jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
#variable_conflict use_column
DECLARE g uuid;
BEGIN
  PERFORM groupe_entretien();
  IF EXISTS (SELECT 1 FROM groupe_recaps r WHERE r.session_id = p_session AND r.user_id = auth.uid()) THEN
    RETURN QUERY SELECT r.le, groupe_recap_public(r.recap) FROM groupe_recaps r
      WHERE r.session_id = p_session AND r.user_id = auth.uid()
      ORDER BY r.fige_le DESC LIMIT 1;
    RETURN;
  END IF;
  SELECT m.groupe_id INTO g FROM groupe_membres m WHERE m.session_id = p_session AND m.user_id = auth.uid();
  IF g IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT x.cree_le, groupe_recap_public(groupe_recap_json(g, auth.uid())) FROM groupes x WHERE x.id = g;
END $f$;

-- LE DÉCLENCHEUR : un profil qui part (suppression du compte) sort, par son pseudo, des récaps figés des autres.
CREATE FUNCTION public.groupe_recaps_compte_supprime() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  UPDATE groupe_recaps r SET recap = groupe_recap_anonymiser(r.recap, OLD.id, OLD.username)
  WHERE r.user_id <> OLD.id AND jsonb_typeof(r.recap->'membres') = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.recap->'membres') e
                WHERE (e ? 'uid' AND e->>'uid' = OLD.id::text)
                   OR (NOT (e ? 'uid') AND NOT coalesce((e->>'moi')::boolean, false) AND OLD.username IS NOT NULL
                       AND e->>'pseudo' = OLD.username));
  RETURN NULL;
END $f$;
CREATE TRIGGER profiles_apres_suppression_recaps AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.groupe_recaps_compte_supprime();

-- ── Les droits ────────────────────────────────────────────────────────────────────────────────────────────────
-- Les fonctions internes : personne par l'API (ni anon, ni authenticated).
REVOKE ALL ON FUNCTION public.groupe_recap_de(uuid,uuid), public.groupe_recap_json(uuid,uuid), public.groupe_recap_public(jsonb),
  public.groupe_recap_anonymiser(jsonb,uuid,text), public.groupe_recaps_compte_supprime(), public.guilde_membres_apres_depart()
  FROM PUBLIC, anon, authenticated;
-- La lecture remplacée garde ses droits de v2_087 ; on le redit, par sûreté.
REVOKE ALL ON FUNCTION public.groupe_recap_seance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.groupe_recap_seance(uuid) TO authenticated;

-- ── Post-contrôles ────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='guildes_admin_fkey' AND conrelid='public.guildes'::regclass
                 AND confrelid='auth.users'::regclass AND confdeltype='n') THEN
    RAISE EXCEPTION 'post-contrôle : guildes_admin_fkey (ON DELETE SET NULL) absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='groupes_createur_fkey' AND conrelid='public.groupes'::regclass
                 AND confrelid='auth.users'::regclass AND confdeltype='n') THEN
    RAISE EXCEPTION 'post-contrôle : groupes_createur_fkey (ON DELETE SET NULL) absente';
  END IF;
  IF EXISTS (SELECT 1 FROM guildes g WHERE g.admin IS NULL OR NOT EXISTS (SELECT 1 FROM guilde_membres m
             WHERE m.guilde_id = g.id AND m.user_id = g.admin)) THEN
    RAISE EXCEPTION 'post-contrôle : une guilde sans administrateur membre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='profiles_apres_suppression_recaps' AND NOT tgisinternal
                 AND tgrelid='public.profiles'::regclass) THEN
    RAISE EXCEPTION 'post-contrôle : déclencheur profiles_apres_suppression_recaps absent';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
             AND p.proname IN ('groupe_recap_de','groupe_recap_json','groupe_recap_public','groupe_recap_anonymiser',
                               'groupe_recaps_compte_supprime','guilde_membres_apres_depart')
             AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE')
                  OR NOT p.prosecdef OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'post-contrôle : une fonction interne est appelable par l''API, ou sans SECURITY DEFINER / search_path';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.groupe_recap_seance(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.groupe_recap_seance(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-contrôle : groupe_recap_seance doit rester à authenticated seulement';
  END IF;
  -- Aucune politique ajoutée.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('groupes','groupe_membres','groupe_invitations','groupe_messages','groupe_recaps')) THEN
    RAISE EXCEPTION 'post-contrôle : aucune politique attendue sur les tables du groupe';
  END IF;
  -- Le récap rendu n'a jamais d'identifiant.
  IF EXISTS (SELECT 1 FROM groupe_recaps r WHERE groupe_recap_public(r.recap)::text LIKE '%"uid"%') THEN
    RAISE EXCEPTION 'post-contrôle : un identifiant reste dans un récap rendu';
  END IF;
END $$;

COMMIT;
