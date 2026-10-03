import { supabase } from './supabase';
import type {
  Campaign, CampaignUser, Location, InteractionSource, QRCode,
  Scan, PointTransaction, Mission, MissionProgress, Reward,
  RewardEntry, RewardClaim, Badge, UserBadge, ReferralCode,
  Referral, ActivityEvent, LeaderboardEntry, Profile,
} from '@/types';

// ============ AUTH ============
export const getSession = () => supabase.auth.getSession();
export const getCurrentUser = () => supabase.auth.getUser();
export const onAuthStateChange = (cb: Parameters<typeof supabase.auth.onAuthStateChange>[0]) =>
  supabase.auth.onAuthStateChange(cb);
export const signOut = () => supabase.auth.signOut();

export async function signUp(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  if (data.user) {
    await supabase.from('profiles').upsert({
      user_id: data.user.id,
      display_name: displayName,
    });
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ============ PROFILES ============
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function upsertProfile(profile: Partial<Profile> & { user_id: string }) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Profile;
}

// ============ CAMPAIGNS ============
export async function getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Campaign[];
}

export async function getActiveCampaigns(): Promise<Campaign[]> {
  return getCampaigns();
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Campaign | null;
}

// ============ CAMPAIGN USERS ============
export async function getCampaignUser(campaignId: string, userId: string): Promise<CampaignUser | null> {
  const { data, error } = await supabase
    .from('campaign_users')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as CampaignUser | null;
}

export async function joinCampaign(campaignId: string, userId: string): Promise<CampaignUser> {
  const { data, error } = await supabase
    .from('campaign_users')
    .insert({ campaign_id: campaignId, user_id: userId })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as CampaignUser;
}

export async function ensureCampaignUser(campaignId: string, userId: string): Promise<CampaignUser> {
  const existing = await getCampaignUser(campaignId, userId);
  if (existing) return existing;
  return joinCampaign(campaignId, userId);
}

// ============ LOCATIONS ============
export async function getLocations(campaignId: string): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as Location[];
}

// ============ INTERACTION SOURCES ============
export async function getInteractionSources(campaignId: string): Promise<InteractionSource[]> {
  const { data, error } = await supabase
    .from('interaction_sources')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as InteractionSource[];
}

// ============ QR CODES ============
export async function getQRCode(code: string): Promise<QRCode | null> {
  const { data, error } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .maybeSingle();
  if (error) throw error;
  return data as QRCode | null;
}

// ============ SCANS ============
export async function getUserScans(campaignId: string, userId: string): Promise<Scan[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Scan[];
}

// ============ POINT TRANSACTIONS ============
export async function getPointTransactions(campaignId: string, userId: string): Promise<PointTransaction[]> {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as PointTransaction[];
}

// ============ MISSIONS ============
export async function getMissions(campaignId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('target_count', { ascending: true });
  if (error) throw error;
  return data as Mission[];
}

export async function getMissionProgress(campaignId: string, userId: string): Promise<MissionProgress[]> {
  const { data, error } = await supabase
    .from('mission_progress')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);
  if (error) throw error;
  return data as MissionProgress[];
}

// ============ REWARDS ============
export async function getRewards(campaignId: string): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('points_required', { ascending: true });
  if (error) throw error;
  return data as Reward[];
}

export async function getRewardEntries(campaignId: string, userId: string): Promise<RewardEntry[]> {
  const { data, error } = await supabase
    .from('reward_entries')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as RewardEntry[];
}

export async function getRewardClaims(campaignId: string, userId: string): Promise<RewardClaim[]> {
  const { data, error } = await supabase
    .from('reward_claims')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as RewardClaim[];
}

export function calculateEntryTotal(entries: RewardEntry[]): number {
  return entries.reduce((sum, e) => sum + e.entries, 0);
}

