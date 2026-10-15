-- v2_085 — le choix fait pour une séance manquée suit la personne d'un appareil à l'autre (15/10/2026, MOTEUR §9.24)
DO $$ BEGIN
  IF to_regclass('public.semaine_choix') IS NOT NULL THEN RAISE EXCEPTION 'pré-contrôle : semaine_choix existe déjà'; END IF;
END $$;
CREATE TABLE public.semaine_choix (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semaine    date NOT NULL CHECK (extract(isodow FROM semaine) = 1),   -- le lundi de la semaine
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  choix      text NOT NULL CHECK (choix IN ('decaler','repartir','garder','ajouter','non')),
  detail     jsonb,
  cree_le    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, semaine, routine_id)
);
ALTER TABLE public.semaine_choix ENABLE ROW LEVEL SECURITY;
CREATE POLICY semaine_choix_miens ON public.semaine_choix FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON TABLE public.semaine_choix FROM anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='semaine_choix') <> 1 THEN
    RAISE EXCEPTION 'post-contrôle : une politique attendue';
  END IF;
END $$;
