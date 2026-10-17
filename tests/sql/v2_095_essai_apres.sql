-- Essai de v2_095 sur Postgres local (prompt 123), après `v2_095_essai_avant.sql` et v2_095 (voir son en-tête).
-- Chaque scénario lève une exception s'il échoue ; tout se joue dans une transaction annulée à la fin.
BEGIN;
DO $$ DECLARE refuse boolean; BEGIN
  -- Les lignes d'avant n'ont pas bougé (rien n'est réécrit).
  IF (SELECT ma_salle FROM public.profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001')
     <> '{"barres_ez":[10,15,20,25,30],"barres_droites":[],"halteres":{"max":40,"pas":2}}'::jsonb THEN
    RAISE EXCEPTION 'essai après : l''ancienne forme de A a changé';
  END IF;
  -- La salle d'Aurélien, par tranches : acceptée.
  UPDATE public.profiles SET ma_salle = '{"barres_ez":[10,15,20,25,30],"barres_droites":[10,15,20,25,30],"halteres":[{"jusqua":10,"pas":1},{"jusqua":40,"pas":2}]}'
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  -- L'ancienne forme reste acceptée (une tranche unique, écrite par l'app sous cette forme).
  UPDATE public.profiles SET ma_salle = '{"barres_ez":[],"barres_droites":[],"halteres":{"max":24,"pas":2.5}}'
   WHERE id = 'cccccccc-0000-0000-0000-000000000003';
  -- « Pas d'haltères » : null.
  UPDATE public.profiles SET ma_salle = '{"barres_ez":[10],"barres_droites":[],"halteres":null}'
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  -- Une tranche dont le pas dépasse sa longueur (10 → 11 de 2 en 2 : aucune charge) : refusée.
  refuse := false;
  BEGIN
    UPDATE public.profiles SET ma_salle = '{"halteres":[{"jusqua":10,"pas":1},{"jusqua":11,"pas":2}]}'
     WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  EXCEPTION WHEN check_violation THEN refuse := true;
  END;
  IF NOT refuse THEN RAISE EXCEPTION 'essai après : une tranche sans charge devrait être refusée'; END IF;
  -- Quatre tranches : refusées.
  refuse := false;
  BEGIN
    UPDATE public.profiles SET ma_salle = '{"halteres":[{"jusqua":5,"pas":1},{"jusqua":10,"pas":1},{"jusqua":20,"pas":2},{"jusqua":40,"pas":2}]}'
     WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  EXCEPTION WHEN check_violation THEN refuse := true;
  END;
  IF NOT refuse THEN RAISE EXCEPTION 'essai après : quatre tranches devraient être refusées'; END IF;
  -- Le texte de la contrainte se relit (un pg_dump se restaurerait).
  EXECUTE 'CREATE TEMP TABLE relu (ma_salle jsonb, CONSTRAINT relu_ok ' ||
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'profiles_ma_salle_ok') || ')';
END $$;
ROLLBACK;
