-- v2_107_blocage_groupe (22/10/2026, Claude.ai) — « deux membres qui se bloquent », constat ouvert de l'audit du 16/10.
-- Diagnostic : claude/DIAG-BLOCAGE-MEMBRES-2026-10-22.md. Décision d'Aurélien (22/10, 23 h) : dans la GUILDE, personne
-- ne part (rien ne change ici). Dans le GROUPE éphémère, deux personnes qui se bloquent ne se voient plus :
-- 1. groupe_etat : ne rend plus un membre qui a un blocage avec moi (dans un sens ou dans l'autre). La ligne reste en
--    base (une place « fermée » sert encore à « Faite en groupe avec … ») ; seul l'écran ne la montre plus.
-- 2. groupe_invitations_recues : une invitation vers un groupe où un membre a un blocage avec moi ne s'affiche plus
--    (aujourd'hui elle s'affiche, puis l'entrée est refusée) — comme v2_094 pour la guilde.
-- 3. groupe_apres_blocage (le déclencheur) : retire aussi les invitations d'un tiers vers l'un, dans un groupe où
--    l'autre est membre.
-- Même signature, même retour, mêmes droits (CREATE OR REPLACE sur la définition existante, par remplacement de texte).
-- Pré-contrôle : les trois corps sont exactement ceux lus le 22/10 à 23 h (md5). Les récaps figés ne changent pas.
-- Essai à blanc : __ESSAI__ = true (tout est annulé) ; pour de vrai : false.
DO $$
DECLARE
  v_essai boolean := __ESSAI__;
  d text; n int;
  nl constant text := chr(13) || chr(10);
  -- 1. groupe_etat
  etat_avant constant text := 'WHERE m.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL';
  etat_apres constant text := 'WHERE m.groupe_id = groupe_de(auth.uid()) AND p.deleted_at IS NULL'
    || ' AND (m.user_id = auth.uid() OR NOT social_bloque(auth.uid(), m.user_id))';
  -- 2. groupe_invitations_recues
  inv_avant constant text := 'AND groupe_fini_le(i.groupe_id) IS NULL';
  inv_apres constant text := 'AND groupe_fini_le(i.groupe_id) IS NULL AND NOT groupe_bloque_avec(i.groupe_id, auth.uid())';
  -- 3. groupe_apres_blocage
  dec_avant constant text := '  RETURN NULL;';
  dec_apres text;
BEGIN
  dec_apres := '  DELETE FROM groupe_invitations i WHERE (i.invite = NEW.bloqueur AND EXISTS (SELECT 1 FROM groupe_membres x'
    || ' WHERE x.groupe_id = i.groupe_id AND x.user_id = NEW.bloque))' || nl
    || '    OR (i.invite = NEW.bloque AND EXISTS (SELECT 1 FROM groupe_membres x'
    || ' WHERE x.groupe_id = i.groupe_id AND x.user_id = NEW.bloqueur));' || nl
    || '  RETURN NULL;';

  -- ── Pré-contrôles ──
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'groupe_etat' AND md5(p.prosrc) = 'f5b243600e3ddc2a8cff5187abfd0a20')
      OR (p.proname = 'groupe_invitations_recues' AND md5(p.prosrc) = 'a9ef25bf256db3ec2bbb3a0ed0b7a466')
      OR (p.proname = 'groupe_apres_blocage' AND md5(p.prosrc) = '1f7fc2983af8802eaa38b775bae8fed7'));
  IF n <> 3 THEN RAISE EXCEPTION 'pré-contrôle : % corps sur 3 ont la forme attendue (déjà passée, ou modifiée depuis le 22/10)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('social_bloque', 'groupe_bloque_avec');
  IF n <> 2 THEN RAISE EXCEPTION 'pré-contrôle : social_bloque ou groupe_bloque_avec absente'; END IF;
  SELECT count(*) INTO n FROM pg_trigger WHERE tgrelid = 'public.blocages'::regclass AND tgname = 'groupe_apres_blocage' AND NOT tgisinternal;
  IF n <> 1 THEN RAISE EXCEPTION 'pré-contrôle : le déclencheur groupe_apres_blocage est absent'; END IF;

  -- ── 1. groupe_etat ──
  SELECT pg_get_functiondef('public.groupe_etat()'::regprocedure) INTO d;
  IF (length(d) - length(replace(d, etat_avant, ''))) / length(etat_avant) <> 1 THEN
    RAISE EXCEPTION 'pré-contrôle : le filtre de groupe_etat est introuvable'; END IF;
  EXECUTE replace(d, etat_avant, etat_apres);

  -- ── 2. groupe_invitations_recues ──
  SELECT pg_get_functiondef('public.groupe_invitations_recues()'::regprocedure) INTO d;
  IF (length(d) - length(replace(d, inv_avant, ''))) / length(inv_avant) <> 1 THEN
    RAISE EXCEPTION 'pré-contrôle : le filtre de groupe_invitations_recues est introuvable'; END IF;
  EXECUTE replace(d, inv_avant, inv_apres);

  -- ── 3. groupe_apres_blocage ──
  SELECT pg_get_functiondef('public.groupe_apres_blocage()'::regprocedure) INTO d;
  IF (length(d) - length(replace(d, dec_avant, ''))) / length(dec_avant) <> 1 THEN
    RAISE EXCEPTION 'pré-contrôle : le RETURN de groupe_apres_blocage est introuvable'; END IF;
  EXECUTE replace(d, dec_avant, dec_apres);

  -- ── Post-contrôles ──
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    AND p.proconfig = ARRAY['search_path=public']
    AND ((p.proname = 'groupe_etat' AND position(etat_apres IN p.prosrc) > 0
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      OR (p.proname = 'groupe_invitations_recues' AND position(inv_apres IN p.prosrc) > 0
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      OR (p.proname = 'groupe_apres_blocage' AND position('i.invite = NEW.bloqueur AND EXISTS' IN p.prosrc) > 0
          AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')))
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF n <> 3 THEN RAISE EXCEPTION 'post-contrôle : % fonction(s) sur 3 ont le nouveau corps et les droits attendus', n; END IF;

  IF v_essai THEN RAISE EXCEPTION '__ESSAI_OK__ : tout est passé ; annulé (essai à blanc)'; END IF;
  RAISE NOTICE 'v2_107 passée : le groupe ne montre plus un membre ni une invitation liés par un blocage';
END $$;
