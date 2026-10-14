-- v2_080_guilde — la guilde (décidée le 14/10/2026, maquette social étage 2 v2, écran 4)
-- PROPOSÉE par Claude Code (prompt 90), sur le modèle de v2_078 et v2_079 : Claude.ai la relit et la lance, APRÈS v2_079.
--
-- Une guilde PERMANENTE : jusqu'à 30 membres, une guilde par personne, on n'invite qu'un de SES abonnés mutuels. Pas de
-- chef affiché : le créateur administre (nom, blason, retirer un membre, choisir le défi, transmettre) ; s'il part,
-- l'administration passe au membre le plus ancien ; une guilde sans membre disparaît. CES QUATRE RÈGLES SONT EN BASE
-- (contraintes et déclencheurs), pas seulement dans l'app.
--
-- Aucune politique ajoutée sur sessions/sets/records : les membres ne se lisent QUE par les fonctions ci-dessous, qui ne
-- rendent que les colonnes autorisées (jamais poids_corps_kg, note, rpe, ressenti, douleur, santé). Une seule politique
-- ajoutée sur reactions_seance : réagir à la séance d'un membre de sa guilde (« réactions seulement »).
--
-- LES SCORES SE CALCULENT SUR L'APPAREIL (faits.js : séances prévues, records sans dépasser la charge proposée) et seuls
-- les nombres déjà calculés sont publiés, dans guilde_scores, comme scores_force (v2_079). Deux chiffres se calculent ici,
-- parce qu'ils ne s'additionnent pas d'une personne à l'autre ou qu'ils sont des faits bruts de la base : les exercices
-- différents de la semaine (une union, pas une somme) et « La guilde cette semaine » (séances, médailles, tonnage).
-- La semaine est celle de l'app : du lundi au dimanche, heure de Paris.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guildes') THEN
    RAISE EXCEPTION 'pré-contrôle : guildes existe déjà';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='social_mutuel' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'pré-contrôle : v2_078 (social_mutuel) absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scores_force') THEN
    RAISE EXCEPTION 'pré-contrôle : v2_079 (scores_force) absente';
  END IF;
END $$;

