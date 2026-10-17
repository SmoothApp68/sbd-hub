-- v2_095 — « Ma salle » : les haltères par tranches (prompt 123, 16/10/2026 ; MOTEUR §10 bis, ECRAN-PROFIL §2.4 quinquies ;
-- audit du 16/10, 03 #7). Demande d'Aurélien, mot pour mot : « Ok ma salle, par contre pour les petites haltères de 1
-- à 10 c'est de 1 en 1 ». Sa salle (Basic-Fit) : de 1 en 1 jusqu'à 10 kg, puis de 2 en 2 jusqu'à 40 kg.
-- PROPOSÉE par Claude Code : Claude.ai la relit et la lance (après v2_088, déjà en base).
--
-- `profiles.ma_salle.halteres` accepte DEUX formes :
--   · l'ancienne, inchangée : `{ "max": 40, "pas": 2 }` — une tranche unique, de 0 à `max` ;
--   · la nouvelle : une liste de 1 à 3 tranches, `[{ "jusqua": 10, "pas": 1 }, { "jusqua": 40, "pas": 2 }]` — chaque
--     tranche donne les multiples de son pas, de la fin de la précédente (exclue ; 0 pour la première) à son « jusqu'à »
--     (inclus). Bornes : `jusqua` de 1 à 100 kg, `pas` de 0,5 à 10 kg, au demi-kilo ; des « jusqu'à » croissants, et
--     chaque pas au plus égal à la longueur de sa tranche (il y a toujours au moins une charge dedans) — comme
--     `pas <= max` pour l'ancienne forme. Rien d'autre (aucune autre clé, ni liste vide : « Pas d'haltères » s'écrit
--     `null` ou sans la clé, comme aujourd'hui).
-- L'app de 123 écrit l'ancienne forme pour une tranche unique (lue par toutes les apps en circulation), la nouvelle
-- seulement à partir de deux tranches. Elle marche AVANT la migration : une salle à deux tranches est refusée par la
-- contrainte actuelle (23514), la colonne sort de l'envoi (le mécanisme du prompt 116), la salle d'avant est gardée et
-- le Profil le dit (« Pas enregistré : Ma salle. »). Aucune donnée existante n'est réécrite.
--
-- Le texte de la contrainte : celui de v2_088, relevé en base le 17/10/2026 (`pg_get_constraintdef`), à deux
-- différences près — la branche « liste de tranches », et le demi-kilo écrit `@ % 0.5 != 0` au lieu de
-- `(@ * 2).floor() != @ * 2`. Même sens (essayé sur Postgres 16), mais le texte que Postgres rend de l'ancienne forme
-- (`@ * 2.floor()`) n'est pas relisible : « trailing junk after numeric literal » — un `pg_dump` de `profiles` ne se
-- restaurerait pas. Le post-contrôle le vérifie : il recrée la contrainte EN BASE depuis son propre texte, sur une
-- table temporaire, et y essaie les deux formes.
--
-- Aucune politique d'accès n'est touchée (la colonne suit celles de `profiles`) ; aucune ligne n'est écrite.
--
-- ESSAI À BLANC : remplacer le COMMIT final par ROLLBACK — les pré et post-contrôles lèvent une exception si quelque
-- chose ne va pas. Essayée sur Postgres 16 local : `tests/sql/v2_095_essai.sql` (bouchon `profiles`, v2_088, v2_095).

BEGIN;

DO $$ DECLARE d text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'
                 AND column_name='ma_salle' AND data_type='jsonb') THEN
    RAISE EXCEPTION 'pré-contrôle : profiles.ma_salle (jsonb) absente — lancer v2_088 d''abord';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO d FROM pg_constraint c
   WHERE c.conname = 'profiles_ma_salle_ok' AND c.conrelid = 'public.profiles'::regclass AND c.contype = 'c';
  IF d IS NULL THEN RAISE EXCEPTION 'pré-contrôle : la contrainte profiles_ma_salle_ok manque'; END IF;
  -- Celle de v2_088 : les haltères { max, pas }, pas encore les tranches.
  IF position('"max"' IN d) = 0 OR position('"pas"' IN d) = 0 OR position('jusqua' IN d) > 0 THEN
    RAISE EXCEPTION 'pré-contrôle : profiles_ma_salle_ok n''est pas celle de v2_088 : %', d;
  END IF;
END $$;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_ma_salle_ok;
-- ADD CONSTRAINT valide toutes les lignes existantes : la nouvelle contrainte accepte tout ce que l'ancienne acceptait.
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
      '$.barres_ez[*] ? (@.type() != "number" || @ < 1 || @ > 100 || @ % 0.5 != 0)')
    AND NOT jsonb_path_exists(ma_salle,
      '$.barres_droites[*] ? (@.type() != "number" || @ < 1 || @ > 100 || @ % 0.5 != 0)')
    -- les haltères : absents, null, { max, pas } (v2_088), ou une liste de 1 à 3 tranches { jusqua, pas } (v2_095)
    AND (NOT (ma_salle ? 'halteres') OR jsonb_typeof(ma_salle->'halteres') = 'null' OR (
      jsonb_typeof(ma_salle->'halteres') = 'object'
      AND ((ma_salle->'halteres') - ARRAY['max', 'pas']) = '{}'::jsonb
      AND jsonb_path_exists(ma_salle,
        '$.halteres ? (@.max.type() == "number" && @.pas.type() == "number" && @.max >= 1 && @.max <= 100 && @.pas >= 0.5 && @.pas <= 10 && @.pas <= @.max && @.max % 0.5 == 0 && @.pas % 0.5 == 0)')
    ) OR (
      jsonb_typeof(ma_salle->'halteres') = 'array'
      AND jsonb_array_length(ma_salle->'halteres') BETWEEN 1 AND 3
      -- chaque tranche : un objet aux seules clés jusqua et pas, deux nombres dans leurs bornes, au demi-kilo
      AND NOT jsonb_path_exists(ma_salle, '$.halteres[*] ? (@.type() != "object")')
      AND NOT jsonb_path_exists(ma_salle, 'strict $.halteres[*].keyvalue() ? (@.key != "jusqua" && @.key != "pas")')
      AND NOT jsonb_path_exists(ma_salle,
        'lax $.halteres[*] ? (!(@.jusqua.type() == "number" && @.pas.type() == "number" && @.jusqua >= 1 && @.jusqua <= 100 && @.pas >= 0.5 && @.pas <= 10 && @.jusqua % 0.5 == 0 && @.pas % 0.5 == 0))')
      -- des « jusqu'à » croissants ; chaque pas au plus la longueur de sa tranche (la première part de 0)
      AND jsonb_path_exists(ma_salle,
        'strict $.halteres ? (@[0].pas <= @[0].jusqua && (@.size() < 2 || (@[1].jusqua > @[0].jusqua && @[1].jusqua - @[0].jusqua >= @[1].pas)) && (@.size() < 3 || (@[2].jusqua > @[1].jusqua && @[2].jusqua - @[1].jusqua >= @[2].pas)))')
    ))
  )
);
COMMENT ON COLUMN public.profiles.ma_salle IS
  'Ma salle (MOTEUR §10 bis, v2_088, v2_095) : barres fixes EZ et droites (kg), haltères { max, pas } ou 1 à 3 tranches [{ jusqua, pas }] (par haltère). NULL = non renseignée : rien ne change.';

