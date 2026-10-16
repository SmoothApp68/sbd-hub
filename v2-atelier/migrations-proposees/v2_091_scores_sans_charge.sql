-- v2_091 — Le poids ne quitte jamais le téléphone (audit du 16/10/2026, P0 #1 du domaine social, prompt 114)
-- PROPOSÉE par Claude Code : Claude.ai la relit et la lance.
--
-- LE DÉFAUT : `scores_force` gardait, par exercice, le score DOTS ET sa charge, et `social_scores_force` les rendait
-- tous deux aux mutuels. Or `polynôme(poids) = charge × 500 ÷ score` : le poids de corps se recalculait au centième.
-- L'app de 114 calcule désormais le score sur un poids FLOUTÉ (la pesée + un décalage secret propre à l'appareil,
-- arrondie à la dizaine : `social.js`, `poidsFloute`) et ne publie plus que le score. Cette migration ferme la base
-- derrière elle :
--   1. les lignes existantes sont EFFACÉES : calculées sur la pesée exacte, elles trahissent le poids même sans leur
--      charge (un mutuel voit les charges dans les séances). Ce ne sont que des chiffres dérivés : l'app les
--      republie, floutés, à la prochaine ouverture du fil, de « Entre amis », de « Se comparer » ou en fin de séance.
--      ⚠️ C'EST UN DELETE (27 lignes, un seul compte, aurel_br, au 16/10/2026).
--   2. `charge_kg` n'est plus exigée et ne peut plus rien contenir (`scores_force_sans_charge CHECK (charge_kg IS
--      NULL)`) : même une app d'avant 114 restée en cache ne peut plus publier un score exact avec sa charge — sa
--      requête est refusée (23514), l'app l'avale sans casser.
--   3. `social_scores_force` garde sa signature (user_id, pseudo, score, charge_kg, moi) — l'app d'avant comme celle
--      d'après la lisent sans erreur — mais ne rend plus la charge de personne d'autre (`CASE … END`, NULL).
--
-- Aucune politique RLS touchée (scores_force_miens reste la seule). La colonne `charge_kg` reste (vide) : la retirer
-- changerait la signature de la fonction ; un nettoyage ultérieur pourra le faire avec l'app prête.
--
-- UNE SEULE TRANSACTION (BEGIN … COMMIT) : un contrôle qui échoue n'en laisse rien.
-- ESSAI À BLANC : remplacer le COMMIT final par ROLLBACK — les pré et post-contrôles lèvent une exception si quelque
-- chose ne va pas, et rien ne reste. Puis la lancer telle quelle.

BEGIN;

-- ── Pré-contrôles ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.scores_force') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : public.scores_force absente (v2_079)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.scores_force'::regclass
             AND conname = 'scores_force_sans_charge') THEN
    RAISE EXCEPTION 'pré-contrôle : scores_force_sans_charge existe déjà (v2_091 déjà lancée ?)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.scores_force'::regclass
                 AND conname = 'scores_force_charge_kg_check') THEN
    RAISE EXCEPTION 'pré-contrôle : scores_force_charge_kg_check introuvable';
  END IF;
  IF (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'scores_force' AND column_name = 'charge_kg') IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION 'pré-contrôle : scores_force.charge_kg n''est pas NOT NULL comme v2_079 l''a créée';
  END IF;
  IF to_regprocedure('public.social_scores_force(text)') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : public.social_scores_force(text) absente';
  END IF;
  IF (SELECT array_to_string(proargnames, ',') FROM pg_proc
      WHERE oid = to_regprocedure('public.social_scores_force(text)')) IS DISTINCT FROM 'p_slug,user_id,pseudo,score,charge_kg,moi' THEN
    RAISE EXCEPTION 'pré-contrôle : social_scores_force n''a pas la signature de v2_079';
  END IF;
END $$;
-- Ce qui ne doit pas bouger : les politiques (toutes), les droits sur la fonction.
CREATE TEMP TABLE v2_091_politiques ON COMMIT DROP AS
  SELECT schemaname, tablename, policyname, cmd, coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check
  FROM pg_policies;
CREATE TEMP TABLE v2_091_lignes ON COMMIT DROP AS
  SELECT count(*) AS n, count(DISTINCT user_id) AS comptes FROM public.scores_force;
DO $$ BEGIN
  RAISE NOTICE 'scores_force avant : % ligne(s), % compte(s) — effacées', (SELECT n FROM v2_091_lignes), (SELECT comptes FROM v2_091_lignes);
END $$;

-- ── 1. Les scores calculés sur la pesée exacte : effacés (l'app les republie, floutés) ─────────────────────────
DELETE FROM public.scores_force;

-- ── 2. Plus jamais de charge à côté du score ───────────────────────────────────────────────────────────────────
ALTER TABLE public.scores_force DROP CONSTRAINT scores_force_charge_kg_check;
ALTER TABLE public.scores_force ALTER COLUMN charge_kg DROP NOT NULL;
ALTER TABLE public.scores_force ADD CONSTRAINT scores_force_sans_charge CHECK (charge_kg IS NULL);
COMMENT ON COLUMN public.scores_force.charge_kg IS
  'Vide depuis v2_091 (audit du 16/10/2026) : score + charge redonnaient le poids de corps. Gardée pour la signature de social_scores_force.';
COMMENT ON COLUMN public.scores_force.score IS
  'Score DOTS calculé sur l''appareil sur un poids flouté (pesée + décalage secret, arrondie à la dizaine : social.js poidsFloute).';

-- ── 3. La fonction : même signature, la charge de personne d'autre ─────────────────────────────────────────────
-- CREATE OR REPLACE garde le propriétaire et les droits (authenticated seulement, v2_079).
CREATE OR REPLACE FUNCTION public.social_scores_force(p_slug text)
RETURNS TABLE(user_id uuid, pseudo text, score numeric, charge_kg numeric, moi boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT f.user_id, p.username, f.score,
         CASE WHEN f.user_id = auth.uid() THEN f.charge_kg END,
         f.user_id = auth.uid()
  FROM scores_force f JOIN profiles p ON p.id = f.user_id
  WHERE f.exercise_slug = p_slug AND p.deleted_at IS NULL
    AND (f.user_id = auth.uid() OR social_mutuel(auth.uid(), f.user_id)) $f$;

-- ── Post-contrôles ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE src text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scores_force) THEN
    RAISE EXCEPTION 'post-contrôle : scores_force n''est pas vide';
  END IF;
  IF (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'scores_force' AND column_name = 'charge_kg') <> 'YES' THEN
    RAISE EXCEPTION 'post-contrôle : charge_kg encore NOT NULL';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.scores_force'::regclass
      AND conname = 'scores_force_sans_charge') IS DISTINCT FROM 'CHECK ((charge_kg IS NULL))' THEN
    RAISE EXCEPTION 'post-contrôle : scores_force_sans_charge absente ou différente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.scores_force'::regclass
             AND conname = 'scores_force_charge_kg_check') THEN
    RAISE EXCEPTION 'post-contrôle : l''ancien CHECK de charge est resté';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scores_force'
             AND column_name NOT IN ('user_id', 'exercise_slug', 'score', 'charge_kg', 'maj_le')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne inattendue sur scores_force';
  END IF;
  -- Les politiques : exactement les mêmes, partout.
  IF EXISTS (SELECT schemaname, tablename, policyname, cmd, coalesce(qual, ''), coalesce(with_check, '') FROM pg_policies
             EXCEPT SELECT * FROM v2_091_politiques)
     OR EXISTS (SELECT * FROM v2_091_politiques
             EXCEPT SELECT schemaname, tablename, policyname, cmd, coalesce(qual, ''), coalesce(with_check, '') FROM pg_policies) THEN
    RAISE EXCEPTION 'post-contrôle : une politique a bougé';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.scores_force'::regclass) THEN
    RAISE EXCEPTION 'post-contrôle : RLS inactive sur scores_force';
  END IF;
  -- La fonction : la signature de v2_079, SECURITY DEFINER, search_path figé, fermée à anon, et la charge des autres
  -- jamais rendue.
  IF (SELECT array_to_string(proargnames, ',') FROM pg_proc
      WHERE oid = to_regprocedure('public.social_scores_force(text)')) IS DISTINCT FROM 'p_slug,user_id,pseudo,score,charge_kg,moi' THEN
    RAISE EXCEPTION 'post-contrôle : signature de social_scores_force changée';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.social_scores_force(text)')
             AND (NOT p.prosecdef OR p.proconfig IS NULL OR has_function_privilege('anon', p.oid, 'EXECUTE')
                  OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'post-contrôle : social_scores_force sans SECURITY DEFINER, sans search_path, ouverte à anon ou fermée à authenticated';
  END IF;
  SELECT prosrc INTO src FROM pg_proc WHERE oid = to_regprocedure('public.social_scores_force(text)');
  IF position('CASE WHEN f.user_id = auth.uid() THEN f.charge_kg END' IN src) = 0 THEN
    RAISE EXCEPTION 'post-contrôle : social_scores_force rend encore la charge des autres';
  END IF;
END $$;

COMMIT;
