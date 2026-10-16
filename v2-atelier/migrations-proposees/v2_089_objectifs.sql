-- v2_089 — L'objectif, à l'essai (16/10/2026, MOTEUR §9.25, prompt 109)
--
-- Une table : l'objectif que la personne pose elle-même sur un exercice, en charge × reps (« 150 kg × 1 au
-- squat ») ; le coach ne l'impose jamais. Un objectif par exercice (clé user_id, exercise_slug) : le changer
-- réécrit la ligne, le retirer l'efface. La date annoncée est figée à la pose (`projection`, `echeance`).
--
-- Le PARI de date vit dans `predictions` (module « objectif », grandeur « jours ») et n'est pas ici : un objectif
-- changé ou retiré n'efface jamais son ancien pari. `predictions_observation_coherente` N'EST PAS ÉTENDUE : son
-- observation se rattache à la série qui atteint l'objectif (`set_observe`), comme un pari de consigne.
--
-- Aucune politique existante n'est touchée. Le compte supprimé emporte ses objectifs (auth.users, cascade) ; un
-- exercice personnel effacé emporte les siens (exercises, cascade) — `delete_user_complete_data` n'a rien à changer.
--
-- UNE SEULE TRANSACTION (BEGIN … COMMIT) : un contrôle qui échoue n'en laisse rien.
-- ESSAI À BLANC : remplacer le COMMIT final par ROLLBACK — les pré et post-contrôles lèvent une exception si quelque
-- chose ne va pas, et rien ne reste. Puis le lancer tel quel.

BEGIN;

-- ── Pré-contrôles ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.objectifs') IS NOT NULL THEN
    RAISE EXCEPTION 'pré-contrôle : public.objectifs existe déjà';
  END IF;
  IF to_regclass('public.exercises') IS NULL OR to_regclass('public.predictions') IS NULL THEN
    RAISE EXCEPTION 'pré-contrôle : exercises ou predictions absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'predictions_observation_coherente'
                 AND conrelid = 'public.predictions'::regclass) THEN
    RAISE EXCEPTION 'pré-contrôle : predictions_observation_coherente introuvable';
  END IF;
END $$;

-- La contrainte des paris, telle qu'elle est avant : le post-contrôle vérifie qu'elle n'a pas bougé.
CREATE TEMP TABLE v2_089_avant ON COMMIT DROP AS
  SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
  WHERE conname = 'predictions_observation_coherente' AND conrelid = 'public.predictions'::regclass;
CREATE TEMP TABLE v2_089_politiques ON COMMIT DROP AS
  SELECT count(*) AS n FROM pg_policies WHERE schemaname = 'public';

-- ── La table ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.objectifs (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_slug text        NOT NULL REFERENCES public.exercises(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  charge_kg     numeric     NOT NULL CHECK (charge_kg > 0 AND charge_kg <= 1000),
  reps          integer     NOT NULL CHECK (reps BETWEEN 1 AND 100),
  -- L'instant de la pose : il nomme le pari (UUID v5 sur « objectif|exercice|pose ») et ouvre la fenêtre
  -- où l'objectif peut être atteint.
  pose_le       timestamptz NOT NULL,
  -- Le record « charge pour au moins N reps » à la pose (le départ de la jauge) ; NULL s'il n'y en avait pas.
  depart_kg     numeric     CHECK (depart_kg IS NULL OR depart_kg >= 0),
  -- Ce que le coach a annoncé à la pose, figé : une date (`echeance`, la fin du mois, et son pari), « pas encore
  -- de date », « plus d'un an », ou rien en « Juste un carnet ».
  projection    text        NOT NULL CHECK (projection IN ('date', 'pas_encore', 'plus_d_un_an', 'carnet')),
  echeance      date,
  pari_id       uuid,
  CONSTRAINT objectifs_date_et_pari CHECK (
    (projection = 'date') = (echeance IS NOT NULL) AND (projection = 'date') = (pari_id IS NOT NULL)),
  PRIMARY KEY (user_id, exercise_slug)
);
COMMENT ON TABLE public.objectifs IS
  'L''objectif posé par la personne sur un exercice (charge × reps), un par exercice, à l''essai (MOTEUR §9.25). '
  'Le pari de date vit dans predictions (module objectif, grandeur jours).';

ALTER TABLE public.objectifs ENABLE ROW LEVEL SECURITY;
CREATE POLICY objectifs_miens ON public.objectifs FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON TABLE public.objectifs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.objectifs TO authenticated;

-- ── Post-contrôles ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.objectifs'::regclass) THEN
    RAISE EXCEPTION 'post-contrôle : RLS inactive sur objectifs';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'objectifs') <> 1 THEN
    RAISE EXCEPTION 'post-contrôle : une politique attendue sur objectifs';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') <> (SELECT n FROM v2_089_politiques) + 1 THEN
    RAISE EXCEPTION 'post-contrôle : une autre politique a bougé';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'predictions_observation_coherente'
      AND conrelid = 'public.predictions'::regclass) IS DISTINCT FROM (SELECT def FROM v2_089_avant) THEN
    RAISE EXCEPTION 'post-contrôle : predictions_observation_coherente a changé';
  END IF;
  IF has_table_privilege('anon', 'public.objectifs', 'SELECT') THEN
    RAISE EXCEPTION 'post-contrôle : anon lit objectifs';
  END IF;
  IF EXISTS (SELECT 1 FROM public.objectifs) THEN
    RAISE EXCEPTION 'post-contrôle : la table neuve n''est pas vide';
  END IF;
END $$;

COMMIT;
