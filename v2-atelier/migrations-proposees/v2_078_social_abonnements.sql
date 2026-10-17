-- v2_078_social_abonnements — étage 1 du social (décidé le 12/10/2026, maquette social étage 1 v2)
-- Écrit par Claude.ai, lancé par Aurélien. Aucune politique ajoutée sur sessions/sets/records :
-- les autres ne lisent QUE par les fonctions ci-dessous, qui ne rendent que les colonnes autorisées
-- (jamais poids_corps_kg, note, rpe, ressenti, douleur, santé).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='abonnements') THEN
    RAISE EXCEPTION 'pré-contrôle : abonnements existe déjà';
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN compte_prive boolean NOT NULL DEFAULT true;
-- Niveau et titre du jeu, publiés par l'app depuis etatDuJeu (affichage seulement ; jamais relus par le jeu).
ALTER TABLE public.profiles ADD COLUMN jeu_niveau integer, ADD COLUMN jeu_titre text;
-- La confidentialité se règle au niveau du compte (compte_prive) ; 'private' sur une séance = la masquer (choix
-- explicite, plus tard). Le v2 n'a jamais écrit visibilite : le défaut 'private' n'était le choix de personne.
ALTER TABLE public.sessions ALTER COLUMN visibilite SET DEFAULT 'mutuels';
UPDATE public.sessions SET visibilite = 'mutuels' WHERE visibilite = 'private';

CREATE TABLE public.abonnements (
  suiveur uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suivi   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statut  text NOT NULL DEFAULT 'demande' CHECK (statut IN ('demande','accepte')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  accepte_le timestamptz,
  PRIMARY KEY (suiveur, suivi),
  CHECK (suiveur <> suivi)
);
CREATE INDEX abonnements_suivi ON public.abonnements (suivi, statut);

CREATE TABLE public.blocages (
  bloqueur uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bloque   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cree_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bloqueur, bloque),
  CHECK (bloqueur <> bloque)
);

CREATE TABLE public.reactions_seance (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cree_le    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- Règles d'accès (fonctions, search_path figé)
CREATE FUNCTION public.social_bloque(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM blocages WHERE (bloqueur=a AND bloque=b) OR (bloqueur=b AND bloque=a)) $f$;

CREATE FUNCTION public.social_suit(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM abonnements WHERE suiveur=a AND suivi=b AND statut='accepte')
     AND NOT social_bloque(a,b) $f$;

CREATE FUNCTION public.social_mutuel(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT social_suit(a,b) AND social_suit(b,a) $f$;

-- Une demande vers un compte public est acceptée d'office ; impossible si blocage.
CREATE FUNCTION public.abonnements_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF social_bloque(NEW.suiveur, NEW.suivi) THEN RAISE EXCEPTION 'bloque'; END IF;
  IF (SELECT NOT compte_prive FROM profiles WHERE id = NEW.suivi) THEN
    NEW.statut := 'accepte'; NEW.accepte_le := now();
  ELSE NEW.statut := 'demande'; NEW.accepte_le := NULL; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER abonnements_avant_ajout BEFORE INSERT ON public.abonnements
  FOR EACH ROW EXECUTE FUNCTION public.abonnements_avant_ajout();

-- Seul le suivi accepte ; rien d'autre ne change.
CREATE FUNCTION public.abonnements_avant_modif() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF NEW.suiveur <> OLD.suiveur OR NEW.suivi <> OLD.suivi OR NEW.cree_le <> OLD.cree_le
     OR NOT (OLD.statut='demande' AND NEW.statut='accepte') THEN RAISE EXCEPTION 'modification refusée'; END IF;
  NEW.accepte_le := now(); RETURN NEW;
END $f$;
CREATE TRIGGER abonnements_avant_modif BEFORE UPDATE ON public.abonnements
  FOR EACH ROW EXECUTE FUNCTION public.abonnements_avant_modif();

-- Bloquer retire les abonnements dans les deux sens et les réactions croisées.
CREATE FUNCTION public.blocages_apres_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  DELETE FROM abonnements WHERE (suiveur=NEW.bloqueur AND suivi=NEW.bloque) OR (suiveur=NEW.bloque AND suivi=NEW.bloqueur);
  DELETE FROM reactions_seance r USING sessions s WHERE r.session_id=s.id
    AND ((r.user_id=NEW.bloque AND s.user_id=NEW.bloqueur) OR (r.user_id=NEW.bloqueur AND s.user_id=NEW.bloque));
  RETURN NEW;
END $f$;
CREATE TRIGGER blocages_apres_ajout AFTER INSERT ON public.blocages
  FOR EACH ROW EXECUTE FUNCTION public.blocages_apres_ajout();

ALTER TABLE public.abonnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions_seance ENABLE ROW LEVEL SECURITY;

CREATE POLICY abonnements_lecture ON public.abonnements FOR SELECT
  USING (suiveur = (SELECT auth.uid()) OR suivi = (SELECT auth.uid()));
CREATE POLICY abonnements_ajout ON public.abonnements FOR INSERT WITH CHECK (suiveur = (SELECT auth.uid()));
CREATE POLICY abonnements_accepter ON public.abonnements FOR UPDATE USING (suivi = (SELECT auth.uid()));
CREATE POLICY abonnements_retrait ON public.abonnements FOR DELETE
  USING (suiveur = (SELECT auth.uid()) OR suivi = (SELECT auth.uid()));

CREATE POLICY blocages_miens ON public.blocages FOR ALL
  USING (bloqueur = (SELECT auth.uid())) WITH CHECK (bloqueur = (SELECT auth.uid()));

-- Réagir : à une séance terminée, non privée, d'une personne que je suis. Lire : mes réactions, ou celles sur mes séances.
CREATE POLICY reactions_ajout ON public.reactions_seance FOR INSERT WITH CHECK (
  user_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id
    AND s.statut='terminee' AND s.visibilite <> 'private' AND social_suit((SELECT auth.uid()), s.user_id)));
CREATE POLICY reactions_lecture ON public.reactions_seance FOR SELECT USING (
  user_id = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())));
