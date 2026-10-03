export interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string;
  city: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  title: string;
  movie_title: string;
  description: string;
  hero_image_url: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

export interface CampaignUser {
  id: string;
  campaign_id: string;
  user_id: string;
  points: number;
  joined_at: string;
}

export interface Location {
  id: string;
  campaign_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  is_active: boolean;
}

export interface InteractionSource {
  id: string;
  campaign_id: string;
  location_id: string | null;
  name: string;
  source_type: string;
  points: number;
  is_active: boolean;
}

export interface QRCode {
  id: string;
  campaign_id: string;
  interaction_source_id: string | null;
  code: string;
}

export interface Scan {
  id: string;
  campaign_id: string;
  user_id: string;
  qr_code_id: string | null;
  interaction_source_id: string | null;
  points_awarded: number;
  created_at: string;
}

export interface PointTransaction {
  id: string;
  campaign_id: string;
  user_id: string;
  points: number;
  reason: string;
  scan_id: string | null;
  created_at: string;
}

export interface Mission {
  id: string;
  campaign_id: string;
  title: string;
  description: string;
  mission_type: string;
  target_count: number;
  points_reward: number;
  icon_name: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

export interface MissionProgress {
  id: string;
  mission_id: string;
  user_id: string;
  campaign_id: string;
  progress: number;
  completed: boolean;
  completed_at: string | null;
}

export interface Reward {
  id: string;
  campaign_id: string;
  title: string;
  description: string;
  reward_type: 'guaranteed' | 'lucky_draw';
  points_required: number;
  image_url: string;
  stock: number;
  is_active: boolean;
}

export interface RewardEntry {
  id: string;
  campaign_id: string;
  user_id: string;
  reward_id: string;
  entries: number;
  reason: string;
  created_at: string;
}

export interface RewardClaim {
  id: string;
  campaign_id: string;
  user_id: string;
  reward_id: string;
  status: 'pending' | 'approved' | 'delivered' | 'rejected';
  claim_code: string;
  points_used: number;
  created_at: string;
}

export interface Badge {
  id: string;
  campaign_id: string;
  name: string;
  description: string;
  icon_name: string;
  requirement: string;
}

export interface UserBadge {
  id: string;
  badge_id: string;
  user_id: string;
  campaign_id: string;
  earned_at: string;
}

export interface ReferralCode {
  id: string;
  campaign_id: string;
  user_id: string;
  code: string;
}

export interface Referral {
  id: string;
  campaign_id: string;
  referrer_id: string;
  referee_id: string | null;
  code: string;
  status: 'pending' | 'completed' | 'rewarded';
  points_awarded: number;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  campaign_id: string | null;
  user_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LeaderboardEntry {
  id: string;
  campaign_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string;
  points: number;
  rank: number;
}
