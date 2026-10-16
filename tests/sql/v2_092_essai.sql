-- Essai de v2_092 sur Postgres local (chantier 118). PAS lancé par `npm test` : à jouer à la main, après un schéma de
-- bouchon (auth.users, profiles, sessions, sets, records…) et v2_080, v2_082, v2_087, puis v2_092. Chaque scénario
-- lève une exception s'il échoue ; tout se joue dans une transaction annulée à la fin.
BEGIN;
-- Les comptes : A (administrateur, le plus ancien), B, C ; D seul dans sa guilde ; E garde un récap d'avant v2_092.
INSERT INTO auth.users VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'), ('dddddddd-0000-0000-0000-000000000004'), ('eeeeeeee-0000-0000-0000-000000000005');
INSERT INTO profiles (id, username) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'alea'), ('bbbbbbbb-0000-0000-0000-000000000002', 'bea'),
  ('cccccccc-0000-0000-0000-000000000003', 'cea'), ('dddddddd-0000-0000-0000-000000000004', 'dea'), ('eeeeeeee-0000-0000-0000-000000000005', 'eea');

-- ── La guilde de A (A, puis B, puis C) et celle de D (D seul) ──
INSERT INTO guildes (id, nom, couleur, admin) VALUES ('11111111-0000-0000-0000-000000000001', 'Les Barres', '#b39ad1', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', 'Solo', '#8fb08a', 'dddddddd-0000-0000-0000-000000000004');
INSERT INTO guilde_membres (user_id, guilde_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
SELECT pg_sleep(0.01);
INSERT INTO guilde_membres (user_id, guilde_id) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001');
SELECT pg_sleep(0.01);
INSERT INTO guilde_membres (user_id, guilde_id) VALUES ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002');

-- ── Un groupe lancé par A, avec B : A et B ont une séance avec du travail ──
INSERT INTO sessions (id, user_id, statut, debut) VALUES ('5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'en_cours', now()),
  ('5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'en_cours', now());
INSERT INTO sets (id, session_id, user_id, exercise_slug, charge_kg, reps, type_serie, rang) VALUES
  (gen_random_uuid(), '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 100, 5, 'travail', 1),
  (gen_random_uuid(), '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'squat', 80, 5, 'travail', 1);
INSERT INTO groupes (id, createur) VALUES ('33333333-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO groupe_membres (groupe_id, user_id, session_id) VALUES ('33333333-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001');
INSERT INTO groupe_membres (groupe_id, user_id, session_id) VALUES ('33333333-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000002');
SELECT groupe_figer('33333333-0000-0000-0000-000000000003');
-- Un récap figé AVANT v2_092 (sans `uid`), chez E : A y est par son pseudo.
INSERT INTO groupe_recaps (user_id, groupe_id, session_id, le, recap) VALUES ('eeeeeeee-0000-0000-0000-000000000005',
  '44444444-0000-0000-0000-000000000004', gen_random_uuid(), now(),
  '{"membres":[{"pseudo":"alea","moi":false,"tonnage_kg":1000,"series":4,"records":1,"xp":30},{"pseudo":"eea","moi":true,"tonnage_kg":500,"series":3,"records":0,"xp":20}]}');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM groupe_recaps r, jsonb_array_elements(r.recap->'membres') e
                 WHERE r.user_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND e->>'uid' = 'aaaaaaaa-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'essai : le récap figé de B devrait porter l''identifiant de A';
  END IF;
  PERFORM set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  IF (SELECT recap::text FROM groupe_recap_seance('5b000000-0000-0000-0000-000000000002')) LIKE '%uid%' THEN
    RAISE EXCEPTION 'essai : groupe_recap_seance ne doit jamais rendre un identifiant';
  END IF;
END $$;

-- ── La suppression du compte de A, comme `delete_user_complete_data` : le profil, puis le compte ──
DELETE FROM sessions WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM auth.users WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Et D, par le compte seul (la cascade passe par `profiles`).
DELETE FROM auth.users WHERE id = 'dddddddd-0000-0000-0000-000000000004';

DO $$ DECLARE r jsonb; BEGIN
  IF (SELECT admin FROM guildes WHERE id = '11111111-0000-0000-0000-000000000001') IS DISTINCT FROM 'bbbbbbbb-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'essai : la guilde de A devait passer à B, le plus ancien membre';
  END IF;
  IF EXISTS (SELECT 1 FROM guildes WHERE id = '22222222-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'essai : la guilde de D, vide, devait disparaître';
  END IF;
  IF (SELECT createur FROM groupes WHERE id = '33333333-0000-0000-0000-000000000003') IS NOT NULL
     AND EXISTS (SELECT 1 FROM groupes WHERE id = '33333333-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'essai : le créateur du groupe devait passer à NULL';
  END IF;
  SELECT recap INTO r FROM groupe_recaps WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  IF r::text LIKE '%alea%' OR r::text LIKE '%aaaaaaaa%' OR NOT (r->'membres' @> '[{"pseudo": null, "ancien": true, "tonnage_kg": 500}]') THEN
    RAISE EXCEPTION 'essai : le récap de B garde A par son pseudo, son identifiant, ou perd ses chiffres : %', r;
  END IF;
  SELECT recap INTO r FROM groupe_recaps WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000005';
  IF r::text LIKE '%alea%' OR NOT (r->'membres' @> '[{"pseudo": null, "ancien": true, "tonnage_kg": 1000}, {"pseudo": "eea", "moi": true}]') THEN
    RAISE EXCEPTION 'essai : le récap d''avant v2_092 de E garde le pseudo de A : %', r;
  END IF;
  RAISE NOTICE 'essai v2_092 : tous les scénarios passent';
END $$;
ROLLBACK;