CREATE POLICY reactions_retrait ON public.reactions_seance FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Lectures sociales. Tonnage = Bilan.volumeKg (bilan.js) : séries travail, charge > 0, reps > 0, arrondi au centième.
CREATE FUNCTION public.social_profil(p_pseudo text)
RETURNS TABLE(id uuid, pseudo text, niveau integer, titre text, compte_prive boolean, je_suis text, me_suit boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p.id, p.username, CASE WHEN p.jeu_actif THEN p.jeu_niveau END, CASE WHEN p.jeu_actif THEN p.jeu_titre END, p.compte_prive,
    (SELECT a.statut FROM abonnements a WHERE a.suiveur=auth.uid() AND a.suivi=p.id),
    social_suit(p.id, auth.uid())
  FROM profiles p
  WHERE p.username = p_pseudo AND p.deleted_at IS NULL AND NOT social_bloque(auth.uid(), p.id) $f$;

CREATE FUNCTION public.social_rechercher(p_debut text)
RETURNS TABLE(pseudo text, niveau integer, compte_prive boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p.username, CASE WHEN p.jeu_actif THEN p.jeu_niveau END, p.compte_prive FROM profiles p
  WHERE length(btrim(p_debut)) >= 2 AND p.username ILIKE replace(replace(btrim(p_debut),'%',''),'_','\_') || '%'
    AND p.deleted_at IS NULL AND p.id <> auth.uid() AND NOT social_bloque(auth.uid(), p.id)
  ORDER BY p.username LIMIT 20 $f$;

CREATE FUNCTION public.social_fil()
RETURNS TABLE(session_id uuid, user_id uuid, pseudo text, titre text, debut timestamptz, fin timestamptz,
              tonnage_kg numeric, j_ai_reagi boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT s.id, s.user_id, p.username, s.titre, s.debut, s.fin,
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t WHERE t.session_id=s.id AND coalesce(t.type_serie,'travail')='travail' AND t.charge_kg > 0 AND t.reps > 0),
    EXISTS (SELECT 1 FROM reactions_seance r WHERE r.session_id=s.id AND r.user_id=auth.uid())
  FROM sessions s JOIN profiles p ON p.id = s.user_id
  WHERE s.statut='terminee' AND s.visibilite <> 'private' AND s.debut >= now() - interval '30 days'
    AND social_suit(auth.uid(), s.user_id)
  ORDER BY s.debut DESC LIMIT 200 $f$;

-- Médailles : les lignes de records de la séance ; l'app choisit lesquelles sont des médailles (faits.js).
CREATE FUNCTION public.social_records_seance(p_session uuid)
RETURNS TABLE(set_id uuid, battu_le timestamptz, exercise_slug text, type text, valeur numeric, charge numeric, reps integer, unite text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT r.set_id, r.battu_le, r.exercise_slug, r.type, r.valeur, r.charge, r.reps, r.unite FROM records r JOIN sessions s ON s.id=r.session_id
  WHERE r.session_id=p_session AND s.statut='terminee' AND s.visibilite <> 'private'
    AND social_suit(auth.uid(), s.user_id) $f$;

CREATE FUNCTION public.social_calendrier(p_user uuid, p_de date, p_a date)
RETURNS TABLE(session_id uuid, titre text, debut timestamptz, tonnage_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT s.id, s.titre, s.debut,
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t WHERE t.session_id=s.id AND coalesce(t.type_serie,'travail')='travail' AND t.charge_kg > 0 AND t.reps > 0)
  FROM sessions s WHERE s.user_id=p_user AND s.statut='terminee' AND s.visibilite <> 'private'
    AND s.debut >= p_de AND s.debut < p_a + 1 AND (p_a - p_de) <= 62
    AND social_suit(auth.uid(), p_user) ORDER BY s.debut $f$;

-- Détail : mutuels seulement ; colonnes autorisées seulement.
CREATE FUNCTION public.social_detail_seance(p_session uuid)
RETURNS TABLE(exercise_slug text, rang integer, charge_kg numeric, reps integer, duree_s integer, distance_m numeric, type_serie text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT t.exercise_slug, t.rang, t.charge_kg, t.reps, t.duree_s, t.distance_m, t.type_serie
  FROM sets t JOIN sessions s ON s.id=t.session_id
  WHERE t.session_id=p_session AND s.statut='terminee' AND s.visibilite <> 'private'
    AND social_mutuel(auth.uid(), s.user_id) ORDER BY t.rang $f$;

-- Le nombre de réactions : l'auteur seulement (la politique de lecture suffit ; cette fonction l'expose simplement).
CREATE FUNCTION public.social_mes_reactions(p_session uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT count(*)::int FROM reactions_seance r JOIN sessions s ON s.id=r.session_id
  WHERE r.session_id=p_session AND s.user_id=auth.uid() $f$;

-- Mes liens : demandes reçues et envoyées, abonnés, abonnements, bloqués — pseudo et niveau seulement.
CREATE FUNCTION public.social_liens()
RETURNS TABLE(user_id uuid, pseudo text, niveau integer, lien text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p.id, p.username, CASE WHEN p.jeu_actif THEN p.jeu_niveau END,
         CASE WHEN a.statut='demande' THEN 'demande_recue' ELSE 'abonne' END
  FROM abonnements a JOIN profiles p ON p.id=a.suiveur WHERE a.suivi=auth.uid() AND p.deleted_at IS NULL
  UNION ALL
  SELECT p.id, p.username, CASE WHEN p.jeu_actif THEN p.jeu_niveau END,
         CASE WHEN a.statut='demande' THEN 'demande_envoyee' ELSE 'abonnement' END
  FROM abonnements a JOIN profiles p ON p.id=a.suivi WHERE a.suiveur=auth.uid() AND p.deleted_at IS NULL
  UNION ALL
  SELECT p.id, p.username, NULL::integer, 'bloque'
  FROM blocages b JOIN profiles p ON p.id=b.bloque WHERE b.bloqueur=auth.uid() AND p.deleted_at IS NULL $f$;
REVOKE ALL ON FUNCTION public.social_liens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_liens() TO authenticated;

REVOKE ALL ON FUNCTION public.social_bloque(uuid,uuid), public.social_suit(uuid,uuid), public.social_mutuel(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_profil(text), public.social_rechercher(text), public.social_fil(),
  public.social_records_seance(uuid), public.social_calendrier(uuid,date,date), public.social_detail_seance(uuid),
  public.social_mes_reactions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_profil(text), public.social_rechercher(text), public.social_fil(),
  public.social_records_seance(uuid), public.social_calendrier(uuid,date,date), public.social_detail_seance(uuid),
  public.social_mes_reactions(uuid) TO authenticated;

DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('abonnements','blocages','reactions_seance')) <> 8 THEN
    RAISE EXCEPTION 'post-contrôle : politiques attendues 8';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('sessions','sets','records')
             AND policyname NOT IN ('sessions_owner','sets_owner','records_ajout','records_lecture')) THEN
    RAISE EXCEPTION 'post-contrôle : politique inattendue sur sessions/sets/records';
  END IF;
  IF EXISTS (SELECT 1 FROM sessions WHERE visibilite = 'private') THEN RAISE EXCEPTION 'post-contrôle : séances private restantes'; END IF;
END $$;
