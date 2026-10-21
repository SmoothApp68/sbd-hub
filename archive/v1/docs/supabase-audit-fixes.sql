-- ═══════════════════════════════════════════════════════════════
-- SBD Hub — Supabase Audit Fix-up Migration
-- Fixes identified during code-level audit (Phase 2)
-- Run in Supabase SQL Editor AFTER existing migrations
-- ═══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- P0-1: Create missing sbd_profiles table (cloud sync data)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sbd_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sbd_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sbd_profiles_select' AND tablename = 'sbd_profiles') THEN
    EXECUTE 'CREATE POLICY sbd_profiles_select ON sbd_profiles FOR SELECT USING (user_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sbd_profiles_insert' AND tablename = 'sbd_profiles') THEN
    EXECUTE 'CREATE POLICY sbd_profiles_insert ON sbd_profiles FOR INSERT WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sbd_profiles_update' AND tablename = 'sbd_profiles') THEN
    EXECUTE 'CREATE POLICY sbd_profiles_update ON sbd_profiles FOR UPDATE USING (user_id = auth.uid())';
  END IF;
END $$;

-- Enable realtime for sbd_profiles (used by startRealtimeSubscription)
ALTER PUBLICATION supabase_realtime ADD TABLE sbd_profiles;

-- ────────────────────────────────────────────────────────────
-- P0-2: Add UNIQUE constraint on leaderboard_snapshots
--        Required by JS upsert: onConflict: 'user_id,exercise_name,snapshot_week'
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_leaderboard_user_exercise_week'
  ) THEN
    ALTER TABLE leaderboard_snapshots
      ADD CONSTRAINT uq_leaderboard_user_exercise_week
      UNIQUE (user_id, exercise_name, snapshot_week);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- P0-3: Add missing UPDATE policy on leaderboard_snapshots
--        Required by upsert (insert OR update)
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'leaderboard_update' AND tablename = 'leaderboard_snapshots') THEN
    EXECUTE 'CREATE POLICY leaderboard_update ON leaderboard_snapshots FOR UPDATE USING (user_id = auth.uid())';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- P1-1: Fix invite_codes SELECT policy (remove OR TRUE)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS invite_codes_select ON invite_codes;
CREATE POLICY invite_codes_select ON invite_codes FOR SELECT
  USING (user_id = auth.uid() OR used_by = auth.uid());

-- ────────────────────────────────────────────────────────────
-- P1-2: Fix invite_codes UPDATE policy (restrict to unclaimed)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS invite_codes_update ON invite_codes;
CREATE POLICY invite_codes_update ON invite_codes FOR UPDATE
  USING (used_by IS NULL OR used_by = auth.uid());

-- ────────────────────────────────────────────────────────────
-- P1-3: Fix notifications INSERT policy (own notifications only)
-- ────────────────────────────────────────────────────────────
-- Note: If server-side triggers need to insert notifications for other
-- users, use a SECURITY DEFINER function instead of this policy.
-- For now, keeping INSERT open but adding a comment for awareness.
-- DROP POLICY IF EXISTS notifications_insert ON notifications;
-- CREATE POLICY notifications_insert ON notifications FOR INSERT
--   WITH CHECK (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- P1-4: Fix reserved_usernames INSERT/DELETE (restrict to service role)
-- ────────────────────────────────────────────────────────────
-- Note: These are currently used by JS client code directly.
-- Restricting requires refactoring to use a SECURITY DEFINER function.
-- Commenting out for now — implement when username change is refactored.
-- DROP POLICY IF EXISTS reserved_usernames_insert ON reserved_usernames;
-- DROP POLICY IF EXISTS reserved_usernames_delete ON reserved_usernames;

-- ────────────────────────────────────────────────────────────
-- P2: Add missing indexes for query performance
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_challenges_creator ON social_challenges(creator_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_leaderboard_exercise ON leaderboard_snapshots(exercise_name);

-- ────────────────────────────────────────────────────────────
-- P3: Auto-update updated_at trigger for profiles
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_updated_at') THEN
    CREATE TRIGGER trg_profiles_updated_at
      BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_friendships_updated_at') THEN
    CREATE TRIGGER trg_friendships_updated_at
      BEFORE UPDATE ON friendships
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
