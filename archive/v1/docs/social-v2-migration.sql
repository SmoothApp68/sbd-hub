-- Social V2 Migration — Défis entre amis
-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS social_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('volume','reps','weight','frequency','custom')),
  target_value REAL,
  target_exercise TEXT,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES social_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_value REAL DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(challenge_id, user_id)
);

ALTER TABLE social_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;

-- Policies for social_challenges
CREATE POLICY challenges_select ON social_challenges FOR SELECT USING (TRUE);
CREATE POLICY challenges_insert ON social_challenges FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY challenges_delete ON social_challenges FOR DELETE USING (creator_id = auth.uid());

-- Policies for challenge_participants
CREATE POLICY participants_select ON challenge_participants FOR SELECT USING (TRUE);
CREATE POLICY participants_insert ON challenge_participants FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY participants_update ON challenge_participants FOR UPDATE USING (user_id = auth.uid());

-- Training status columns (for ÉTAPE 6)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS training_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS training_since TIMESTAMPTZ;
