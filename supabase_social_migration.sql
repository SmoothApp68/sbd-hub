-- ============================================================
-- SBD Elite Tracker — Module Social : Migration Supabase
-- ============================================================

-- 1. ENUM TYPES
-- ============================================================
CREATE TYPE visibility_level AS ENUM ('public', 'friends', 'private');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE activity_type AS ENUM ('session', 'pr', 'goal');
CREATE TYPE notification_type AS ENUM ('friend_accepted', 'reaction', 'comment', 'pr_beaten');

-- 2. TABLES
-- ============================================================

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  username_changed_at TIMESTAMPTZ,
  bio TEXT DEFAULT '' CHECK (char_length(bio) <= 200),
  visibility_bio visibility_level DEFAULT 'private',
  visibility_prs visibility_level DEFAULT 'private',
  visibility_programme visibility_level DEFAULT 'private',
  visibility_seances visibility_level DEFAULT 'private',
  visibility_stats visibility_level DEFAULT 'private',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  anonymized BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_username_trgm ON profiles USING gin(username gin_trgm_ops);

-- Enable pg_trgm for fuzzy/partial username search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- reserved_usernames
CREATE TABLE IF NOT EXISTS reserved_usernames (
  username TEXT UNIQUE NOT NULL,
  released_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_reserved_usernames_released ON reserved_usernames(released_at);

-- friendships
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status friendship_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, target_id),
  CHECK (requester_id <> target_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_target ON friendships(target_id);
CREATE INDEX idx_friendships_status ON friendships(status);

-- invite_codes
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invite_codes_code ON invite_codes(code);
CREATE INDEX idx_invite_codes_user ON invite_codes(user_id);

-- activity_feed
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_feed_user ON activity_feed(user_id);
CREATE INDEX idx_activity_feed_created ON activity_feed(created_at DESC);
CREATE INDEX idx_activity_feed_pinned ON activity_feed(pinned) WHERE pinned = TRUE;

-- reactions
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(activity_id, user_id, emoji)
);

CREATE INDEX idx_reactions_activity ON reactions(activity_id);

-- comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_activity ON comments(activity_id);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = FALSE;

-- leaderboard_snapshots
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  snapshot_week DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_user ON leaderboard_snapshots(user_id);
CREATE INDEX idx_leaderboard_week ON leaderboard_snapshots(snapshot_week);

-- 3. HELPER FUNCTIONS
-- ============================================================

-- Check if two users are friends (accepted)
CREATE OR REPLACE FUNCTION are_friends(uid1 UUID, uid2 UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((requester_id = uid1 AND target_id = uid2)
        OR (requester_id = uid2 AND target_id = uid1))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if a user is blocked (in either direction)
CREATE OR REPLACE FUNCTION is_blocked(uid1 UUID, uid2 UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'blocked'
      AND ((requester_id = uid1 AND target_id = uid2)
        OR (requester_id = uid2 AND target_id = uid1))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check visibility: returns true if viewer can see the section
CREATE OR REPLACE FUNCTION can_view_section(viewer_id UUID, owner_id UUID, vis visibility_level)
RETURNS BOOLEAN AS $$
BEGIN
  IF viewer_id = owner_id THEN RETURN TRUE; END IF;
  IF vis = 'public' THEN RETURN NOT is_blocked(viewer_id, owner_id); END IF;
  IF vis = 'friends' THEN RETURN are_friends(viewer_id, owner_id); END IF;
  RETURN FALSE; -- private
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Clean up expired reserved usernames (call periodically or via cron)
CREATE OR REPLACE FUNCTION cleanup_reserved_usernames()
RETURNS void AS $$
  DELETE FROM reserved_usernames WHERE released_at < NOW();
$$ LANGUAGE sql;

-- 4. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserved_usernames ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──

-- Anyone can read username (for search). Other fields filtered by visibility in app.
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    deleted_at IS NULL
    AND NOT is_blocked(auth.uid(), id)
  );

-- Users can insert their own profile
CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Users can update their own profile
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── FRIENDSHIPS ──

-- Users see their own friendships (excluding blocked-by-other)
CREATE POLICY friendships_select ON friendships FOR SELECT
  USING (
    requester_id = auth.uid() OR target_id = auth.uid()
  );

-- Users can create friend requests
CREATE POLICY friendships_insert ON friendships FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- Users can update friendships they're involved in (accept, block)
CREATE POLICY friendships_update ON friendships FOR UPDATE
  USING (
    requester_id = auth.uid() OR target_id = auth.uid()
  );

-- Users can delete friendships they're involved in
CREATE POLICY friendships_delete ON friendships FOR DELETE
  USING (
    requester_id = auth.uid() OR target_id = auth.uid()
  );

-- ── INVITE CODES ──

-- Users see their own codes + can look up any code by value
CREATE POLICY invite_codes_select ON invite_codes FOR SELECT
  USING (
    user_id = auth.uid() OR used_by = auth.uid() OR TRUE
  );

-- Users can create their own codes
CREATE POLICY invite_codes_insert ON invite_codes FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update codes (mark as used)
CREATE POLICY invite_codes_update ON invite_codes FOR UPDATE
  USING (TRUE);

-- ── ACTIVITY FEED ──

-- Users see posts from friends + own posts, excluding blocked
CREATE POLICY activity_feed_select ON activity_feed FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      are_friends(auth.uid(), user_id)
      AND NOT is_blocked(auth.uid(), user_id)
    )
  );

