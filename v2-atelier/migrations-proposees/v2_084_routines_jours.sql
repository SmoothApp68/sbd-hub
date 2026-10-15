-- v2_084 — les jours prévus d'une routine (15/10/2026, semaine qui déraille)
-- Une vraie case pour le jour, au lieu du préfixe du nom. 1 = lundi … 7 = dimanche. NULL = sans jour.
-- Remplie depuis le nom SEULEMENT quand il commence exactement par « <Jour> — » (préfixe écrit par le générateur).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='routines' AND column_name='jours') THEN
    RAISE EXCEPTION 'pré-contrôle : routines.jours existe déjà';
  END IF;
END $$;
ALTER TABLE public.routines ADD COLUMN jours smallint[]
  CHECK (jours IS NULL OR (cardinality(jours) BETWEEN 1 AND 7 AND jours <@ ARRAY[1,2,3,4,5,6,7]::smallint[]));
UPDATE public.routines r SET jours = ARRAY[j.n]::smallint[]
FROM (VALUES ('Lundi',1),('Mardi',2),('Mercredi',3),('Jeudi',4),('Vendredi',5),('Samedi',6),('Dimanche',7)) AS j(nom, n)
WHERE r.nom LIKE j.nom || ' — %';
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.routines WHERE jours IS NOT NULL;
  RAISE NOTICE 'routines avec un jour : %', n;
  IF EXISTS (SELECT 1 FROM public.routines WHERE jours IS NOT NULL AND nom NOT LIKE '% — %') THEN
    RAISE EXCEPTION 'post-contrôle : un jour posé sans préfixe';
  END IF;
END $$;
