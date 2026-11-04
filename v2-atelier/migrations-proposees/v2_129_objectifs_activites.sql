-- 225 (lot G) — Objectifs en entretien + activités notées. PROPOSÉE, NON APPLIQUÉE : Claude.ai l'applique (jamais Claude Code).
-- Nom de migration à l'application : v2_129_objectifs_activites.
--
-- 1. profiles.objectifs_entretien  text[] NULL   — les objectifs ENTRETENUS en plus de l'objectif principal (profiles.objectif
--    reste le principal ; 79 lecteurs, aucun ne change). Valeurs : force, muscle, calisthenie, forme ; 3 au plus ; jamais le
--    principal ; « les_deux » (affiché « Force et muscle ») contient déjà force ET muscle, donc aucun des deux en entretien.
--    NULL = pas répondu · {} = aucun.
-- 2. profiles.activites_habituelles jsonb NULL   — facultatif : [{ "slug": "football", "jours": [1,3] }] (jours 1 = lundi … 7).
--    Une HABITUDE DÉCLARÉE : le coach n'en fait rien (seule une activité NOTÉE déclenche la règle 225-3).
-- 3. exercises : les sports qui manquent au catalogue (hors_salle = true, nature = 'cardio'). Une activité notée est une
--    séance courte (sessions/sets) sur l'un d'eux ; l'intensité se note dans sets.rpe (légère 3 · moyenne 6 · intense 9).
--
-- AVANT D'APPLIQUER — relever (SELECT seul) : le CHECK de profiles.objectif, une ligne modèle `boxe` et une ligne
-- `course` (colonnes famille, charge, mesure, equipement, muscles_*, nature, hors_salle) ; les deux gabarits ci-dessous
-- sont LUS dans la base, jamais supposés : le bloc 3 s'arrête (EXCEPTION) s'il n'en trouve pas.
-- Chaque sport n'est inséré que si NI le slug NI le nom (minuscules, sans accents) n'existe déjà : le catalogue compte déjà
-- natation, course, randonnée, vélo, ski, escalade… (v2_098, 27 exercices hors salle) — les doublons sont écartés, pas
-- renommés. Les alias de recherche (exercise_alias) sont posés à part, après relevé de ce qui est réellement inséré.

-- ===== 0. Pré-contrôles =====
DO $$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='objectifs_entretien') THEN
    RAISE NOTICE 'profiles.objectifs_entretien existe déjà : le bloc 1 est sans effet (IF NOT EXISTS).';
  END IF;
  SELECT count(*) INTO n FROM public.profiles WHERE objectif IS NOT NULL AND objectif NOT IN ('force','muscle','les_deux','forme','calisthenie');
  IF n > 0 THEN RAISE EXCEPTION 'profiles.objectif porte % valeur(s) hors force/muscle/les_deux/forme/calisthenie', n; END IF;
  RAISE NOTICE 'exercices hors salle avant : %', (SELECT count(*) FROM public.exercises WHERE hors_salle);
END $$;

-- ===== 1 et 2. Colonnes de profiles =====
DO $$
BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS objectifs_entretien text[] NULL;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activites_habituelles jsonb NULL;

  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_objectifs_entretien_ok;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_objectifs_entretien_ok CHECK (
    objectifs_entretien IS NULL OR (
      objectifs_entretien <@ ARRAY['force','muscle','calisthenie','forme']::text[]
      AND cardinality(objectifs_entretien) <= 3
      AND (objectif IS NULL OR NOT (objectif = ANY (objectifs_entretien)))
      AND (objectif IS DISTINCT FROM 'les_deux' OR NOT (objectifs_entretien && ARRAY['force','muscle']::text[]))
    ));

  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_activites_habituelles_ok;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_activites_habituelles_ok CHECK (
    activites_habituelles IS NULL OR (
      jsonb_typeof(activites_habituelles) = 'array' AND jsonb_array_length(activites_habituelles) <= 10
    ));
END $$;

-- ===== 3. Catalogue : les sports qui manquent =====
DO $$
DECLARE
  g_temps record;      -- gabarit : un exercice hors salle, nature cardio, mesure 'temps' (boxe de préférence)
  g_dist  record;      -- gabarit : un exercice hors salle, nature cardio, mesure 'distance_temps' (course de préférence)
  s record;
  avant int; ajoutes int := 0;
  desc_std text;