export async function claimReward(campaignId: string, userId: string, reward: Reward): Promise<RewardClaim> {
  const claimCode = `HB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const { data, error } = await supabase
    .from('reward_claims')
    .insert({
      campaign_id: campaignId,
      user_id: userId,
      reward_id: reward.id,
      points_used: reward.points_required,
      claim_code: claimCode,
      status: 'pending',
    })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as RewardClaim;
}

// ============ BADGES ============
export async function getBadges(campaignId: string): Promise<Badge[]> {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('name');
  if (error) throw error;
  return data as Badge[];
}

export async function getUserBadges(campaignId: string, userId: string): Promise<UserBadge[]> {
  const { data, error } = await supabase
    .from('user_badges')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);
  if (error) throw error;
  return data as UserBadge[];
}

// ============ LEADERBOARD ============
export async function getLeaderboard(campaignId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('campaign_leaderboard')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('points', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as LeaderboardEntry[];
}

export async function getMyLeaderboardPosition(campaignId: string, userId: string): Promise<LeaderboardEntry | null> {
  const { data, error } = await supabase
    .from('campaign_leaderboard')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as LeaderboardEntry | null;
}

// ============ REFERRALS ============
export async function getReferralCode(campaignId: string, userId: string): Promise<ReferralCode | null> {
  const { data, error } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as ReferralCode | null;
}

export async function createReferralCode(campaignId: string, userId: string, displayName: string): Promise<ReferralCode> {
  const code = `HB-${displayName.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const { data, error } = await supabase
    .from('referral_codes')
    .insert({ campaign_id: campaignId, user_id: userId, code })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ReferralCode;
}

export async function getReferrals(campaignId: string, userId: string): Promise<Referral[]> {
  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Referral[];
}

// ============ ACTIVITY EVENTS ============
export async function getActivityEvents(campaignId: string, userId: string): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data as ActivityEvent[];
}

export async function logActivity(campaignId: string, userId: string, eventType: string, metadata?: Record<string, unknown>) {
  try {
    await supabase.from('activity_events').insert({
      campaign_id: campaignId,
      user_id: userId,
      event_type: eventType,
      metadata: metadata || {},
    });
  } catch {
    // Non-critical — don't break UX
  }
}

// ============ SCAN PROCESSING ============
export interface ScanResult {
  success: boolean;
  message: string;
  pointsAwarded: number;
  sourceName: string;
  sourceType: string;
  isNew: boolean;
  campaignId: string;
}

