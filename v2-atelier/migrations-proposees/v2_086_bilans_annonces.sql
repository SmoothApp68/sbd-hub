-- v2_086 — l'annonce d'un bilan (année, saison, mois) ne revient pas sur un autre appareil (16/10/2026, prompt 104)
-- Liste des périodes déjà annoncées : '2026', '2026-ete', '2026-09'… Écrite par l'app (CHAMPS_ECRITS du profil).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='bilans_annonces') THEN
    RAISE EXCEPTION 'pré-contrôle : profiles.bilans_annonces existe déjà';
  END IF;
END $$;
ALTER TABLE public.profiles ADD COLUMN bilans_annonces text[] NOT NULL DEFAULT '{}'::text[]
  CHECK (cardinality(bilans_annonces) <= 200);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE bilans_annonces IS NULL) THEN RAISE EXCEPTION 'post-contrôle'; END IF;
END $$;
