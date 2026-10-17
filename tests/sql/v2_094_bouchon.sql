-- Bouchon de schéma pour essayer v2_094 sur Postgres local (prompt 121). PAS lancé par `npm test` : à jouer à la main,
-- dans une base vide, dans cet ordre —
--   1. CE FICHIER (auth.users, profiles, sessions, sets, records, blocages, abonnements, social_bloque, social_mutuel…) ;
--   2. v2_080, v2_082, v2_083, v2_087, v2_092, v2_093 (`v2-atelier/migrations-proposees/`) ;
--   3. `v2_094_essai_avant.sql` (le décor d'avant v2_094, validé) ; 4. v2_094 ; 5. `v2_094_essai_apres.sql` (les scénarios).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('test.uid', true), '')::uuid $f$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, username text UNIQUE,
  deleted_at timestamptz, jeu_actif boolean NOT NULL DEFAULT true, compte_prive boolean NOT NULL DEFAULT true, jeu_titre text, jeu_niveau int, seances_par_semaine int);
CREATE TABLE public.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statut text, debut timestamptz, fin timestamptz, titre text, visibilite text);
CREATE TABLE public.sets (id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, exercise_slug text, charge_kg numeric, reps int, duree_s int, distance_m numeric, type_serie text,
  validee_a timestamptz, rang int);
CREATE TABLE public.records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), set_id uuid, session_id uuid, user_id uuid,
  exercise_slug text, type text, le timestamptz, battu_le timestamptz, valeur numeric, charge numeric, reps int, unite text);
CREATE TABLE public.blocages (bloqueur uuid, bloque uuid);
-- 121 — les abonnements et les deux cercles de v2_078, au plus près de leur règle (le faux serveur du banc) :
-- le blocage dans les deux sens ; le mutuel = deux suivis acceptés, sans blocage.
CREATE TABLE public.abonnements (suiveur uuid, suivi uuid, statut text NOT NULL DEFAULT 'demande');
CREATE TABLE public.reactions_seance (user_id uuid, session_id uuid, emoji text);
ALTER TABLE public.reactions_seance ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.scores_force (user_id uuid, exercise_slug text, score numeric, charge_kg numeric);
CREATE FUNCTION public.social_bloque(a uuid, b uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT EXISTS (SELECT 1 FROM blocages x WHERE (x.bloqueur = a AND x.bloque = b) OR (x.bloqueur = b AND x.bloque = a)) $f$;
CREATE FUNCTION public.social_mutuel(a uuid, b uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT NOT social_bloque(a, b)
     AND EXISTS (SELECT 1 FROM abonnements x WHERE x.suiveur = a AND x.suivi = b AND x.statut = 'accepte')
     AND EXISTS (SELECT 1 FROM abonnements x WHERE x.suiveur = b AND x.suivi = a AND x.statut = 'accepte') $f$;
CREATE POLICY r1 ON public.reactions_seance FOR SELECT USING (true);
CREATE POLICY r2 ON public.reactions_seance FOR INSERT WITH CHECK (true);
CREATE POLICY r3 ON public.reactions_seance FOR DELETE USING (true);