export async function processScan(campaignId: string, userId: string, code: string): Promise<ScanResult> {
  const trimmedCode = code.toUpperCase().trim();
  const qr = await getQRCode(trimmedCode);
  if (!qr) {
    return { success: false, message: 'Invalid QR code. Please check and try again.', pointsAwarded: 0, sourceName: '', sourceType: '', isNew: false, campaignId };
  }
  if (qr.campaign_id !== campaignId) {
    return { success: false, message: 'This QR code belongs to a different campaign.', pointsAwarded: 0, sourceName: '', sourceType: '', isNew: false, campaignId };
  }

  // Check for duplicate scan
  const existingScans = await getUserScans(campaignId, userId);
  const alreadyScanned = existingScans.some(s => s.qr_code_id === qr.id);
  if (alreadyScanned) {
    return { success: false, message: 'You already scanned this QR code.', pointsAwarded: 0, sourceName: '', sourceType: '', isNew: false, campaignId };
  }

  // Get interaction source for points
  let sourceName = 'QR Code';
  let sourceType = 'generic';
  let points = 10;
  if (qr.interaction_source_id) {
    const { data: src } = await supabase
      .from('interaction_sources')
      .select('*')
      .eq('id', qr.interaction_source_id)
      .maybeSingle();
    if (src) {
      sourceName = src.name;
      sourceType = src.source_type;
      points = src.points;
    }
  }

  // Insert scan
  const { error: scanError } = await supabase.from('scans').insert({
    campaign_id: campaignId,
    user_id: userId,
    qr_code_id: qr.id,
    interaction_source_id: qr.interaction_source_id,
    points_awarded: points,
  });
  if (scanError) throw scanError;

  // Award points via transaction
  const { error: ptError } = await supabase.from('point_transactions').insert({
    campaign_id: campaignId,
    user_id: userId,
    points,
    reason: `Scanned: ${sourceName}`,
  });
  if (ptError) throw ptError;

  // Update campaign user points
  const campaignUser = await getCampaignUser(campaignId, userId);
  if (campaignUser) {
    await supabase
      .from('campaign_users')
      .update({ points: campaignUser.points + points })
      .eq('id', campaignUser.id);
  }

  // Update mission progress for scan_count missions
  const missions = await getMissions(campaignId);
  const totalScans = existingScans.length + 1;
  for (const mission of missions) {
    if (mission.mission_type !== 'scan_count') continue;
    const existingProgress = await getMissionProgress(campaignId, userId);
    const mp = existingProgress.find(p => p.mission_id === mission.id);
    if (mp && mp.completed) continue;

    const newProgress = Math.min(totalScans, mission.target_count);
    const completed = newProgress >= mission.target_count;

    if (mp) {
      await supabase
        .from('mission_progress')
        .update({
          progress: newProgress,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mp.id);
    } else {
      await supabase.from('mission_progress').insert({
        mission_id: mission.id,
        user_id: userId,
        campaign_id: campaignId,
        progress: newProgress,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      });
    }

    if (completed) {
      // Award mission points
      await supabase.from('point_transactions').insert({
        campaign_id: campaignId,
        user_id: userId,
        points: mission.points_reward,
        reason: `Mission completed: ${mission.title}`,
      });
      if (campaignUser) {
        await supabase
          .from('campaign_users')
          .update({ points: campaignUser.points + points + mission.points_reward })
          .eq('id', campaignUser.id);
      }
    }
  }

  // Update leaderboard
  const updatedPoints = (campaignUser?.points || 0) + points;
  const profile = await getProfile(userId);
  await supabase.from('campaign_leaderboard').upsert({
    campaign_id: campaignId,
    user_id: userId,
    display_name: profile?.display_name || 'Player',
    avatar_url: profile?.avatar_url || '',
    points: updatedPoints,
    updated_at: new Date().toISOString(),
  });

  // Log activity
  await logActivity(campaignId, userId, 'scan', { source_name: sourceName, points });

  return {
    success: true,
    message: `You earned ${points} points from ${sourceName}!`,
    pointsAwarded: points,
    sourceName,
    sourceType,
    isNew: true,
    campaignId,
  };
}

// ============ DASHBOARD ============
export interface CampaignDashboard {
  campaign: Campaign | null;
  campaignUser: CampaignUser | null;
  missions: Mission[];
  missionProgress: MissionProgress[];
  rewards: Reward[];
  locations: Location[];
  interactionSources: InteractionSource[];
  rewardEntries: RewardEntry[];
  rewardClaims: RewardClaim[];
  badges: Badge[];
  userBadges: UserBadge[];
  scans: Scan[];
  leaderboard: LeaderboardEntry[];
  myLeaderboardPosition: LeaderboardEntry | null;
  profile: Profile | null;
}

export async function getCampaignDashboard(campaignId: string, userId: string): Promise<CampaignDashboard> {
  const [
    campaignResult, campaignUserResult, missionsResult, missionsProgressResult,
    rewardsResult, locationsResult, sourcesResult, rewardEntriesResult,
    rewardClaimsResult, badgesResult, userBadgesResult, scansResult,
    leaderboardResult, myPositionResult, profileResult,
  ] = await Promise.all([
    getCampaign(campaignId),
    getCampaignUser(campaignId, userId),
    getMissions(campaignId),
    getMissionProgress(campaignId, userId),
    getRewards(campaignId),
    getLocations(campaignId),
    getInteractionSources(campaignId),
    getRewardEntries(campaignId, userId),
    getRewardClaims(campaignId, userId),
    getBadges(campaignId),
    getUserBadges(campaignId, userId),
    getUserScans(campaignId, userId),
    getLeaderboard(campaignId),
    getMyLeaderboardPosition(campaignId, userId),
    getProfile(userId),
  ]);

  return {
    campaign: campaignResult,
    campaignUser: campaignUserResult,
    missions: missionsResult,
    missionProgress: missionsProgressResult,
    rewards: rewardsResult,
    locations: locationsResult,
    interactionSources: sourcesResult,
    rewardEntries: rewardEntriesResult,
    rewardClaims: rewardClaimsResult,
    badges: badgesResult,
    userBadges: userBadgesResult,
    scans: scansResult,
    leaderboard: leaderboardResult,
    myLeaderboardPosition: myPositionResult,
    profile: profileResult,
  };
}