-- ── LES TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Le nom : 3 à 24 caractères, unique sans casse ni accents (pas d'unaccent : translate(lower(btrim(…)), …)).
CREATE TABLE public.guildes (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom     text NOT NULL CONSTRAINT guildes_nom_longueur CHECK (nom = btrim(nom) AND char_length(nom) BETWEEN 3 AND 24),
  nom_cle text GENERATED ALWAYS AS (translate(lower(btrim(nom)),
            'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')) STORED,
  -- Le blason : un gabarit du social (aucune image envoyée), d'une couleur de la palette.
  blason  text NOT NULL DEFAULT 'bouclier' CONSTRAINT guildes_blason CHECK (blason IN ('bouclier')),
  couleur text NOT NULL CONSTRAINT guildes_couleur CHECK (couleur IN
            ('#b39ad1','#8fb08a','#6fa3d8','#d9b45a','#d98f6f','#7fc4c0','#c98fb4','#a3a9b3')),
  admin   uuid NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guildes_nom_cle_uniq ON public.guildes (nom_cle);

-- UNE GUILDE PAR PERSONNE : la clé primaire est la personne.
CREATE TABLE public.guilde_membres (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  guilde_id uuid NOT NULL REFERENCES public.guildes(id) ON DELETE CASCADE,
  -- Le rang : choisi par chacun, sans aucun pouvoir, jamais gagné.
  rang      text NOT NULL DEFAULT 'Novice' CONSTRAINT guilde_membres_rang CHECK (rang IN
              ('Squatteur','Bencheur','Terreur','Pousseur','Tireur','Chargeur','Gymbro','Motiveur','Novice')),
  entre_le  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX guilde_membres_guilde ON public.guilde_membres (guilde_id, entre_le);

CREATE TABLE public.guilde_invitations (
  guilde_id uuid NOT NULL REFERENCES public.guildes(id) ON DELETE CASCADE,
  invite    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitant  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cree_le   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guilde_id, invite)
);
CREATE INDEX guilde_invitations_invite ON public.guilde_invitations (invite);

-- Le défi de la semaine : un à la fois, coopératif, parmi les défis SÛRS — jamais la charge ni le tonnage.
--   seances : chacun fait ses séances prévues (sans nombre) ; records : N records sans dépasser la charge proposée ;
--   variete : N exercices différents, à tous. Sans ligne pour la semaine, le défi « seances » part seul.
CREATE TABLE public.guilde_defis (
  guilde_id  uuid NOT NULL REFERENCES public.guildes(id) ON DELETE CASCADE,
  semaine    date NOT NULL CONSTRAINT guilde_defis_lundi CHECK (extract(isodow FROM semaine) = 1),
  type       text NOT NULL CONSTRAINT guilde_defis_type CHECK (type IN ('seances','records','variete')),
  n          integer CONSTRAINT guilde_defis_n CHECK ((type = 'seances' AND n IS NULL) OR (type <> 'seances' AND n BETWEEN 1 AND 100)),
  choisi_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guilde_id, semaine)
);

-- Mes nombres publiés, déjà calculés sur l'appareil. Aucune colonne de poids, de note, d'effort.
CREATE TABLE public.guilde_scores (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  semaine          date NOT NULL CHECK (extract(isodow FROM semaine) = 1),
  seances          integer NOT NULL CHECK (seances BETWEEN 0 AND 100),
  prevues          integer NOT NULL CHECK (prevues BETWEEN 0 AND 14),
  records_semaine  integer NOT NULL CHECK (records_semaine BETWEEN 0 AND 1000),
  mois             date NOT NULL CHECK (extract(day FROM mois) = 1),
  exercices        integer NOT NULL CHECK (exercices BETWEEN 0 AND 500),
  exercices_record integer NOT NULL CHECK (exercices_record BETWEEN 0 AND 500),
  maj_le           timestamptz NOT NULL DEFAULT now(),
  CHECK (exercices_record <= exercices)
);

-- ── LES RÈGLES, EN BASE ────────────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.guilde_de(p_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT guilde_id FROM guilde_membres WHERE user_id = p_user $f$;

CREATE FUNCTION public.guilde_commune(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM guilde_membres x JOIN guilde_membres y ON y.guilde_id = x.guilde_id
                 WHERE x.user_id = a AND y.user_id = b) AND NOT social_bloque(a, b) $f$;

-- La semaine et le mois de l'app (heure de Paris).
CREATE FUNCTION public.guilde_semaine_courante() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Paris')::date $f$;
CREATE FUNCTION public.guilde_mois_courant() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT date_trunc('month', now() AT TIME ZONE 'Europe/Paris')::date $f$;

-- 30 MEMBRES AU PLUS (la ligne de la guilde est verrouillée : deux entrées simultanées ne passent pas à 31).
CREATE FUNCTION public.guilde_membres_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM 1 FROM guildes WHERE id = NEW.guilde_id FOR UPDATE;
  IF (SELECT count(*) FROM guilde_membres WHERE guilde_id = NEW.guilde_id) >= 30 THEN
    RAISE EXCEPTION 'guilde_pleine' USING ERRCODE = 'check_violation';
  END IF;
  NEW.rang := 'Novice'; NEW.entre_le := clock_timestamp();
  RETURN NEW;
END $f$;
CREATE TRIGGER guilde_membres_avant_ajout BEFORE INSERT ON public.guilde_membres
  FOR EACH ROW EXECUTE FUNCTION public.guilde_membres_avant_ajout();

-- Seul le rang change.
CREATE FUNCTION public.guilde_membres_avant_modif() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.guilde_id <> OLD.guilde_id OR NEW.entre_le <> OLD.entre_le THEN
    RAISE EXCEPTION 'guilde_membre_modification' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER guilde_membres_avant_modif BEFORE UPDATE ON public.guilde_membres
  FOR EACH ROW EXECUTE FUNCTION public.guilde_membres_avant_modif();

-- UN DÉPART : la guilde sans membre disparaît ; l'administrateur parti, l'administration passe au plus ancien.
-- Personne n'est prévenu. (Un compte supprimé part par la cascade, et passe ici aussi.)
CREATE FUNCTION public.guilde_membres_apres_depart() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE suivant uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM guildes WHERE id = OLD.guilde_id) THEN RETURN OLD; END IF;
  SELECT user_id INTO suivant FROM guilde_membres WHERE guilde_id = OLD.guilde_id
    ORDER BY entre_le, user_id LIMIT 1;
  IF suivant IS NULL THEN
    DELETE FROM guildes WHERE id = OLD.guilde_id;
  ELSIF (SELECT admin FROM guildes WHERE id = OLD.guilde_id) = OLD.user_id THEN
    UPDATE guildes SET admin = suivant WHERE id = OLD.guilde_id;
  END IF;
  RETURN OLD;
END $f$;
CREATE TRIGGER guilde_membres_apres_depart AFTER DELETE ON public.guilde_membres
  FOR EACH ROW EXECUTE FUNCTION public.guilde_membres_apres_depart();

-- L'administrateur est toujours un membre (à la création, la fonction pose la guilde puis son créateur).
CREATE FUNCTION public.guildes_avant_modif() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.id <> OLD.id OR NEW.cree_le <> OLD.cree_le THEN
    RAISE EXCEPTION 'guilde_modification' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.admin <> OLD.admin AND NOT EXISTS (SELECT 1 FROM guilde_membres WHERE user_id = NEW.admin AND guilde_id = NEW.id) THEN
    RAISE EXCEPTION 'guilde_admin_non_membre' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER guildes_avant_modif BEFORE UPDATE ON public.guildes
  FOR EACH ROW EXECUTE FUNCTION public.guildes_avant_modif();

-- INVITER : un membre de la guilde, et SEULEMENT un de ses abonnés mutuels, pas déjà membre, guilde non pleine.
CREATE FUNCTION public.guilde_invitations_avant_ajout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF guilde_de(NEW.invitant) IS DISTINCT FROM NEW.guilde_id THEN
    RAISE EXCEPTION 'guilde_invitant_non_membre' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT social_mutuel(NEW.invitant, NEW.invite) THEN
    RAISE EXCEPTION 'guilde_invite_non_mutuel' USING ERRCODE = 'check_violation';
  END IF;
  IF guilde_de(NEW.invite) IS NOT DISTINCT FROM NEW.guilde_id THEN
    RAISE EXCEPTION 'guilde_deja_membre' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM guilde_membres WHERE guilde_id = NEW.guilde_id) >= 30 THEN
    RAISE EXCEPTION 'guilde_pleine' USING ERRCODE = 'check_violation';
  END IF;
  NEW.cree_le := now();
  RETURN NEW;
