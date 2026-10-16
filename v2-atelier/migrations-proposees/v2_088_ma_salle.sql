-- v2_088 — « Ma salle » : les barres fixes et les haltères de la salle (16/10/2026, prompt 108 ; MOTEUR §10 bis,
-- ECRAN-PROFIL §2.4 quinquies). Décidé le 15/10/2026 : « Seulement pour qui le déclare ; non renseigné, rien ne change. »
--
-- UNE colonne jsonb, NULL = non renseignée :
--   { "barres_ez": [10, 15, 20, 25, 30], "barres_droites": [10, 15, 20, 25, 30], "halteres": { "max": 40, "pas": 2 } }
--   barres : le poids de chaque barre fixe (1 à 100 kg, au demi-kilo, au plus 20 par liste) ;
--   halteres : null, ou le plus lourd PAR HALTÈRE (1 à 100 kg) et l'écart entre deux haltères (0,5 à 10 kg, ≤ max).
-- Pourquoi une colonne plutôt que quatre : la feuille « Ma salle » écrit la déclaration entière d'un coup (« Valider ») ;
-- tant que la migration n'est pas lancée, l'app la traite en colonne FACULTATIVE (une seule à retirer de la lecture et
-- de l'écriture, comme v2_086) ; la forme est imbriquée (deux listes et une plage), qu'une contrainte valide entière.
-- Les bornes sont doublées dans l'app (`THProfil.salleValide`) : un 23514 bloquerait l'envoi de tout le profil.
-- Aucune donnée existante n'est touchée ; aucune règle d'accès ne change (la colonne suit celles de `profiles`).
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NULL THEN RAISE EXCEPTION 'pré-contrôle : public.profiles n''existe pas'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='ma_salle') THEN
    RAISE EXCEPTION 'pré-contrôle : profiles.ma_salle existe déjà';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_ma_salle_ok') THEN
    RAISE EXCEPTION 'pré-contrôle : la contrainte profiles_ma_salle_ok existe déjà';
  END IF;
END $$;
ALTER TABLE public.profiles ADD COLUMN ma_salle jsonb;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_ma_salle_ok CHECK (
  ma_salle IS NULL OR (
    jsonb_typeof(ma_salle) = 'object'
    -- aucune autre clé que les trois
    AND (ma_salle - ARRAY['barres_ez', 'barres_droites', 'halteres']) = '{}'::jsonb
    -- les barres : une liste (ou absente) de nombres de 1 à 100, au demi-kilo, au plus 20
    AND jsonb_typeof(COALESCE(ma_salle->'barres_ez', '[]'::jsonb)) = 'array'
    AND jsonb_typeof(COALESCE(ma_salle->'barres_droites', '[]'::jsonb)) = 'array'
    AND jsonb_array_length(COALESCE(ma_salle->'barres_ez', '[]'::jsonb)) <= 20
    AND jsonb_array_length(COALESCE(ma_salle->'barres_droites', '[]'::jsonb)) <= 20
    AND NOT jsonb_path_exists(ma_salle,
      '$.barres_ez[*] ? (@.type() != "number" || @ < 1 || @ > 100 || (@ * 2).floor() != @ * 2)')
    AND NOT jsonb_path_exists(ma_salle,
      '$.barres_droites[*] ? (@.type() != "number" || @ < 1 || @ > 100 || (@ * 2).floor() != @ * 2)')
    -- les haltères : absents, null, ou { max, pas } — et rien d'autre
    AND (NOT (ma_salle ? 'halteres') OR jsonb_typeof(ma_salle->'halteres') = 'null' OR (
      jsonb_typeof(ma_salle->'halteres') = 'object'
      AND ((ma_salle->'halteres') - ARRAY['max', 'pas']) = '{}'::jsonb
      AND jsonb_path_exists(ma_salle,
        '$.halteres ? (@.max.type() == "number" && @.pas.type() == "number" && @.max >= 1 && @.max <= 100 && @.pas >= 0.5 && @.pas <= 10 && @.pas <= @.max && (@.max * 2).floor() == @.max * 2 && (@.pas * 2).floor() == @.pas * 2)')
    ))
  )
);
COMMENT ON COLUMN public.profiles.ma_salle IS
  'Ma salle (MOTEUR §10 bis, v2_088) : barres fixes EZ et droites (kg), haltères { max par haltère, pas }. NULL = non renseignée : rien ne change.';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'
                 AND column_name='ma_salle' AND data_type='jsonb' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'post-contrôle : profiles.ma_salle (jsonb, NULL permis) absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_ma_salle_ok' AND contype='c') THEN
    RAISE EXCEPTION 'post-contrôle : la contrainte profiles_ma_salle_ok manque';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE ma_salle IS NOT NULL) THEN
    RAISE EXCEPTION 'post-contrôle : une salle déclarée dès la migration';
  END IF;
END $$;
