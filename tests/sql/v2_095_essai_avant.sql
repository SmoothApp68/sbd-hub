-- Essai de v2_095 sur Postgres local (prompt 123). PAS lancé par `npm test` : à jouer à la main, dans une base vide,
-- dans cet ordre —
--   1. CE FICHIER (le bouchon `profiles`, puis le décor d'avant v2_095 : v2_088 doit être lancée juste après la table) :
--      psql -v ON_ERROR_STOP=1 -c "CREATE TABLE public.profiles (id uuid PRIMARY KEY, username text)"
--      psql -v ON_ERROR_STOP=1 -f v2-atelier/migrations-proposees/v2_088_ma_salle.sql
--      psql -v ON_ERROR_STOP=1 -f tests/sql/v2_095_essai_avant.sql
--   2. v2_095 (`v2-atelier/migrations-proposees/v2_095_ma_salle_tranches.sql`) — d'abord en essai à blanc (ROLLBACK) ;
--   3. `v2_095_essai_apres.sql`.
-- Le décor : A garde l'ancienne forme, B n'a pas de salle, C des barres sans haltères. AVANT v2_095, la salle
-- d'Aurélien par tranches est refusée (23514) : c'est le refus que l'app de 123 rencontre tant que la migration
-- n'est pas lancée (la colonne sort de l'envoi, la salle d'avant est gardée, le Profil le dit).
INSERT INTO public.profiles (id, username, ma_salle) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alea', '{"barres_ez":[10,15,20,25,30],"barres_droites":[],"halteres":{"max":40,"pas":2}}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bea', NULL),
  ('cccccccc-0000-0000-0000-000000000003', 'cea', '{"barres_ez":[10,20],"barres_droites":[],"halteres":null}');
DO $$ DECLARE refuse boolean := false; BEGIN
  BEGIN
    UPDATE public.profiles SET ma_salle = '{"barres_ez":[],"barres_droites":[],"halteres":[{"jusqua":10,"pas":1},{"jusqua":40,"pas":2}]}'
     WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  EXCEPTION WHEN check_violation THEN refuse := true;
  END;
  IF NOT refuse THEN RAISE EXCEPTION 'essai avant : v2_088 devrait refuser les tranches'; END IF;
END $$;