-- Users can create their own posts
CREATE POLICY activity_feed_insert ON activity_feed FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own posts
CREATE POLICY activity_feed_update ON activity_feed FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own posts
CREATE POLICY activity_feed_delete ON activity_feed FOR DELETE
  USING (user_id = auth.uid());

-- ── REACTIONS ──

-- Visible if the parent post is visible (simplified: user can see reactions on visible posts)
CREATE POLICY reactions_select ON reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activity_feed af
      WHERE af.id = activity_id
        AND (af.user_id = auth.uid() OR are_friends(auth.uid(), af.user_id))
        AND NOT is_blocked(auth.uid(), af.user_id)
    )
  );

-- Users can add reactions
CREATE POLICY reactions_insert ON reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own reactions
CREATE POLICY reactions_delete ON reactions FOR DELETE
  USING (user_id = auth.uid());

-- ── COMMENTS ──

-- Visible if parent post is visible
CREATE POLICY comments_select ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activity_feed af
      WHERE af.id = activity_id
        AND (af.user_id = auth.uid() OR are_friends(auth.uid(), af.user_id))
        AND NOT is_blocked(auth.uid(), af.user_id)
    )
  );

-- Users can add comments
CREATE POLICY comments_insert ON comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own comments OR comments on their own posts
CREATE POLICY comments_delete ON comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM activity_feed af
      WHERE af.id = activity_id AND af.user_id = auth.uid()
    )
  );

-- ── NOTIFICATIONS ──

-- Users see only their own notifications
CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- System/triggers can insert (via service role), but also allow user context
CREATE POLICY notifications_insert ON notifications FOR INSERT
  WITH CHECK (TRUE);

-- Users can update their own (mark as read)
CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own
CREATE POLICY notifications_delete ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- ── LEADERBOARD SNAPSHOTS ──

-- Users can see snapshots of friends + own
CREATE POLICY leaderboard_select ON leaderboard_snapshots FOR SELECT
  USING (
    user_id = auth.uid()
    OR are_friends(auth.uid(), user_id)
  );

-- Users can insert their own snapshots
CREATE POLICY leaderboard_insert ON leaderboard_snapshots FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── RESERVED USERNAMES ──

-- Anyone can read (to check availability)
CREATE POLICY reserved_usernames_select ON reserved_usernames FOR SELECT
  USING (TRUE);

-- Only system inserts (via triggers), but allow authenticated users
CREATE POLICY reserved_usernames_insert ON reserved_usernames FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY reserved_usernames_delete ON reserved_usernames FOR DELETE
  USING (TRUE);
