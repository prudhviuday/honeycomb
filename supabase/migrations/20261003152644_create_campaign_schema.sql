/*
# Honeybadger Media — Core Campaign Schema

1. New Tables
- `profiles` — user profile data (display name, avatar, city, phone)
- `campaigns` — campaign definitions (movie, title, description, status, dates)
- `campaign_users` — user participation in campaigns (points, joined_at)
- `locations` — geographic campaign locations with lat/lng
- `interaction_sources` — trackable physical/digital touchpoints (location, poster, product, etc.)
- `qr_codes` — QR identifiers linked to campaigns and interaction sources
- `scans` — scan records (user, qr_code, campaign, source, points_awarded)
- `point_transactions` — point ledger per campaign user
- `missions` — campaign challenges with target counts and point rewards
- `mission_progress` — user progress on missions
- `rewards` — available rewards (guaranteed or lucky_draw) with point thresholds
- `reward_entries` — accumulated entries for lucky draw rewards
- `reward_claims` — actual reward claims with status and claim code
- `badges` — achievement definitions
- `user_badges` — badges earned by users
- `referral_codes` — user referral codes per campaign
- `referrals` — referral relationships
- `activity_events` — generic activity log
- `campaign_leaderboard` — leaderboard view/table per campaign

2. Security
- RLS enabled on all tables.
- Profiles: owner-scoped (auth.uid = user_id).
- Campaign data (campaigns, locations, interaction_sources, qr_codes, missions, rewards, badges): publicly readable (anon + authenticated SELECT), writes restricted to authenticated where appropriate.
- User-participation tables (campaign_users, scans, point_transactions, mission_progress, reward_entries, reward_claims, user_badges, referrals, activity_events, referral_codes): owner-scoped SELECT/INSERT, authenticated only.
- Leaderboard: publicly readable.

3. Important Notes
- `campaigns` uses `active` (boolean), NOT `is_active`.
- `missions`, `rewards`, `locations`, `interaction_sources` use `is_active`.
- Owner columns default to `auth.uid()` so inserts from the client work without explicitly passing user_id.
*/

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text DEFAULT '',
  city text DEFAULT '',
  phone text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ CAMPAIGNS ============
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  movie_title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  hero_image_url text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz DEFAULT now() + interval '90 days',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select_all" ON campaigns;
CREATE POLICY "campaigns_select_all" ON campaigns FOR SELECT TO anon, authenticated USING (true);

-- ============ CAMPAIGN USERS ============
CREATE TABLE IF NOT EXISTS campaign_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  points int NOT NULL DEFAULT 0,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);
ALTER TABLE campaign_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_users_select_own" ON campaign_users;
CREATE POLICY "campaign_users_select_own" ON campaign_users FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "campaign_users_insert_own" ON campaign_users;
CREATE POLICY "campaign_users_insert_own" ON campaign_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "campaign_users_update_own" ON campaign_users;
CREATE POLICY "campaign_users_update_own" ON campaign_users FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ LOCATIONS ============
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text DEFAULT '',
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  category text DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_select_all" ON locations;
CREATE POLICY "locations_select_all" ON locations FOR SELECT TO anon, authenticated USING (true);

-- ============ INTERACTION SOURCES ============
CREATE TABLE IF NOT EXISTS interaction_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'generic',
  points int NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE interaction_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interaction_sources_select_all" ON interaction_sources;
CREATE POLICY "interaction_sources_select_all" ON interaction_sources FOR SELECT TO anon, authenticated USING (true);

