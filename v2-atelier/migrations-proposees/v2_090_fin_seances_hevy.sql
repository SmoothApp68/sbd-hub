-- v2_090 — Les heures de fin des 7 séances Hevy d'aurel_br (19/09 → 02/10/2026), perdues par les rattrapages
-- manuels d'avant l'import de l'app (prompt 69). Source : export Hevy du 16/10/2026 (end_time, heure de Paris,
-- convertie en heure universelle). Ne touche que ces 7 lignes, et seulement si `fin` est encore vide.
BEGIN;

CREATE TEMP TABLE v2_090_fins (id uuid PRIMARY KEY, debut timestamptz NOT NULL, fin timestamptz NOT NULL) ON COMMIT DROP;
INSERT INTO v2_090_fins VALUES
  ('a2cea6d9-ee2c-464f-ba41-faeba2540aa3', '2026-09-19 17:31:00+00', '2026-09-19 18:42:00+00'),
  ('de6f2348-de24-4688-8a65-02cf976e150a', '2026-09-22 15:12:00+00', '2026-09-22 16:36:00+00'),
  ('274a0efd-3a43-4e36-9dc1-4dfd65c79bd8', '2026-09-23 06:05:00+00', '2026-09-23 11:30:00+00'),
  ('89166b1e-2ec3-4f16-85dc-fcd1a60c0279', '2026-09-24 15:51:00+00', '2026-09-24 17:15:00+00'),
  ('08c3d3ba-f8a3-49cb-8f67-5858bbf9979b', '2026-09-25 16:44:00+00', '2026-09-25 17:54:00+00'),
  ('074d1faf-0857-4d04-87d1-855175d83534', '2026-09-29 14:51:00+00', '2026-09-29 16:38:00+00'),
  ('113fcf94-c8ae-4835-8a21-70098ab1096b', '2026-10-02 15:54:00+00', '2026-10-02 17:33:00+00');

-- Pré-contrôle : les 7 séances existent, sont à aurel_br, terminées, de source hevy, au bon début, sans fin.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.sessions s JOIN v2_090_fins f ON f.id = s.id
   WHERE s.user_id = '6e2936e7-de11-4f19-89b1-d1eb5968ba35' AND s.statut = 'terminee' AND s.source = 'hevy'
     AND s.debut = f.debut AND s.fin IS NULL;
  IF n <> 7 THEN RAISE EXCEPTION 'pré-contrôle : % séances conformes au lieu de 7', n; END IF;
END $$;

UPDATE public.sessions s SET fin = f.fin
  FROM v2_090_fins f
 WHERE s.id = f.id AND s.fin IS NULL AND s.user_id = '6e2936e7-de11-4f19-89b1-d1eb5968ba35';

-- Post-contrôle : les 7 ont leur fin, après leur début ; plus aucune séance terminée sans fin pour aurel_br.
DO $$ DECLARE n int; m int; BEGIN
  SELECT count(*) INTO n FROM public.sessions s JOIN v2_090_fins f ON f.id = s.id WHERE s.fin = f.fin AND s.fin > s.debut;
  IF n <> 7 THEN RAISE EXCEPTION 'post-contrôle : % fins posées au lieu de 7', n; END IF;
  SELECT count(*) INTO m FROM public.sessions
   WHERE user_id = '6e2936e7-de11-4f19-89b1-d1eb5968ba35' AND statut = 'terminee' AND fin IS NULL;
  IF m <> 0 THEN RAISE EXCEPTION 'post-contrôle : % séances terminées encore sans fin', m; END IF;
END $$;

COMMIT;
