-- v2_079_social_etage2 — étage 2 du social (décidé le 14/10/2026, maquette social étage 2 v2, écrans 1 à 3)
-- PROPOSÉE par Claude Code (prompt 89), sur le modèle de v2_078 : Claude.ai la relit et la lance.
--
-- Tout ici est réservé aux abonnés MUTUELS (social_mutuel). Aucune politique ajoutée sur sessions/sets/records :
-- les autres ne lisent QUE par les fonctions ci-dessous, qui ne rendent que les colonnes autorisées (jamais
-- poids_corps_kg, note, rpe, ressenti, douleur, santé). Le tonnage reprend Bilan.volumeKg (bilan.js) comme v2_078 :
-- séries travail, charge > 0, reps > 0, arrondi au centième. Une « série comptée » ci-dessous = cette même série.
--
-- LE POIDS DE CORPS NE SORT JAMAIS DU TÉLÉPHONE : le score DOTS se calcule sur l'appareil (social.js, scoreDots) et
-- seuls le score et la charge sont publiés, par exercice, dans scores_force — table sans colonne de poids.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scores_force') THEN
    RAISE EXCEPTION 'pré-contrôle : scores_force existe déjà';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='social_mutuel' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'pré-contrôle : v2_078 (social_mutuel) absente';
  END IF;
END $$;

-- Le score de force publié : un par personne et par exercice, écrit par son propriétaire seul.
CREATE TABLE public.scores_force (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_slug text NOT NULL REFERENCES public.exercises(slug),
  score         numeric NOT NULL CHECK (score > 0 AND score < 2000),
  charge_kg     numeric NOT NULL CHECK (charge_kg > 0 AND charge_kg < 1000),
  maj_le        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_slug)
);
CREATE INDEX scores_force_exercice ON public.scores_force (exercise_slug);

ALTER TABLE public.scores_force ENABLE ROW LEVEL SECURITY;
CREATE POLICY scores_force_miens ON public.scores_force FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- « Ses exercices » : les plus faits sur 6 mois (le mois en cours et les 5 d'avant), avec la meilleure charge. Mutuels seulement.
CREATE FUNCTION public.social_exercices_ami(p_user uuid)
RETURNS TABLE(exercise_slug text, charge_max numeric, seances integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT t.exercise_slug, max(t.charge_kg), count(DISTINCT t.session_id)::int
  FROM sets t JOIN sessions s ON s.id = t.session_id
  WHERE s.user_id = p_user AND s.statut = 'terminee' AND s.visibilite <> 'private'
    AND s.debut >= date_trunc('month', now()) - interval '5 months'
    AND coalesce(t.type_serie,'travail') = 'travail' AND t.charge_kg > 0 AND t.reps > 0
    AND social_mutuel(auth.uid(), p_user)
  GROUP BY t.exercise_slug
  ORDER BY count(DISTINCT t.session_id) DESC, max(t.charge_kg) DESC, t.exercise_slug
  LIMIT 12 $f$;

-- La page d'un exercice d'un ami : ses séries comptées sur 6 mois (date de la séance, charge, reps). L'app en tire
-- la meilleure charge, la meilleure série et la courbe par mois (social.js, resumeExercice). Mutuels seulement.
CREATE FUNCTION public.social_series_exercice(p_user uuid, p_slug text)
RETURNS TABLE(session_id uuid, debut timestamptz, charge_kg numeric, reps integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT t.session_id, s.debut, t.charge_kg, t.reps
  FROM sets t JOIN sessions s ON s.id = t.session_id
  WHERE s.user_id = p_user AND t.exercise_slug = p_slug AND s.statut = 'terminee' AND s.visibilite <> 'private'
    AND s.debut >= date_trunc('month', now()) - interval '5 months'
    AND coalesce(t.type_serie,'travail') = 'travail' AND t.charge_kg > 0 AND t.reps > 0
    AND social_mutuel(auth.uid(), p_user)
  ORDER BY s.debut, t.rang $f$;

-- « Se comparer sur la période » : par exercice, puis une ligne de total (exercise_slug NULL). Séances = séances
-- avec au moins une série comptée. Période de 366 jours au plus. Mutuels seulement.
CREATE FUNCTION public.social_periode(p_user uuid, p_de date, p_a date)
RETURNS TABLE(exercise_slug text, seances integer, series integer, reps integer, tonnage_kg numeric, charge_max numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  WITH c AS (
    SELECT t.session_id, t.exercise_slug, t.charge_kg, t.reps
    FROM sets t JOIN sessions s ON s.id = t.session_id
    WHERE s.user_id = p_user AND s.statut = 'terminee' AND s.visibilite <> 'private'
      AND s.debut >= p_de AND s.debut < p_a + 1 AND (p_a - p_de) <= 366
      AND coalesce(t.type_serie,'travail') = 'travail' AND t.charge_kg > 0 AND t.reps > 0
      AND social_mutuel(auth.uid(), p_user))
  SELECT c.exercise_slug, count(DISTINCT c.session_id)::int, count(*)::int, sum(c.reps)::int,
         round(sum(c.charge_kg * c.reps), 2), max(c.charge_kg)
  FROM c GROUP BY GROUPING SETS ((c.exercise_slug), ())
  HAVING count(*) > 0 $f$;

-- « Entre amis » : les scores publiés pour un exercice — les miens et ceux de mes mutuels. Le score et la charge,
-- jamais le poids de corps (la table n'en a pas).
CREATE FUNCTION public.social_scores_force(p_slug text)
RETURNS TABLE(user_id uuid, pseudo text, score numeric, charge_kg numeric, moi boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT f.user_id, p.username, f.score, f.charge_kg, f.user_id = auth.uid()
  FROM scores_force f JOIN profiles p ON p.id = f.user_id
  WHERE f.exercise_slug = p_slug AND p.deleted_at IS NULL
    AND (f.user_id = auth.uid() OR social_mutuel(auth.uid(), f.user_id)) $f$;

REVOKE ALL ON FUNCTION public.social_exercices_ami(uuid), public.social_series_exercice(uuid,text),
  public.social_periode(uuid,date,date), public.social_scores_force(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_exercices_ami(uuid), public.social_series_exercice(uuid,text),
  public.social_periode(uuid,date,date), public.social_scores_force(text) TO authenticated;
REVOKE ALL ON TABLE public.scores_force FROM anon;

DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='scores_force') <> 1 THEN
    RAISE EXCEPTION 'post-contrôle : politique attendue 1 sur scores_force';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('sessions','sets','records')
             AND policyname NOT IN ('sessions_owner','sets_owner','records_ajout','records_lecture')) THEN
    RAISE EXCEPTION 'post-contrôle : politique inattendue sur sessions/sets/records';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scores_force'
             AND column_name NOT IN ('user_id','exercise_slug','score','charge_kg','maj_le')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne inattendue sur scores_force';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
             AND p.proname IN ('social_exercices_ami','social_series_exercice','social_periode','social_scores_force')
             AND (NOT p.prosecdef OR p.proconfig IS NULL
                  OR has_function_privilege('anon', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'post-contrôle : fonction sans SECURITY DEFINER, sans search_path, ou ouverte à anon';
  END IF;
  -- Les colonnes rendues (RETURNS TABLE) sont dans proargnames.
  IF EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS a(nom)
             WHERE p.pronamespace='public'::regnamespace
             AND p.proname IN ('social_exercices_ami','social_series_exercice','social_periode','social_scores_force')
             AND a.nom IN ('poids_corps_kg','note','rpe','ressenti','douleur')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite rendue';
  END IF;
END $$;