-- POST-CONTRÔLES : la contrainte est là, elle parle des tranches, et son texte TEL QUE LA BASE LE REND se relit : il
-- est recréé sur une table temporaire (supprimée à la fin de la transaction), où les deux formes sont essayées.
DO $$ DECLARE d text; v jsonb; ok boolean; BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO d FROM pg_constraint c
   WHERE c.conname = 'profiles_ma_salle_ok' AND c.conrelid = 'public.profiles'::regclass AND c.contype = 'c';
  IF d IS NULL OR position('jusqua' IN d) = 0 THEN
    RAISE EXCEPTION 'post-contrôle : profiles_ma_salle_ok sans les tranches';
  END IF;
  CREATE TEMP TABLE v2_095_essai (ma_salle jsonb) ON COMMIT DROP;
  EXECUTE 'ALTER TABLE v2_095_essai ADD CONSTRAINT v2_095_essai_ok ' || d;   -- échoue si le texte ne se relit pas
  -- Acceptées : NULL, l'ancienne forme, la salle d'Aurélien, une tranche, trois tranches, sans haltères.
  FOREACH v IN ARRAY ARRAY[
    NULL,
    '{"barres_ez":[10,15,20,25,30],"barres_droites":[],"halteres":{"max":40,"pas":2}}',
    '{"barres_ez":[10,15,20,25,30],"barres_droites":[10,15,20,25,30],"halteres":[{"jusqua":10,"pas":1},{"jusqua":40,"pas":2}]}',
    '{"halteres":[{"jusqua":40,"pas":2}]}',
    '{"halteres":[{"jusqua":10,"pas":1},{"jusqua":20,"pas":2},{"jusqua":50,"pas":2.5}]}',
    '{"barres_ez":[12.5],"halteres":null}',
    '{"barres_droites":[10]}'
  ]::jsonb[] LOOP
    INSERT INTO v2_095_essai VALUES (v);
  END LOOP;
  -- Refusées : chacune seule.
  FOREACH v IN ARRAY ARRAY[
    '{"halteres":[]}',
    '{"halteres":[{"jusqua":10,"pas":1},{"jusqua":20,"pas":1},{"jusqua":30,"pas":1},{"jusqua":40,"pas":1}]}',
    '{"halteres":[{"jusqua":40,"pas":2},{"jusqua":10,"pas":1}]}',
    '{"halteres":[{"jusqua":10,"pas":1},{"jusqua":10,"pas":1}]}',
    '{"halteres":[{"jusqua":10,"pas":1},{"jusqua":11,"pas":2}]}',
    '{"halteres":[{"jusqua":4,"pas":5}]}',
    '{"halteres":[{"jusqua":10.3,"pas":1}]}',
    '{"halteres":[{"jusqua":10,"pas":0.25}]}',
    '{"halteres":[{"jusqua":101,"pas":2}]}',
    '{"halteres":[{"jusqua":"10","pas":1}]}',
    '{"halteres":[{"jusqua":[10],"pas":1}]}',
    '{"halteres":[{"jusqua":10}]}',
    '{"halteres":[{"jusqua":10,"pas":1,"x":1}]}',
    '{"halteres":[10, 40]}',
    '{"halteres":{"max":40}}',
    '{"halteres":{"max":40,"pas":2,"jusqua":10}}',
    '{"halteres":{"max":40.3,"pas":2}}',
    '{"barres_ez":[10.3]}',
    '{"barres_ez":[0]}',
    '{"salle":1}'
  ]::jsonb[] LOOP
    ok := true;
    BEGIN
      INSERT INTO v2_095_essai VALUES (v);
    EXCEPTION WHEN check_violation THEN ok := false;
    END;
    IF ok THEN RAISE EXCEPTION 'post-contrôle : % devrait être refusée', v; END IF;
  END LOOP;
  -- Aucune ligne existante n'a changé de forme (rien n'est réécrit) : aucune tranche en base dès la migration.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE jsonb_typeof(ma_salle->'halteres') = 'array') THEN
    RAISE EXCEPTION 'post-contrôle : une salle par tranches dès la migration';
  END IF;
END $$;

COMMIT;