-- ============ QR CODES ============
CREATE TABLE IF NOT EXISTS qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  interaction_source_id uuid REFERENCES interaction_sources(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_codes_select_all" ON qr_codes;
CREATE POLICY "qr_codes_select_all" ON qr_codes FOR SELECT TO anon, authenticated USING (true);

-- ============ SCANS ============
CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  qr_code_id uuid REFERENCES qr_codes(id) ON DELETE SET NULL,
  interaction_source_id uuid REFERENCES interaction_sources(id) ON DELETE SET NULL,
  points_awarded int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scans_select_own" ON scans;
CREATE POLICY "scans_select_own" ON scans FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "scans_insert_own" ON scans;
CREATE POLICY "scans_insert_own" ON scans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ POINT TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  points int NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  scan_id uuid REFERENCES scans(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "point_transactions_select_own" ON point_transactions;
CREATE POLICY "point_transactions_select_own" ON point_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "point_transactions_insert_own" ON point_transactions;
CREATE POLICY "point_transactions_insert_own" ON point_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ MISSIONS ============
CREATE TABLE IF NOT EXISTS missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  mission_type text NOT NULL DEFAULT 'scan_count',
  target_count int NOT NULL DEFAULT 1,
  points_reward int NOT NULL DEFAULT 50,
  icon_name text DEFAULT 'Target',
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz DEFAULT now() + interval '90 days',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "missions_select_all" ON missions;
CREATE POLICY "missions_select_all" ON missions FOR SELECT TO anon, authenticated USING (true);

-- ============ MISSION PROGRESS ============
CREATE TABLE IF NOT EXISTS mission_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  progress int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(mission_id, user_id)
);
ALTER TABLE mission_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mission_progress_select_own" ON mission_progress;
CREATE POLICY "mission_progress_select_own" ON mission_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "mission_progress_insert_own" ON mission_progress;
CREATE POLICY "mission_progress_insert_own" ON mission_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "mission_progress_update_own" ON mission_progress;
CREATE POLICY "mission_progress_update_own" ON mission_progress FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ REWARDS ============
CREATE TABLE IF NOT EXISTS rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  reward_type text NOT NULL DEFAULT 'guaranteed' CHECK (reward_type IN ('guaranteed', 'lucky_draw')),
  points_required int NOT NULL DEFAULT 100,
  image_url text DEFAULT '',
  stock int DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rewards_select_all" ON rewards;
CREATE POLICY "rewards_select_all" ON rewards FOR SELECT TO anon, authenticated USING (true);

-- ============ REWARD ENTRIES ============
CREATE TABLE IF NOT EXISTS reward_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  entries int NOT NULL DEFAULT 1,
  reason text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reward_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reward_entries_select_own" ON reward_entries;
CREATE POLICY "reward_entries_select_own" ON reward_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "reward_entries_insert_own" ON reward_entries;
CREATE POLICY "reward_entries_insert_own" ON reward_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ REWARD CLAIMS ============
CREATE TABLE IF NOT EXISTS reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'delivered', 'rejected')),
  claim_code text DEFAULT '',
  points_used int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reward_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reward_claims_select_own" ON reward_claims;
CREATE POLICY "reward_claims_select_own" ON reward_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "reward_claims_insert_own" ON reward_claims;
CREATE POLICY "reward_claims_insert_own" ON reward_claims FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reward_claims_update_own" ON reward_claims;
CREATE POLICY "reward_claims_update_own" ON reward_claims FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ BADGES ============
CREATE TABLE IF NOT EXISTS badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  icon_name text DEFAULT 'Award',
  requirement text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges_select_all" ON badges;
CREATE POLICY "badges_select_all" ON badges FOR SELECT TO anon, authenticated USING (true);

-- ============ USER BADGES ============
CREATE TABLE IF NOT EXISTS user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(badge_id, user_id)
);
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_badges_select_own" ON user_badges;
CREATE POLICY "user_badges_select_own" ON user_badges FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_badges_insert_own" ON user_badges;
CREATE POLICY "user_badges_insert_own" ON user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ REFERRAL CODES ============
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_codes_select_own" ON referral_codes;
CREATE POLICY "referral_codes_select_own" ON referral_codes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "referral_codes_insert_own" ON referral_codes;
CREATE POLICY "referral_codes_insert_own" ON referral_codes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ REFERRALS ============
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rewarded')),
  points_awarded int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals_select_own" ON referrals;
CREATE POLICY "referrals_select_own" ON referrals FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referee_id);
DROP POLICY IF EXISTS "referrals_insert_own" ON referrals;
CREATE POLICY "referrals_insert_own" ON referrals FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);

-- ============ ACTIVITY EVENTS ============
CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text DEFAULT '',
  entity_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_events_select_own" ON activity_events;
CREATE POLICY "activity_events_select_own" ON activity_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "activity_events_insert_own" ON activity_events;
CREATE POLICY "activity_events_insert_own" ON activity_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ CAMPAIGN LEADERBOARD ============
-- A materialized view-like table that can be populated by edge functions or triggers.
-- For now, we make it a regular table readable by anyone.
CREATE TABLE IF NOT EXISTS campaign_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text DEFAULT '',
  points int NOT NULL DEFAULT 0,
  rank int NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);
ALTER TABLE campaign_leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaderboard_select_all" ON campaign_leaderboard;
CREATE POLICY "leaderboard_select_all" ON campaign_leaderboard FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "leaderboard_insert_own" ON campaign_leaderboard;
CREATE POLICY "leaderboard_insert_own" ON campaign_leaderboard FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "leaderboard_update_own" ON campaign_leaderboard;
CREATE POLICY "leaderboard_update_own" ON campaign_leaderboard FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_campaign_users_campaign ON campaign_users(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_users_user ON campaign_users(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_user ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_campaign ON scans(campaign_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_mission_progress_user ON mission_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_campaign ON campaign_leaderboard(campaign_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_locations_campaign ON locations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_interaction_sources_campaign ON interaction_sources(campaign_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code);
