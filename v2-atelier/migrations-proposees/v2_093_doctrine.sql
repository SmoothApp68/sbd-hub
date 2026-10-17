-- v2_093 — Les décisions de doctrine du 16/10/2026 (audit du 16/10 ; prompt 120) : D1 et D3, leur part en base.
-- PROPOSÉE par Claude Code : Claude.ai la relit et la lance, APRÈS v2_092 (elle redéfinit `groupe_recap_de` dans sa
-- forme de v2_092) — et après la fusion de la PR 120 (l'app de 120 publie les séries et lit le nouveau défi ; une app
-- d'avant marche aussi : elle publie sans les deux colonnes, qui ont un défaut, et ne connaît pas le défi « series »,
-- qu'elle affiche comme le défi (1)).
--
-- 1. D1 — « La force estimée reste, comme progression (page de l'exercice : « Force estimée ≈ 157 kg, d'après 140 × 5 »,
--    sa courbe) ; elle sort des records, des médailles, du fil et de l'XP ; les records sont les vraies barres. »
--    L'app n'écrit plus de ligne `un_rm_estime` dans `records` ; celles d'avant RESTENT (la table est immuable,
--    `records_immuable`) et tous les lecteurs les ignorent. Côté base, un seul lecteur les comptait :
--    `groupe_recap_de` (« records : N » du récap du groupe, `count(DISTINCT r.set_id)` sans filtre de type — audit 05
--    #2). Il les ignore désormais. Les récaps DÉJÀ FIGÉS (`groupe_recaps.recap`) ne sont pas réécrits : ce sont des
--    photographies, comme un récap qu'on a lu ; le pré-contrôle dit combien de séries ne sont médaillées que par
--    l'estimation. `guilde_semaine` les excluait déjà (six types). `social_records_seance` et `guilde_records_seance`
--    rendent les lignes telles quelles : le tri est dans l'app (`faits.medaillesDuSocial`), une seule règle.
--
-- 2. D3 — « le défi de guilde par défaut devient les séries de travail de la guilde dans la semaine, objectif = sa
--    moyenne des 4 dernières semaines » (au lieu de « séances sur prévues », qui mesure l'assiduité).
--      · un nouveau type de défi, `series`, sans nombre (son objectif se calcule) ; « Sans choix », c'est lui qui part ;
--      · chacun publie, déjà calculés sur l'appareil (`faits.scoresDeGuilde`, comme les séances et les records) :
--        `series_semaine` (ses séries de musculation de la semaine — la règle de comptage de 119, sur l'appareil : le
--        catalogue y est, la base ne la recopie pas) et `series_moyenne` (sa moyenne des 4 semaines pleines d'avant, au
--        centième ; « ce qui existe » : depuis sa première semaine de musculation, 0 sans aucune) ;
--      · `guilde_semaine` rend `series_faites` (la somme) et `series_cible` (la somme des moyennes, arrondie) ; sans
--        historique chez personne, la cible vaut 0 et l'app n'en affiche pas (le compte seul) ;
--      · LES DÉFIS DÉJÀ EN COURS NE CHANGENT PAS (figés, décision du 14/10/2026) : une guilde dont la semaine est lancée
--        (`guilde_semaine_lancee`) et qui courait le défi par défaut SANS ligne dans `guilde_defis` reçoit, pour la
--        semaine courante, une ligne `seances` — son défi reste celui qu'elle courait. Une semaine pas encore lancée
--        prend le nouveau défaut (rien n'avait commencé). Les semaines suivantes : `series` par défaut.
--      · Le défi (1) « séances prévues » reste au choix de l'administrateur : D3 ne tranche que le défaut.
--
-- Aucune politique RLS touchée ou ajoutée ; aucune colonne interdite ; `guilde_semaine` garde SECURITY DEFINER,
-- `search_path` figé, `authenticated` seulement.
--
-- UNE SEULE TRANSACTION (BEGIN … COMMIT) : un contrôle qui échoue n'en laisse rien.
-- ESSAI À BLANC : remplacer le COMMIT final par ROLLBACK — les pré et post-contrôles lèvent une exception si quelque
-- chose ne va pas, et rien ne reste. Puis la lancer telle quelle.
-- Essayée sur Postgres 16 local (schéma de bouchon + v2_080, v2_082, v2_083, v2_087, v2_092, puis v2_093), scénarios
-- dans `tests/sql/v2_093_essai.sql`.

BEGIN;

-- ── Pré-contrôles ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n_rm int; n_rm_seuls int; n_fige int;
BEGIN
  IF to_regclass('public.guilde_defis') IS NULL OR to_regclass('public.guilde_scores') IS NULL OR to_regclass('public.records') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : v2_080 (guilde) ou v2_061 (records) absente';
  END IF;
  IF to_regprocedure('public.guilde_semaine_lancee(uuid)') IS NULL
     OR pg_get_functiondef('public.guilde_semaine_lancee(uuid)'::regprocedure) NOT LIKE '%cree_le%' THEN
    RAISE EXCEPTION 'pré-contrôle : v2_083 (semaine lancée après la création de la guilde) absente';
  END IF;
  -- `groupe_recap_de` est REDÉFINIE ici dans sa forme de v2_092 (la colonne `user_id` en dernier).
  IF to_regprocedure('public.groupe_recap_de(uuid,uuid)') IS NULL
     OR pg_get_function_result('public.groupe_recap_de(uuid,uuid)'::regprocedure) NOT LIKE '%user_id uuid%' THEN
    RAISE EXCEPTION 'pré-contrôle : v2_092 (groupe_recap_de avec user_id) absente — la lancer d''abord';
  END IF;
  IF pg_get_functiondef('public.groupe_recap_de(uuid,uuid)'::regprocedure) NOT LIKE '%count(DISTINCT r.set_id)%'
     OR pg_get_functiondef('public.groupe_recap_de(uuid,uuid)'::regprocedure) LIKE '%un_rm_estime%' THEN
    RAISE EXCEPTION 'pré-contrôle : groupe_recap_de a changé depuis v2_092 (ou v2_093 déjà lancée)';
  END IF;
  -- `guilde_semaine` est REDÉFINIE (deux colonnes de plus) : son corps doit être encore celui de v2_080.
  IF to_regprocedure('public.guilde_semaine()') IS NULL
     OR pg_get_functiondef('public.guilde_semaine()'::regprocedure) NOT LIKE '%coalesce(d.type, ''seances'')%'
     OR pg_get_function_result('public.guilde_semaine()'::regprocedure) LIKE '%series_faites%' THEN
    RAISE EXCEPTION 'pré-contrôle : guilde_semaine a changé depuis v2_080 (ou v2_093 déjà lancée)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guilde_scores'
             AND column_name IN ('series_semaine','series_moyenne')) THEN
    RAISE EXCEPTION 'pré-contrôle : guilde_scores porte déjà les séries (v2_093 déjà lancée ?)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='guilde_defis_type' AND conrelid='public.guilde_defis'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='guilde_defis_n' AND conrelid='public.guilde_defis'::regclass) THEN
    RAISE EXCEPTION 'pré-contrôle : contraintes guilde_defis_type / guilde_defis_n absentes';
  END IF;
  SELECT count(*) INTO n_rm FROM records WHERE type = 'un_rm_estime';
  SELECT count(DISTINCT r.set_id) INTO n_rm_seuls FROM records r WHERE r.type = 'un_rm_estime'
    AND NOT EXISTS (SELECT 1 FROM records x WHERE x.set_id = r.set_id AND x.type <> 'un_rm_estime');
  SELECT count(*) INTO n_fige FROM guildes g WHERE guilde_semaine_lancee(g.id)
    AND NOT EXISTS (SELECT 1 FROM guilde_defis d WHERE d.guilde_id = g.id AND d.semaine = guilde_semaine_courante());
  RAISE NOTICE 'pré-contrôle : % ligne(s) un_rm_estime gardées (immuables, ignorées), dont % série(s) médaillée(s) par la seule estimation ; % guilde(s) dont le défi par défaut en cours est figé en « seances » pour cette semaine',
    n_rm, n_rm_seuls, n_fige;
END $$;

-- ── 1. D1 — le récap du groupe ne compte plus la force estimée ────────────────────────────────────────────────────
-- Corps de v2_092, inchangé sauf le filtre du type. Signature identique : CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.groupe_recap_de(p_groupe uuid, p_moi uuid)
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
       WHERE r.session_id = m.session_id AND s.user_id = m.user_id AND r.type <> 'un_rm_estime'),
    CASE WHEN p.jeu_actif THEN m.xp END,
    m.entre_le,
    m.user_id
  FROM groupe_membres m JOIN profiles p ON p.id = m.user_id
  WHERE m.groupe_id = p_groupe AND p.deleted_at IS NULL
  ORDER BY m.entre_le, m.user_id $f$;

-- ── 2. D3 — le défi par défaut : les séries de travail de la semaine ──────────────────────────────────────────────
-- a. Les défis en cours restent ceux qu'ils étaient : une semaine lancée qui courait le défaut le garde, écrit.
INSERT INTO public.guilde_defis (guilde_id, semaine, type, n)
  SELECT g.id, guilde_semaine_courante(), 'seances', NULL FROM public.guildes g
  WHERE guilde_semaine_lancee(g.id)
    AND NOT EXISTS (SELECT 1 FROM public.guilde_defis d WHERE d.guilde_id = g.id AND d.semaine = guilde_semaine_courante());

-- b. Le type `series`, sans nombre.
ALTER TABLE public.guilde_defis DROP CONSTRAINT guilde_defis_n;
ALTER TABLE public.guilde_defis DROP CONSTRAINT guilde_defis_type;
ALTER TABLE public.guilde_defis ADD CONSTRAINT guilde_defis_type CHECK (type IN ('series','seances','records','variete'));
ALTER TABLE public.guilde_defis ADD CONSTRAINT guilde_defis_n CHECK (
  (type IN ('seances','series') AND n IS NULL) OR (type NOT IN ('seances','series') AND n BETWEEN 1 AND 100));

-- c. Mes séries publiées (déjà calculées sur l'appareil). Un défaut à 0 : une app d'avant v2_093 publie sans elles.
ALTER TABLE public.guilde_scores
  ADD COLUMN series_semaine integer NOT NULL DEFAULT 0 CONSTRAINT guilde_scores_series_semaine CHECK (series_semaine BETWEEN 0 AND 2000),
  ADD COLUMN series_moyenne numeric(7,2) NOT NULL DEFAULT 0 CONSTRAINT guilde_scores_series_moyenne CHECK (series_moyenne BETWEEN 0 AND 2000);

-- d. `guilde_semaine` : le défaut `series`, et ses deux nombres (en dernier : l'app lit les colonnes par leur nom).
DROP FUNCTION public.guilde_semaine();
CREATE FUNCTION public.guilde_semaine()
RETURNS TABLE(semaine date, defi text, n integer, defi_modifiable boolean, seances_faites integer, seances_prevues integer, records_semaine integer,
              exercices integer, seances integer, medailles integer, tonnage_kg numeric, series_faites integer, series_cible integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  WITH g AS (SELECT guilde_de(auth.uid()) AS id, guilde_semaine_courante() AS lundi),
  m AS (SELECT gm.user_id FROM guilde_membres gm, g WHERE gm.guilde_id = g.id),
  s AS (SELECT se.id FROM sessions se, g WHERE se.user_id IN (SELECT user_id FROM m) AND se.statut = 'terminee'
          AND se.visibilite <> 'private' AND (se.debut AT TIME ZONE 'Europe/Paris')::date >= g.lundi
          AND (se.debut AT TIME ZONE 'Europe/Paris')::date < g.lundi + 7
          AND EXISTS (SELECT 1 FROM sets t WHERE t.session_id = se.id AND coalesce(t.type_serie,'travail') = 'travail')),
  sc AS (SELECT x.* FROM guilde_scores x, g WHERE x.user_id IN (SELECT user_id FROM m) AND x.semaine = g.lundi)
  SELECT g.lundi, coalesce(d.type, 'series'), d.n, NOT guilde_semaine_lancee(g.id),
    (SELECT coalesce(sum(least(seances, prevues)), 0)::int FROM sc),
    (SELECT coalesce(sum(prevues), 0)::int FROM sc),
    (SELECT coalesce(sum(records_semaine), 0)::int FROM sc),
    (SELECT count(DISTINCT t.exercise_slug)::int FROM sets t WHERE t.session_id IN (SELECT id FROM s)
       AND coalesce(t.type_serie,'travail') = 'travail'),
    (SELECT count(*)::int FROM s),
    (SELECT count(DISTINCT r.set_id)::int FROM records r WHERE r.session_id IN (SELECT id FROM s)
       AND r.type IN ('charge_a_reps','reps_a_charge','charge_max','cap','duree_s','distance_m')),
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t WHERE t.session_id IN (SELECT id FROM s)
       AND coalesce(t.type_serie,'travail') = 'travail' AND t.charge_kg > 0 AND t.reps > 0),
    (SELECT coalesce(sum(series_semaine), 0)::int FROM sc),
    (SELECT round(coalesce(sum(series_moyenne), 0))::int FROM sc)
  FROM g LEFT JOIN guilde_defis d ON d.guilde_id = g.id AND d.semaine = g.lundi
  WHERE g.id IS NOT NULL $f$;

REVOKE ALL ON FUNCTION public.guilde_semaine() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilde_semaine() TO authenticated;
-- La fonction interne du récap : personne par l'API (comme v2_092).
REVOKE ALL ON FUNCTION public.groupe_recap_de(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- ── Post-contrôles ────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF pg_get_functiondef('public.groupe_recap_de(uuid,uuid)'::regprocedure) NOT LIKE '%r.type <> ''un_rm_estime''%' THEN
    RAISE EXCEPTION 'post-contrôle : groupe_recap_de compte encore la force estimée';
  END IF;
  IF has_function_privilege('authenticated', 'public.groupe_recap_de(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.groupe_recap_de(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-contrôle : groupe_recap_de ne s''appelle pas par l''API';
  END IF;
  IF pg_get_functiondef('public.guilde_semaine()'::regprocedure) NOT LIKE '%coalesce(d.type, ''series'')%'
     OR pg_get_function_result('public.guilde_semaine()'::regprocedure) NOT LIKE '%series_cible integer%' THEN
    RAISE EXCEPTION 'post-contrôle : guilde_semaine sans le défaut « series » ou sans series_cible';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.guilde_semaine()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.guilde_semaine()', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-contrôle : guilde_semaine doit rester à authenticated seulement';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid IN ('public.guilde_semaine()'::regprocedure, 'public.groupe_recap_de(uuid,uuid)'::regprocedure)
             AND (NOT p.prosecdef OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'post-contrôle : une fonction redéfinie sans SECURITY DEFINER ou sans search_path';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='guilde_scores'
      AND column_name IN ('series_semaine','series_moyenne')) <> 2 THEN
    RAISE EXCEPTION 'post-contrôle : colonnes des séries absentes de guilde_scores';
  END IF;
  IF EXISTS (SELECT 1 FROM guildes g WHERE guilde_semaine_lancee(g.id)
             AND NOT EXISTS (SELECT 1 FROM guilde_defis d WHERE d.guilde_id = g.id AND d.semaine = guilde_semaine_courante())) THEN
    RAISE EXCEPTION 'post-contrôle : une semaine lancée sans défi écrit (le défi en cours changerait)';
  END IF;
  -- Aucune politique ajoutée : toujours une seule sur les tables de la guilde.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('guildes','guilde_membres','guilde_invitations','guilde_defis','guilde_scores')) <> 1 THEN
    RAISE EXCEPTION 'post-contrôle : une seule politique attendue (guilde_scores_miens)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name = 'guilde_scores'
             AND column_name IN ('poids_corps_kg','note','rpe','ressenti','douleur','charge_kg')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite dans guilde_scores';
  END IF;
END $$;

COMMIT;
