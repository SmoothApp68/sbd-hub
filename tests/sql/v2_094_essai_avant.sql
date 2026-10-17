-- Essai de v2_094 sur Postgres local (prompt 121) : le décor d'avant v2_094 (ordre : voir `v2_094_bouchon.sql`).
-- Une guilde G : A (administratrice, compte privé), B (compte privé), P (compte PUBLIC), X (compte privé, bloqué par A).
-- Les abonnements : A et B mutuels ; A suit P (accepté) ; B ne suit ni P ni X ; personne ne suit X. D (hors guilde) est
-- mutuel de B, et A l'a bloquée : B ne doit pas pouvoir l'inviter.
INSERT INTO auth.users VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('99999999-0000-0000-0000-000000000003'), ('88888888-0000-0000-0000-000000000004'), ('dddddddd-0000-0000-0000-000000000005');
INSERT INTO profiles (id, username, compte_prive, jeu_titre) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alea', true, 'athlete'), ('bbbbbbbb-0000-0000-0000-000000000002', 'bea', true, null),
  ('99999999-0000-0000-0000-000000000003', 'pub', false, null), ('88888888-0000-0000-0000-000000000004', 'xena', true, 'athlete'),
  ('dddddddd-0000-0000-0000-000000000005', 'dea', true, null);
INSERT INTO abonnements (suiveur, suivi, statut) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'accepte'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'accepte'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000003', 'accepte'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000005', 'accepte'),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000002', 'accepte'),
  -- B a demandé à suivre X (privé) : une demande, pas un abonnement.
  ('bbbbbbbb-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000004', 'demande');
INSERT INTO guildes (id, nom, couleur, admin) VALUES ('11111111-0000-0000-0000-000000000001', 'Les Barres', '#b39ad1', 'aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO guilde_membres (user_id, guilde_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001'),
  ('88888888-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001');
-- A bloque X APRÈS leur entrée (deux personnes qui se bloquent, déjà dans la même guilde) ; A bloque D.
INSERT INTO blocages VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000004'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000005');
-- Une séance terminée chacun (A, P, X), une série et un record chacune.
INSERT INTO sessions (id, user_id, statut, debut, fin, titre, visibilite) VALUES
  ('5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'terminee', now() - interval '1 day', now() - interval '1 day', 'Dos A', 'mutuels'),
  ('59000000-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000003', 'terminee', now() - interval '1 day', now() - interval '1 day', 'Bas P', 'mutuels'),
  ('58000000-0000-0000-0000-000000000004', '88888888-0000-0000-0000-000000000004', 'terminee', now() - interval '1 day', now() - interval '1 day', 'Haut X', 'mutuels');
INSERT INTO sets (id, session_id, user_id, exercise_slug, charge_kg, reps, type_serie, rang) VALUES
  ('5a000001-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 100, 5, 'travail', 1),
  ('59000001-0000-0000-0000-000000000003', '59000000-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000003', 'squat', 120, 5, 'travail', 1),
  ('58000001-0000-0000-0000-000000000004', '58000000-0000-0000-0000-000000000004', '88888888-0000-0000-0000-000000000004', 'squat', 90, 5, 'travail', 1);
INSERT INTO records (set_id, session_id, user_id, exercise_slug, type, valeur) VALUES
  ('5a000001-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'squat', 'charge_max', 100),
  ('59000001-0000-0000-0000-000000000003', '59000000-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000003', 'squat', 'charge_max', 120),
  ('58000001-0000-0000-0000-000000000004', '58000000-0000-0000-0000-000000000004', '88888888-0000-0000-0000-000000000004', 'squat', 'charge_max', 90);
-- Les nombres publiés du mois (la Progression) : chacun.
INSERT INTO guilde_scores (user_id, semaine, seances, prevues, records_semaine, mois, exercices, exercices_record)
  SELECT u, guilde_semaine_courante(), 1, 3, 1, guilde_mois_courant(), 2, 1 FROM unnest(ARRAY[
    'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
    '99999999-0000-0000-0000-000000000003', '88888888-0000-0000-0000-000000000004']::uuid[]) AS u;

-- Le défaut, AVANT v2_094 (05 #7) : B voit les séances de X (privée, que B ne suit pas) dans le fil de la guilde, et ses
-- médailles ; A voit X nommée dans les Membres et la Progression (05 #6).
DO $$ BEGIN
  PERFORM set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
  IF NOT EXISTS (SELECT 1 FROM guilde_fil() WHERE pseudo = 'xena') THEN RAISE EXCEPTION 'décor : avant v2_094, B voit X au fil'; END IF;
  IF (SELECT count(*) FROM guilde_records_seance('58000000-0000-0000-0000-000000000004')) <> 1 THEN
    RAISE EXCEPTION 'décor : avant v2_094, B voit la médaille de X';
  END IF;
  PERFORM set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  IF NOT EXISTS (SELECT 1 FROM guilde_liste_membres() WHERE pseudo = 'xena') THEN RAISE EXCEPTION 'décor : avant v2_094, A voit xena aux Membres'; END IF;
  IF NOT EXISTS (SELECT 1 FROM guilde_progression() WHERE pseudo = 'xena') THEN RAISE EXCEPTION 'décor : avant v2_094, A voit xena en Progression'; END IF;
  PERFORM set_config('test.uid', '', false);
END $$;
