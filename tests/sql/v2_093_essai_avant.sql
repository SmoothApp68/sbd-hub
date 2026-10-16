-- Essai de v2_093 sur Postgres local (prompt 120). PAS lancé par `npm test` : à jouer à la main, dans cet ordre —
--   1. un schéma de bouchon (auth.users, profiles, sessions, sets, records…) puis v2_080, v2_082, v2_083, v2_087, v2_092 ;
--   2. CE FICHIER (le décor d'avant v2_093, validé : v2_093 doit le trouver en base) ;
--   3. v2_093 ;
--   4. `v2_093_essai_apres.sql` (les scénarios ; chacun lève une exception s'il échoue ; annulé à la fin).
-- Les comptes : A (administrateur de G1, avec B) ; C seul dans G2 ; D sans guilde.
INSERT INTO auth.users VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'), ('dddddddd-0000-0000-0000-000000000004');
INSERT INTO profiles (id, username) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'alea'), ('bbbbbbbb-0000-0000-0000-000000000002', 'bea'),
  ('cccccccc-0000-0000-0000-000000000003', 'cea'), ('dddddddd-0000-0000-0000-000000000004', 'dea');

-- G1 : sa semaine est LANCÉE (A y a terminé une séance après la création de la guilde), sans défi choisi — elle court
-- le défaut d'avant v2_093 (« seances »). G2 : rien cette semaine (le nouveau défaut s'y applique).
INSERT INTO guildes (id, nom, couleur, admin, cree_le) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Les Barres', '#b39ad1', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 minute'),
  ('22222222-0000-0000-0000-000000000002', 'Solo', '#8fb08a', 'cccccccc-0000-0000-0000-000000000003', now() - interval '1 minute');
INSERT INTO guilde_membres (user_id, guilde_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
INSERT INTO guilde_membres (user_id, guilde_id) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001');
INSERT INTO guilde_membres (user_id, guilde_id) VALUES ('cccccccc-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002');
INSERT INTO sessions (id, user_id, statut, debut, fin, visibilite) VALUES
  ('5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'terminee', now(), now(), 'mutuels');
INSERT INTO sets (id, session_id, user_id, exercise_slug, charge_kg, reps, type_serie, rang) VALUES
  ('5a000001-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 100, 10, 'travail', 1),
  ('5a000002-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 140, 5, 'travail', 2);
-- D1 — la séance de groupe de A (en cours : on ne rejoint un groupe qu'avec une séance ouverte) : la série 1 n'est
-- médaillée QUE par la force estimée (le faux record de l'audit, 05 #2) ; la série 2 par une vraie barre ET l'estimation.
INSERT INTO sessions (id, user_id, statut, debut, visibilite) VALUES
  ('5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'en_cours', now(), 'mutuels'),
  ('5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'en_cours', now(), 'mutuels');
INSERT INTO sets (id, session_id, user_id, exercise_slug, charge_kg, reps, type_serie, rang) VALUES
  ('5a00000a-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 100, 10, 'travail', 1),
  ('5a00000a-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 140, 5, 'travail', 2);
INSERT INTO records (set_id, session_id, user_id, exercise_slug, type, valeur) VALUES
  ('5a00000a-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 'un_rm_estime', 133.3),
  ('5a00000a-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 'charge_max', 140),
  ('5a00000a-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 'un_rm_estime', 163.3);
INSERT INTO groupes (id, createur) VALUES ('33333333-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO groupe_membres (groupe_id, user_id, session_id) VALUES
  ('33333333-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-00000000000a'),
  ('33333333-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000002');

DO $$ BEGIN
  IF NOT guilde_semaine_lancee('11111111-0000-0000-0000-000000000001') OR guilde_semaine_lancee('22222222-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'décor : G1 doit être lancée, G2 non';
  END IF;
  IF (SELECT records FROM groupe_recap_de('33333333-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001')
      WHERE moi) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'décor : avant v2_093, le récap compte 2 séries médaillées (dont la seule estimation)';
  END IF;
  PERFORM set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  IF (SELECT defi FROM guilde_semaine()) IS DISTINCT FROM 'seances' THEN RAISE EXCEPTION 'décor : le défaut d''avant est « seances »'; END IF;
  PERFORM set_config('test.uid', '', false);
END $$;
