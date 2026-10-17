-- Essai de v2_093, après la migration (voir `v2_093_essai_avant.sql` pour l'ordre). Annulé à la fin.
BEGIN;
DO $$ DECLARE s record; BEGIN
  -- D1 — le récap du groupe ne compte plus la série que seule l'estimation médaillait.
  IF (SELECT records FROM groupe_recap_de('33333333-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001')
      WHERE moi) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'essai D1 : le récap doit compter 1 série médaillée (la vraie barre), pas 2';
  END IF;
  -- Les lignes d'avant restent (immuables).
  IF (SELECT count(*) FROM records WHERE type = 'un_rm_estime') <> 2 THEN RAISE EXCEPTION 'essai D1 : les lignes d''avant restent'; END IF;

  -- D3 — le défi en cours de G1 (lancée) reste « seances » : une ligne écrite pour la semaine.
  IF (SELECT type FROM guilde_defis WHERE guilde_id = '11111111-0000-0000-0000-000000000001' AND semaine = guilde_semaine_courante())
     IS DISTINCT FROM 'seances' THEN
    RAISE EXCEPTION 'essai D3 : le défi en cours de G1 devait rester « seances »';
  END IF;
  PERFORM set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  IF (SELECT defi FROM guilde_semaine()) IS DISTINCT FROM 'seances' THEN RAISE EXCEPTION 'essai D3 : G1 court toujours « seances »'; END IF;

  -- G2 (pas lancée) : le nouveau défaut, « series » ; sa cible est la somme des moyennes publiées.
  PERFORM set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', true);
  IF EXISTS (SELECT 1 FROM guilde_defis WHERE guilde_id = '22222222-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'essai D3 : aucune ligne pour G2 (sa semaine n''était pas lancée)';
  END IF;
  SELECT * INTO s FROM guilde_semaine();
  IF s.defi IS DISTINCT FROM 'series' OR s.series_faites <> 0 OR s.series_cible <> 0 OR s.n IS NOT NULL THEN
    RAISE EXCEPTION 'essai D3 : G2 sans score publié → « series », 0 sur 0 : %', row_to_json(s);
  END IF;
  INSERT INTO guilde_scores (user_id, semaine, seances, prevues, records_semaine, mois, exercices, exercices_record, series_semaine, series_moyenne)
    VALUES ('cccccccc-0000-0000-0000-000000000003', guilde_semaine_courante(), 2, 4, 0, guilde_mois_courant(), 0, 0, 12, 10.5);
  SELECT * INTO s FROM guilde_semaine();
  IF s.series_faites <> 12 OR s.series_cible <> 11 THEN RAISE EXCEPTION 'essai D3 : 12 séries sur 11 (10,5 arrondi) : %', row_to_json(s); END IF;

  -- Une app d'avant v2_093 publie sans les séries : le défaut (0) s'applique, rien ne casse.
  INSERT INTO guilde_scores (user_id, semaine, seances, prevues, records_semaine, mois, exercices, exercices_record)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', guilde_semaine_courante(), 1, 4, 1, guilde_mois_courant(), 0, 0);
  IF (SELECT series_semaine + series_moyenne FROM guilde_scores WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'essai D3 : une publication sans les séries vaut 0';
  END IF;

  -- L'administrateur de G2 choisit « series » (sans nombre) ; un nombre est refusé ; « seances » reste au choix.
  PERFORM guilde_choisir_defi('series', NULL);
  IF (SELECT defi FROM guilde_semaine()) IS DISTINCT FROM 'series' THEN RAISE EXCEPTION 'essai D3 : le choix « series »'; END IF;
  BEGIN
    PERFORM guilde_choisir_defi('series', 5);
    RAISE EXCEPTION 'essai D3 : « series » avec un nombre devait être refusé';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM guilde_choisir_defi('seances', NULL);
  BEGIN
    INSERT INTO guilde_scores (user_id, semaine, seances, prevues, records_semaine, mois, exercices, exercices_record, series_semaine)
      VALUES ('dddddddd-0000-0000-0000-000000000004', guilde_semaine_courante(), 0, 0, 0, guilde_mois_courant(), 0, 0, 3000);
    RAISE EXCEPTION 'essai D3 : 3000 séries devait être refusé';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'v2_093 : essai réussi' AS resultat;