BEGIN
  SELECT * INTO g_temps FROM public.exercises WHERE hors_salle AND nature='cardio' AND mesure='temps'
    ORDER BY (slug='boxe') DESC, slug LIMIT 1;
  SELECT * INTO g_dist FROM public.exercises WHERE hors_salle AND nature='cardio' AND mesure='distance_temps'
    ORDER BY (slug='course') DESC, slug LIMIT 1;
  IF g_temps.slug IS NULL THEN RAISE EXCEPTION 'aucun gabarit hors salle en mesure temps : relever boxe avant'; END IF;
  RAISE NOTICE 'gabarit temps : %, gabarit distance : %', g_temps.slug, g_dist.slug;
  SELECT count(*) INTO avant FROM public.exercises;

  FOR s IN SELECT * FROM (VALUES
    -- slug, nom, avec_distance, description (3 à 6 lignes, au tu, sans numéro)
    ('football','Football',false,E'Note la durée de ta séance de football.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('basketball','Basketball',false,E'Note la durée de ta séance de basketball.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('handball','Handball',false,E'Note la durée de ta séance de handball.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('rugby','Rugby',false,E'Note la durée de ta séance de rugby.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('volleyball','Volley-ball',false,E'Note la durée de ta séance de volley-ball.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('tennis','Tennis',false,E'Note la durée de ta séance de tennis.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('badminton','Badminton',false,E'Note la durée de ta séance de badminton.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('padel','Padel',false,E'Note la durée de ta séance de padel.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('squash','Squash',false,E'Note la durée de ta séance de squash.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('tennis_de_table','Tennis de table',false,E'Note la durée de ta séance de tennis de table.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('boxe','Boxe',false,E'Note la durée de ta séance de boxe.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('arts_martiaux','Arts martiaux',false,E'Note la durée de ta séance d''arts martiaux.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('danse','Danse',false,E'Note la durée de ta séance de danse.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('kayak','Kayak',true,E'Note la durée de ta sortie en kayak, et la distance si tu la connais.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.'),
    ('roller','Roller',true,E'Note la durée de ta sortie en roller, et la distance si tu la connais.\nChoisis ensuite l''intensité : légère, moyenne ou intense.\nLe volume par muscle ne compte pas cette activité.\nElle s''affiche dans ton historique et dans Ta semaine.')
  ) AS v(slug, nom, avec_distance, descr) LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.exercises e WHERE e.slug = s.slug
                          OR lower(translate(e.nom,'éèêëàâîïôùûç','eeeeaaiiouuc')) = lower(translate(s.nom,'éèêëàâîïôùûç','eeeeaaiiouuc')));
    IF s.avec_distance AND g_dist.slug IS NULL THEN
      RAISE NOTICE '% ignoré : aucun gabarit en mesure distance_temps', s.slug; CONTINUE;
    END IF;
    IF s.avec_distance THEN
      INSERT INTO public.exercises (slug, nom, famille, charge, mesure, equipement, muscles_primaires, muscles_secondaires,
                                    nature, hors_salle, description, description_source)
      VALUES (s.slug, s.nom, g_dist.famille, g_dist.charge, 'distance_temps', g_dist.equipement,
              g_dist.muscles_primaires, g_dist.muscles_secondaires, 'cardio', true, s.descr, 'claude');
    ELSE
      INSERT INTO public.exercises (slug, nom, famille, charge, mesure, equipement, muscles_primaires, muscles_secondaires,
                                    nature, hors_salle, description, description_source)
      VALUES (s.slug, s.nom, g_temps.famille, g_temps.charge, 'temps', g_temps.equipement,
              g_temps.muscles_primaires, g_temps.muscles_secondaires, 'cardio', true, s.descr, 'claude');
    END IF;
    ajoutes := ajoutes + 1;
  END LOOP;
  RAISE NOTICE 'exercices ajoutés : %', ajoutes;
END $$;

-- ===== Post-contrôles (à lancer après, résultats à relire) =====
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('objectifs_entretien','activites_habituelles');
-- SELECT conname FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname LIKE 'profiles_%entretien%' OR conname LIKE 'profiles_activites%';
-- SELECT slug, nom, mesure, nature, hors_salle FROM public.exercises WHERE hors_salle ORDER BY nom;   -- 27 + les ajoutés
-- SELECT count(*) FROM public.exercises WHERE description_source='claude' AND length(description) BETWEEN 20 AND 1500;  -- les contraintes passent à l'INSERT
-- Les 5 comptes réels : objectifs_entretien et activites_habituelles NULL partout (aucune donnée écrite par la migration).
