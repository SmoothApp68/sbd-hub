-- 221 — Le bloc Hypertrophie (MOTEUR §19.2, amendement 221). APPLIQUÉE le 02/11/2026 par Claude.ai sous le nom v2_128_bloc_hypertrophie.
-- 1. blocs.zone accepte 'hypertrophie' ; 2. blocs.grosse_serie (la case « Garder une grosse série lourde »).
-- À vérifier avant : le nom réel du CHECK sur blocs.zone (relevé par la requête du pré-contrôle).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.blocs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%zone%' LOOP
    EXECUTE format('ALTER TABLE public.blocs DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.blocs ADD CONSTRAINT blocs_zone_ok CHECK (zone IN ('lourd','mix','hypertrophie'));
  ALTER TABLE public.blocs ADD COLUMN IF NOT EXISTS grosse_serie boolean NOT NULL DEFAULT false;
  ALTER TABLE public.blocs ADD CONSTRAINT blocs_grosse_serie_ok CHECK (NOT grosse_serie OR zone = 'hypertrophie');
END $$;
-- Post-contrôle : SELECT zone, grosse_serie, count(*) FROM public.blocs GROUP BY 1,2;  (les 2 blocs existants : false)
