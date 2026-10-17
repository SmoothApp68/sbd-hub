-- Essai de v2_094 sur Postgres local (prompt 121) : les scénarios APRÈS v2_094. Chacun lève une exception s'il échoue ;
-- tout est annulé à la fin (ROLLBACK).
BEGIN;
DO $$
DECLARE pseudos text[];
BEGIN
  -- ── D5 : B (ne suit ni P ni X) voit au fil la séance de P (public), JAMAIS celle de X (privée) ; ni sa médaille.
  PERFORM set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
  SELECT array_agg(pseudo ORDER BY pseudo) INTO pseudos FROM guilde_fil();
  IF pseudos IS DISTINCT FROM ARRAY['alea', 'pub'] THEN RAISE EXCEPTION 'D5 : le fil de B devait être alea (mutuelle) et pub (public), pas %', pseudos; END IF;
  IF (SELECT count(*) FROM guilde_records_seance('58000000-0000-0000-0000-000000000004')) <> 0 THEN
    RAISE EXCEPTION 'D5 : B ne doit pas voir la médaille de X (privée, non suivie)';
  END IF;
  IF (SELECT count(*) FROM guilde_records_seance('59000000-0000-0000-0000-000000000003')) <> 1 THEN
    RAISE EXCEPTION 'D5 : B voit la médaille de P (public)';
  END IF;
  -- Une DEMANDE (pas acceptée) n'ouvre rien.
  IF EXISTS (SELECT 1 FROM guilde_fil() WHERE pseudo = 'xena') THEN RAISE EXCEPTION 'D5 : une demande n''ouvre pas le fil'; END IF;
  -- Les chiffres de la guilde comptent toujours X : la Progression de B la nomme (B ne la bloque pas), la semaine compte sa séance.
  IF NOT EXISTS (SELECT 1 FROM guilde_progression() WHERE pseudo = 'xena') THEN RAISE EXCEPTION 'D5 : la Progression reste un chiffre de guilde'; END IF;
  IF (SELECT seances FROM guilde_semaine()) IS DISTINCT FROM (SELECT count(*)::int FROM sessions s JOIN guilde_membres m ON m.user_id = s.user_id
       WHERE s.statut = 'terminee' AND (s.debut AT TIME ZONE 'Europe/Paris')::date >= guilde_semaine_courante()) THEN
    RAISE EXCEPTION 'D5 : « La guilde cette semaine » compte toujours chaque membre';
  END IF;
  -- X accepte B : B la suit — sa séance revient au fil.
  PERFORM set_config('test.uid', '', false);
  UPDATE abonnements SET statut = 'accepte' WHERE suiveur = 'bbbbbbbb-0000-0000-0000-000000000002' AND suivi = '88888888-0000-0000-0000-000000000004';
  PERFORM set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
  IF NOT EXISTS (SELECT 1 FROM guilde_fil() WHERE pseudo = 'xena') THEN RAISE EXCEPTION 'D5 : abonnée acceptée, B voit X'; END IF;

  -- ── 05 #6 : A a bloqué X. A voit X comme « un membre » (sans pseudo, rang, titre), pas au fil, pas en Progression.
  PERFORM set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  IF (SELECT count(*) FROM guilde_liste_membres()) <> 4 THEN RAISE EXCEPTION '#6 : quatre membres, toujours'; END IF;
  IF EXISTS (SELECT 1 FROM guilde_liste_membres() WHERE pseudo = 'xena' OR (pseudo IS NULL AND (rang IS NOT NULL OR titre IS NOT NULL))) THEN
    RAISE EXCEPTION '#6 : X doit être anonyme pour A';
  END IF;
  IF (SELECT count(*) FROM guilde_liste_membres() WHERE pseudo IS NULL AND user_id = '88888888-0000-0000-0000-000000000004') <> 1 THEN
    RAISE EXCEPTION '#6 : son identifiant reste (Retirer, Transmettre)';
  END IF;
  IF EXISTS (SELECT 1 FROM guilde_fil() WHERE pseudo = 'xena') THEN RAISE EXCEPTION '#6 : X hors du fil de A'; END IF;
  IF EXISTS (SELECT 1 FROM guilde_progression() WHERE pseudo = 'xena') THEN RAISE EXCEPTION '#6 : X hors de la Progression de A'; END IF;
  IF NOT EXISTS (SELECT 1 FROM guilde_progression() WHERE moi) THEN RAISE EXCEPTION '#6 : ma ligne reste'; END IF;
  -- Et dans l'autre sens : X voit A comme « un membre ».
  PERFORM set_config('test.uid', '88888888-0000-0000-0000-000000000004', false);
  IF EXISTS (SELECT 1 FROM guilde_liste_membres() WHERE pseudo = 'alea') OR EXISTS (SELECT 1 FROM guilde_progression() WHERE pseudo = 'alea') THEN
    RAISE EXCEPTION '#6 : A anonyme pour X aussi (le blocage vaut dans les deux sens)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM guilde_liste_membres() WHERE pseudo = 'bea') THEN RAISE EXCEPTION '#6 : B reste nommée pour X'; END IF;

  -- ── 05 #6 : B (mutuelle de D) ne peut pas inviter D, que A a bloquée.
  PERFORM set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
  BEGIN
    PERFORM guilde_inviter('dddddddd-0000-0000-0000-000000000005');
    RAISE EXCEPTION '#6 : l''invitation de D aurait dû être refusée';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'guilde_bloque' THEN RAISE EXCEPTION '#6 : refus attendu guilde_bloque, pas %', SQLERRM; END IF;
  END;
  -- Une invitation posée AVANT le blocage (insérée à la main, déclencheur coupé) : tue, et refusée à l'entrée.
  PERFORM set_config('test.uid', '', false);
  ALTER TABLE guilde_invitations DISABLE TRIGGER guilde_invitations_avant_ajout;
  INSERT INTO guilde_invitations (guilde_id, invite, invitant) VALUES ('11111111-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000002');
  ALTER TABLE guilde_invitations ENABLE TRIGGER guilde_invitations_avant_ajout;
  PERFORM set_config('test.uid', 'dddddddd-0000-0000-0000-000000000005', false);
  IF EXISTS (SELECT 1 FROM guilde_invitations_recues()) THEN RAISE EXCEPTION '#6 : l''invitation de D doit être tue'; END IF;
  BEGIN
    PERFORM guilde_repondre('11111111-0000-0000-0000-000000000001', true);
    RAISE EXCEPTION '#6 : D n''aurait pas dû entrer';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'guilde_bloque' THEN RAISE EXCEPTION '#6 : refus attendu guilde_bloque à l''entrée, pas %', SQLERRM; END IF;
  END;
  -- A débloque D : B peut l'inviter, D peut entrer.
  PERFORM set_config('test.uid', '', false);
  DELETE FROM blocages WHERE bloqueur = 'aaaaaaaa-0000-0000-0000-000000000001' AND bloque = 'dddddddd-0000-0000-0000-000000000005';
  PERFORM set_config('test.uid', 'dddddddd-0000-0000-0000-000000000005', false);
  IF NOT EXISTS (SELECT 1 FROM guilde_invitations_recues()) THEN RAISE EXCEPTION '#6 : débloquée, l''invitation revient'; END IF;
  PERFORM guilde_repondre('11111111-0000-0000-0000-000000000001', true);
  IF guilde_de('dddddddd-0000-0000-0000-000000000005') IS DISTINCT FROM '11111111-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION '#6 : débloquée, D entre';
  END IF;
  -- Créer une guilde (personne d'autre dedans) : jamais refusé par le blocage.
  PERFORM set_config('test.uid', '88888888-0000-0000-0000-000000000004', false);
  PERFORM guilde_quitter();
  PERFORM guilde_creer('Solo X', '#8fb08a');
  PERFORM set_config('test.uid', '', false);
  RAISE NOTICE 'v2_094 : tous les scénarios passent';
END $$;
ROLLBACK;