END $f$;
CREATE TRIGGER guilde_invitations_avant_ajout BEFORE INSERT ON public.guilde_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guilde_invitations_avant_ajout();

-- ── LES DROITS ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Guildes, membres, invitations, défis : AUCUNE écriture ni lecture directe — seulement les fonctions ci-dessous.
ALTER TABLE public.guildes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilde_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilde_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilde_defis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guilde_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY guilde_scores_miens ON public.guilde_scores FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
-- Réagir à la séance d'un membre de sa guilde (terminée, non privée). La lecture et le retrait restent ceux de v2_078.
-- ⚠️ La séance se lit par une fonction SECURITY DEFINER : une sous-requête de politique sur `sessions` passerait par
-- le RLS de `sessions` (propriétaire seul) et ne verrait jamais la séance d'un autre.
CREATE FUNCTION public.guilde_peut_reagir(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM sessions s WHERE s.id = p_session AND s.statut = 'terminee' AND s.visibilite <> 'private'
                 AND s.user_id <> auth.uid() AND guilde_commune(auth.uid(), s.user_id)) $f$;
CREATE POLICY reactions_guilde ON public.reactions_seance FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND guilde_peut_reagir(session_id));

-- ── LES GESTES (une fonction chacun ; l'appelant est auth.uid()) ───────────────────────────────────────────────────
CREATE FUNCTION public.guilde_creer(p_nom text, p_couleur text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'guilde_sans_compte' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF guilde_de(auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'guilde_deja_dans_une' USING ERRCODE = 'unique_violation'; END IF;
  INSERT INTO guildes (nom, couleur, admin) VALUES (btrim(p_nom), p_couleur, auth.uid()) RETURNING id INTO g;
  INSERT INTO guilde_membres (user_id, guilde_id) VALUES (auth.uid(), g);
  DELETE FROM guilde_invitations WHERE invite = auth.uid();
  RETURN g;
END $f$;

-- Administrateur seulement : le nom et la couleur.
CREATE FUNCTION public.guilde_modifier(p_nom text, p_couleur text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  UPDATE guildes SET nom = btrim(p_nom), couleur = p_couleur WHERE admin = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'guilde_pas_admin' USING ERRCODE = 'insufficient_privilege'; END IF;
END $f$;

CREATE FUNCTION public.guilde_inviter(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  INSERT INTO guilde_invitations (guilde_id, invite, invitant) VALUES (guilde_de(auth.uid()), p_user, auth.uid())
    ON CONFLICT (guilde_id, invite) DO NOTHING;
END $f$;

-- Répondre à une invitation : rejoindre (si l'on n'est dans aucune guilde) ou la retirer, en silence.
CREATE FUNCTION public.guilde_repondre(p_guilde uuid, p_rejoindre boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM guilde_invitations WHERE guilde_id = p_guilde AND invite = auth.uid()) THEN
    RAISE EXCEPTION 'guilde_sans_invitation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_rejoindre THEN
    IF guilde_de(auth.uid()) IS NOT NULL THEN RAISE EXCEPTION 'guilde_deja_dans_une' USING ERRCODE = 'unique_violation'; END IF;
    INSERT INTO guilde_membres (user_id, guilde_id) VALUES (auth.uid(), p_guilde);
    DELETE FROM guilde_invitations WHERE invite = auth.uid();
  ELSE
    DELETE FROM guilde_invitations WHERE guilde_id = p_guilde AND invite = auth.uid();
  END IF;
END $f$;

CREATE FUNCTION public.guilde_quitter() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  DELETE FROM guilde_membres WHERE user_id = auth.uid() $f$;

CREATE FUNCTION public.guilde_retirer_membre(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF p_user = auth.uid() OR NOT EXISTS (SELECT 1 FROM guildes g WHERE g.admin = auth.uid() AND g.id = guilde_de(p_user)) THEN
    RAISE EXCEPTION 'guilde_pas_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM guilde_membres WHERE user_id = p_user;
END $f$;

CREATE FUNCTION public.guilde_transmettre(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  UPDATE guildes SET admin = p_user WHERE admin = auth.uid() AND id = guilde_de(p_user);
  IF NOT FOUND THEN RAISE EXCEPTION 'guilde_pas_admin' USING ERRCODE = 'insufficient_privilege'; END IF;
END $f$;

-- Le défi de la semaine en cours, par l'administrateur (modifiable pendant la semaine).
CREATE FUNCTION public.guilde_choisir_defi(p_type text, p_n integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE g uuid;
BEGIN
  SELECT id INTO g FROM guildes WHERE admin = auth.uid();
  IF g IS NULL THEN RAISE EXCEPTION 'guilde_pas_admin' USING ERRCODE = 'insufficient_privilege'; END IF;
  INSERT INTO guilde_defis (guilde_id, semaine, type, n) VALUES (g, guilde_semaine_courante(), p_type, p_n)
    ON CONFLICT (guilde_id, semaine) DO UPDATE SET type = EXCLUDED.type, n = EXCLUDED.n, choisi_le = now();
END $f$;

CREATE FUNCTION public.guilde_choisir_rang(p_rang text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  UPDATE guilde_membres SET rang = p_rang WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'guilde_pas_membre' USING ERRCODE = 'insufficient_privilege'; END IF;
END $f$;

-- ── LES LECTURES ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Ma guilde (zéro ou une ligne). `admin` : moi seulement, pour mes boutons — jamais affiché.
CREATE FUNCTION public.guilde_moi()
RETURNS TABLE(id uuid, nom text, blason text, couleur text, admin boolean, membres integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT g.id, g.nom, g.blason, g.couleur, g.admin = auth.uid(),
         (SELECT count(*)::int FROM guilde_membres m WHERE m.guilde_id = g.id)
  FROM guildes g WHERE g.id = guilde_de(auth.uid()) $f$;

-- Les membres : pseudo, rang, titre du jeu (nul si le jeu est éteint). Ni chef, ni niveau, ni XP.
CREATE FUNCTION public.guilde_liste_membres()
RETURNS TABLE(user_id uuid, pseudo text, rang text, titre text, moi boolean, entre_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT m.user_id, p.username, m.rang, CASE WHEN p.jeu_actif THEN p.jeu_titre END, m.user_id = auth.uid(), m.entre_le
  FROM guilde_membres m JOIN profiles p ON p.id = m.user_id
  WHERE m.guilde_id = guilde_de(auth.uid()) AND p.deleted_at IS NULL
  ORDER BY m.entre_le, m.user_id $f$;

-- Mes invitations reçues : la guilde, qui m'invite, combien ils sont.
CREATE FUNCTION public.guilde_invitations_recues()
RETURNS TABLE(guilde_id uuid, nom text, blason text, couleur text, invitant text, membres integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT g.id, g.nom, g.blason, g.couleur, p.username, (SELECT count(*)::int FROM guilde_membres m WHERE m.guilde_id = g.id)
  FROM guilde_invitations i JOIN guildes g ON g.id = i.guilde_id JOIN profiles p ON p.id = i.invitant
  WHERE i.invite = auth.uid() AND NOT social_bloque(auth.uid(), i.invitant) ORDER BY i.cree_le $f$;

-- La semaine de ma guilde : le défi (le défi « seances » sans choix), la jauge, et « La guilde cette semaine ».
--   seances_faites / seances_prevues : la somme, membre par membre, de min(séances, prévues) et des prévues publiées ;
--   records_semaine : la somme des records publiés (sans dépasser la charge proposée) ;
--   exercices : les exercices différents faits à tous (séries de travail des séances terminées, non privées) ;
--   seances, medailles, tonnage_kg : les séances terminées, non privées, de la semaine (au moins une série de travail),
--   leurs séries médaillées (une par série, comme le fil), et Bilan.volumeKg.
CREATE FUNCTION public.guilde_semaine()
RETURNS TABLE(semaine date, defi text, n integer, seances_faites integer, seances_prevues integer, records_semaine integer,
              exercices integer, seances integer, medailles integer, tonnage_kg numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  WITH g AS (SELECT guilde_de(auth.uid()) AS id, guilde_semaine_courante() AS lundi),
  m AS (SELECT gm.user_id FROM guilde_membres gm, g WHERE gm.guilde_id = g.id),
  s AS (SELECT se.id FROM sessions se, g WHERE se.user_id IN (SELECT user_id FROM m) AND se.statut = 'terminee'
          AND se.visibilite <> 'private' AND (se.debut AT TIME ZONE 'Europe/Paris')::date >= g.lundi
          AND (se.debut AT TIME ZONE 'Europe/Paris')::date < g.lundi + 7
          AND EXISTS (SELECT 1 FROM sets t WHERE t.session_id = se.id AND coalesce(t.type_serie,'travail') = 'travail')),
  sc AS (SELECT x.* FROM guilde_scores x, g WHERE x.user_id IN (SELECT user_id FROM m) AND x.semaine = g.lundi)
  SELECT g.lundi, coalesce(d.type, 'seances'), d.n,
    (SELECT coalesce(sum(least(seances, prevues)), 0)::int FROM sc),
    (SELECT coalesce(sum(prevues), 0)::int FROM sc),
    (SELECT coalesce(sum(records_semaine), 0)::int FROM sc),
    (SELECT count(DISTINCT t.exercise_slug)::int FROM sets t WHERE t.session_id IN (SELECT id FROM s)
       AND coalesce(t.type_serie,'travail') = 'travail'),
    (SELECT count(*)::int FROM s),
    (SELECT count(DISTINCT r.set_id)::int FROM records r WHERE r.session_id IN (SELECT id FROM s)
       AND r.type IN ('charge_a_reps','reps_a_charge','charge_max','cap','duree_s','distance_m')),
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t WHERE t.session_id IN (SELECT id FROM s)
       AND coalesce(t.type_serie,'travail') = 'travail' AND t.charge_kg > 0 AND t.reps > 0)
  FROM g LEFT JOIN guilde_defis d ON d.guilde_id = g.id AND d.semaine = g.lundi
  WHERE g.id IS NOT NULL $f$;

-- La progression du mois : les nombres publiés pour le mois en cours (remise à zéro le 1er : un mois passé ne sort plus).
CREATE FUNCTION public.guilde_progression()
RETURNS TABLE(pseudo text, moi boolean, exercices integer, exercices_record integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT p.username, x.user_id = auth.uid(), x.exercices, x.exercices_record
  FROM guilde_scores x JOIN guilde_membres m ON m.user_id = x.user_id JOIN profiles p ON p.id = x.user_id
  WHERE m.guilde_id = guilde_de(auth.uid()) AND x.mois = guilde_mois_courant() AND p.deleted_at IS NULL $f$;

-- Le fil de la guilde : les règles du fil de v2_078 (terminées, non privées, 30 jours), sur les AUTRES membres.
CREATE FUNCTION public.guilde_fil()
RETURNS TABLE(session_id uuid, user_id uuid, pseudo text, titre text, debut timestamptz, fin timestamptz,
              tonnage_kg numeric, j_ai_reagi boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT s.id, s.user_id, p.username, s.titre, s.debut, s.fin,
    (SELECT coalesce(round(sum(t.charge_kg * t.reps), 2), 0) FROM sets t WHERE t.session_id=s.id AND coalesce(t.type_serie,'travail')='travail' AND t.charge_kg > 0 AND t.reps > 0),
    EXISTS (SELECT 1 FROM reactions_seance r WHERE r.session_id=s.id AND r.user_id=auth.uid())
  FROM sessions s JOIN profiles p ON p.id = s.user_id
  WHERE s.statut='terminee' AND s.visibilite <> 'private' AND s.debut >= now() - interval '30 days'
    AND s.user_id <> auth.uid() AND p.deleted_at IS NULL AND guilde_commune(auth.uid(), s.user_id)
  ORDER BY s.debut DESC LIMIT 200 $f$;

-- Les médailles d'une séance du fil de la guilde (les colonnes de social_records_seance).
CREATE FUNCTION public.guilde_records_seance(p_session uuid)
RETURNS TABLE(set_id uuid, battu_le timestamptz, exercise_slug text, type text, valeur numeric, charge numeric, reps integer, unite text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT r.set_id, r.battu_le, r.exercise_slug, r.type, r.valeur, r.charge, r.reps, r.unite FROM records r JOIN sessions s ON s.id=r.session_id
  WHERE r.session_id=p_session AND s.statut='terminee' AND s.visibilite <> 'private'
    AND guilde_commune(auth.uid(), s.user_id) $f$;

REVOKE ALL ON FUNCTION public.guilde_de(uuid), public.guilde_commune(uuid,uuid), public.guilde_semaine_courante(),
  public.guilde_mois_courant() FROM PUBLIC, anon;
-- La politique reactions_guilde s'évalue au nom de la personne : elle appelle guilde_peut_reagir.
REVOKE ALL ON FUNCTION public.guilde_peut_reagir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilde_peut_reagir(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.guilde_creer(text,text), public.guilde_modifier(text,text), public.guilde_inviter(uuid),
  public.guilde_repondre(uuid,boolean), public.guilde_quitter(), public.guilde_retirer_membre(uuid), public.guilde_transmettre(uuid),
  public.guilde_choisir_defi(text,integer), public.guilde_choisir_rang(text), public.guilde_moi(), public.guilde_liste_membres(),
  public.guilde_invitations_recues(), public.guilde_semaine(), public.guilde_progression(), public.guilde_fil(),
  public.guilde_records_seance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilde_creer(text,text), public.guilde_modifier(text,text), public.guilde_inviter(uuid),
  public.guilde_repondre(uuid,boolean), public.guilde_quitter(), public.guilde_retirer_membre(uuid), public.guilde_transmettre(uuid),
  public.guilde_choisir_defi(text,integer), public.guilde_choisir_rang(text), public.guilde_moi(), public.guilde_liste_membres(),
  public.guilde_invitations_recues(), public.guilde_semaine(), public.guilde_progression(), public.guilde_fil(),
  public.guilde_records_seance(uuid) TO authenticated;
-- Les fonctions de déclencheur ne s'appellent pas par l'API.
REVOKE ALL ON FUNCTION public.guilde_membres_avant_ajout(), public.guilde_membres_avant_modif(),
  public.guilde_membres_apres_depart(), public.guildes_avant_modif(), public.guilde_invitations_avant_ajout()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guildes, public.guilde_membres, public.guilde_invitations, public.guilde_defis FROM anon, authenticated;
REVOKE ALL ON TABLE public.guilde_scores FROM anon;

DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('guildes','guilde_membres','guilde_invitations','guilde_defis','guilde_scores')) <> 1 THEN
    RAISE EXCEPTION 'post-contrôle : une seule politique attendue (guilde_scores_miens)';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='reactions_seance') <> 4 THEN
    RAISE EXCEPTION 'post-contrôle : politiques attendues 4 sur reactions_seance';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('sessions','sets','records')
             AND policyname NOT IN ('sessions_owner','sets_owner','records_ajout','records_lecture')) THEN
    RAISE EXCEPTION 'post-contrôle : politique inattendue sur sessions/sets/records';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('guilde_membres_avant_ajout',
      'guilde_membres_avant_modif','guilde_membres_apres_depart','guildes_avant_modif','guilde_invitations_avant_ajout')) <> 5 THEN
    RAISE EXCEPTION 'post-contrôle : déclencheurs attendus 5';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name IN ('guildes','guilde_membres','guilde_invitations','guilde_defis','guilde_scores')
             AND column_name IN ('poids_corps_kg','note','rpe','ressenti','douleur')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite dans une table de la guilde';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'guilde%'
             AND p.proname NOT IN ('guilde_semaine_courante','guilde_mois_courant','guilde_membres_avant_modif')
             AND (NOT p.prosecdef OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'post-contrôle : fonction de guilde sans SECURITY DEFINER ou sans search_path';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'guilde%'
             AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR p.proconfig IS NULL)) THEN
    RAISE EXCEPTION 'post-contrôle : fonction de guilde ouverte à anon, ou sans search_path';
  END IF;
  -- Les colonnes rendues (RETURNS TABLE) sont dans proargnames.
  IF EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS a(nom)
             WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'guilde%'
             AND a.nom IN ('poids_corps_kg','note','rpe','ressenti','douleur')) THEN
    RAISE EXCEPTION 'post-contrôle : colonne interdite rendue';
  END IF;
END $$;
