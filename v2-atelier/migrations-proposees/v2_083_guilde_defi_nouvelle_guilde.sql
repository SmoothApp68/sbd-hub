-- v2_083 — une guilde créée en cours de semaine peut choisir son défi (14/10/2026, test sur téléphone d'Aurélien).
-- Défaut de v2_081 : les séances terminées AVANT la création de la guilde figeaient déjà le défi ; la guilde
-- « Les gros muscles », créée mercredi, ne pouvait jamais choisir. Une semaine n'est lancée que par une séance
-- terminée après la création de la guilde.
DO $$ BEGIN IF to_regprocedure('public.guilde_semaine_lancee(uuid)') IS NULL THEN RAISE EXCEPTION 'pré-contrôle : v2_081 absente'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.guilde_semaine_lancee(p_guilde uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM sessions s JOIN guilde_membres m ON m.user_id = s.user_id JOIN guildes g ON g.id = m.guilde_id
                 WHERE m.guilde_id = p_guilde AND s.statut = 'terminee'
                   AND (s.debut AT TIME ZONE 'Europe/Paris')::date >= guilde_semaine_courante()
                   AND (s.debut AT TIME ZONE 'Europe/Paris')::date < guilde_semaine_courante() + 7
                   AND coalesce(s.fin, s.debut) > g.cree_le) $f$;
REVOKE ALL ON FUNCTION public.guilde_semaine_lancee(uuid) FROM PUBLIC, anon;
