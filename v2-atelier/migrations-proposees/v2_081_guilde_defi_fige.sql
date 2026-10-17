-- v2_081 — le défi de la guilde est figé une fois la semaine lancée (Aurélien, 14/10/2026). Delta de v2_080 déjà lancée.
DO $$ BEGIN IF to_regprocedure('public.guilde_semaine_lancee(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'pré-contrôle : déjà appliquée'; END IF; END $$;
CREATE FUNCTION public.guilde_semaine_lancee(p_guilde uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM sessions s JOIN guilde_membres m ON m.user_id = s.user_id
                 WHERE m.guilde_id = p_guilde AND s.statut = 'terminee'
                   AND (s.debut AT TIME ZONE 'Europe/Paris')::date >= guilde_semaine_courante()
                   AND (s.debut AT TIME ZONE 'Europe/Paris')::date < guilde_semaine_courante() + 7) $f$;
DROP FUNCTION public.guilde_choisir_defi(text, integer);
CREATE FUNCTION public.guilde_choisir_defi(p_type text, p_n integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid;
BEGIN
  SELECT id INTO g FROM guildes WHERE admin = auth.uid();
  IF g IS NULL THEN RAISE EXCEPTION 'guilde_pas_admin' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF guilde_semaine_lancee(g) THEN RAISE EXCEPTION 'guilde_defi_fige' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO guilde_defis (guilde_id, semaine, type, n) VALUES (g, guilde_semaine_courante(), p_type, p_n)
    ON CONFLICT (guilde_id, semaine) DO UPDATE SET type = EXCLUDED.type, n = EXCLUDED.n, choisi_le = now();
END $f$;
DROP FUNCTION public.guilde_semaine();
CREATE FUNCTION public.guilde_semaine()
RETURNS TABLE(semaine date, defi text, n integer, defi_modifiable boolean, seances_faites integer, seances_prevues integer, records_semaine integer,
              exercices integer, seances integer, medailles integer, tonnage_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  WITH g AS (SELECT guilde_de(auth.uid()) AS id, guilde_semaine_courante() AS lundi),
  m AS (SELECT gm.user_id FROM guilde_membres gm, g WHERE gm.guilde_id = g.id),
  s AS (SELECT se.id FROM sessions se, g WHERE se.user_id IN (SELECT user_id FROM m) AND se.statut = 'terminee'
          AND se.visibilite <> 'private' AND (se.debut AT TIME ZONE 'Europe/Paris')::date >= g.lundi
          AND (se.debut AT TIME ZONE 'Europe/Paris')::date < g.lundi + 7
          AND EXISTS (SELECT 1 FROM sets t WHERE t.session_id = se.id AND coalesce(t.type_serie,'travail') = 'travail')),
  sc AS (SELECT x.* FROM guilde_scores x, g WHERE x.user_id IN (SELECT user_id FROM m) AND x.semaine = g.lundi)
  SELECT g.lundi, coalesce(d.type, 'seances'), d.n, NOT guilde_semaine_lancee(g.id),
    (SELECT coalesce(sum(least(seances, prevues)), 0)::int FROM sc),
    (SELECT coalesce(sum(prevues), 0)::int FROM sc),
    (SELECT coalesce(sum(records_semaine), 0)::int FROM sc),
    (SELECT count(DISTINCT t.exercise_slug)::int FROM sets t WHERE t.session_id IN (SELECT id FROM s)
       AND coalesce(t.type_serie,'travail') = 'travail'),
    (SELECT count(*)::int FROM s),
    (SELECT count(DISTINCT r.set_id)::int FROM records r WHERE r.session_id IN (SELECT id FROM s)
       AND r.type IN ('charge_a_reps','reps_a_charge','charge_max','cap','duree_s','distance_m')),
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t WHERE t.session_id IN (SELECT id FROM s)
       AND coalesce(t.type_serie,'travail') = 'travail' AND t.charge_kg > 0 AND t.reps > 0)
  FROM g LEFT JOIN guilde_defis d ON d.guilde_id = g.id AND d.semaine = g.lundi
  WHERE g.id IS NOT NULL $f$;

-- La progression du mois : les nombres publiés pour le mois en cours (remise à zéro le 1er : un mois passé ne sort plus).
REVOKE ALL ON FUNCTION public.guilde_semaine_lancee(uuid), public.guilde_choisir_defi(text,integer), public.guilde_semaine() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilde_choisir_defi(text,integer), public.guilde_semaine() TO authenticated;
DO $$ BEGIN IF has_function_privilege('anon','public.guilde_semaine()','EXECUTE') THEN RAISE EXCEPTION 'post-contrôle : anon'; END IF; END $$;
