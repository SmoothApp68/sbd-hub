-- ═══════════════════════════════════════════════════════════════
-- TrainHub — Chantier 3 : God Mode (Panel Admin)
-- À exécuter dans Supabase SQL Editor
-- Table utilisateurs = "profiles" (pas "users")
-- ═══════════════════════════════════════════════════════════════

-- 1. Ajouter les colonnes admin et tier à la table profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'member' CHECK (tier IN ('founder', 'early_adopter', 'member'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier_awarded_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Mettre l'admin en place (par username)
UPDATE profiles SET is_admin = true, tier = 'founder', tier_awarded_at = NOW()
WHERE username = 'aurel_br';

-- 3. Table des annonces
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id)
);

-- 4. Table des feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT false,
  min_tier TEXT DEFAULT 'member' CHECK (min_tier IN ('founder', 'early_adopter', 'member')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Feature flags par défaut
INSERT INTO feature_flags (name, description, enabled, min_tier) VALUES
  ('advanced_stats', 'Statistiques avancées (comparaison communauté, prédictions)', true, 'early_adopter'),
  ('exclusive_themes', 'Thèmes exclusifs (Gold, Silver)', true, 'early_adopter'),
  ('social_feed', 'Feed social avec posts des autres utilisateurs', true, 'member'),
  ('ai_coach', 'Coach IA intégré (futur)', false, 'founder')
ON CONFLICT (name) DO NOTHING;

-- 6. RLS Policies

-- Admin peut modifier le tier d'un autre profil
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_tier' AND tablename = 'profiles') THEN
    EXECUTE 'CREATE POLICY admin_update_tier ON profiles FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))';
  END IF;
END $$;

-- Admin peut gérer les annonces
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_announcements' AND tablename = 'announcements') THEN
    EXECUTE 'CREATE POLICY admin_manage_announcements ON announcements FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))';
  END IF;
END $$;

-- Tout le monde peut lire les annonces actives
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_active_announcements' AND tablename = 'announcements') THEN
    EXECUTE 'CREATE POLICY read_active_announcements ON announcements FOR SELECT USING (active = true)';
  END IF;
END $$;

-- Admin peut gérer les feature flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_flags' AND tablename = 'feature_flags') THEN
    EXECUTE 'CREATE POLICY admin_manage_flags ON feature_flags FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))';
  END IF;
END $$;

-- Tout le monde peut lire les feature flags
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read_flags' AND tablename = 'feature_flags') THEN
    EXECUTE 'CREATE POLICY read_flags ON feature_flags FOR SELECT USING (true)';
  END IF;
END $$;
