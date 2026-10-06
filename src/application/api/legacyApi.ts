import { supabase } from './supabase';
import type {
  Campaign,
  CampaignUser,
  Location,
  InteractionSource,
  QRCode,
  Scan,
  PointTransaction,
  Mission,
  MissionProgress,
  Reward,
  RewardEntry,
  RewardClaim,
  Badge,
  UserBadge,
  ReferralCode,
  Referral,
  ActivityEvent,
  LeaderboardEntry,
  Profile,
} from '@/types';

/*
 * ============================================================
 * SUPABASE DATABASE <-> APP TYPE COMPATIBILITY
 * ============================================================
 *
 * The current Supabase database was created with a different
 * schema from the original API layer.
 *
 * Examples:
 *
 * campaign_users.points       -> points_balance
 * missions.name               -> title
 * missions.target_value       -> target_count
 * missions.reward_points      -> points_reward
 * mission_progress            -> no campaign_id
 * user_badges                 -> no campaign_id
 * scans.qr_id                 -> qr_code_id
 * scans.scanned_at            -> created_at
 * point_transactions.amount   -> points
 * point_transactions.description -> reason
 * reward_entries.entry_count  -> entries
 * reward_claims.claimed_at    -> created_at
 * referrals.referrer_user_id  -> referrer_id
 *
 * This file translates the real DB schema into the shape expected
 * by the existing frontend.
 */

/* ============================================================
   SMALL HELPERS
   ============================================================ */

function asAppType<T>(value: unknown): T {
  return value as T;
}

/* ============================================================
   AUTH
   ============================================================ */

export const getSession = () => supabase.auth.getSession();

export const getCurrentUser = () => supabase.auth.getUser();

export const onAuthStateChange = (
  cb: Parameters<typeof supabase.auth.onAuthStateChange>[0]
) => supabase.auth.onAuthStateChange(cb);

export const signOut = () => supabase.auth.signOut();

export async function signUp(
  email: string,
  password: string,
  displayName: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });

  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: data.user.id,
        display_name: displayName,
      });

    if (profileError) {
      console.warn(
        '[Supabase] Could not create profile:',
        profileError.message
      );
    }
  }

  return data;
}

export async function signIn(
  email: string,
  password: string
) {
  const { data, error } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (error) throw error;

  return data;
}

/* ============================================================
   PROFILES
   ============================================================ */

export async function getProfile(
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return asAppType<Profile | null>(data);
}

export async function upsertProfile(
  profile: Partial<Profile> & { user_id: string }
) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile)
    .select()
    .maybeSingle();

  if (error) throw error;

  return asAppType<Profile>(data);
}

/* ============================================================
   CAMPAIGNS
   ============================================================ */

function mapCampaignRow(row: any): Campaign {
  const movie = Array.isArray(row.movies) ? row.movies[0] : row.movies;

  return {
    ...row,
    // Database schema uses campaigns.name/media_url and a movie_id relation.
    // The public app uses the normalized Campaign shape below.
    title: row.name ?? '',
    movie_title: movie?.title ?? '',
    hero_image_url: movie?.poster_url ?? row.media_url ?? '',
  };
}

export async function getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, movies(title, poster_url)')
    .eq('active', true)
    .order('created_at', {
      ascending: false,
    });

  if (error) throw error;

  return asAppType<Campaign[]>(
    (data || []).map(mapCampaignRow)
  );
}

export async function getActiveCampaigns(): Promise<Campaign[]> {
  return getCampaigns();
}

export async function getCampaign(
  id: string
): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, movies(title, poster_url)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;

  return data
    ? asAppType<Campaign>(mapCampaignRow(data))
    : null;
}

/* ============================================================
   CAMPAIGN USERS
   ============================================================ */

export async function getCampaignUser(
  campaignId: string,
  userId: string
): Promise<CampaignUser | null> {
  const { data, error } = await supabase
    .from('campaign_users')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return null;
  }

  /*
   * Database:
   * points_balance
   *
   * Frontend:
   * points
   */
  const mapped = {
    ...data,
    points: data.points_balance ?? 0,
  };

  return asAppType<CampaignUser>(mapped);
}

export async function joinCampaign(
  campaignId: string,
  userId: string
): Promise<CampaignUser> {
  const { data, error } = await supabase
    .from('campaign_users')
    .insert({
      campaign_id: campaignId,
      user_id: userId,
    })
    .select()
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(
      'Campaign user was not created.'
    );
  }

  return asAppType<CampaignUser>({
    ...data,
    points: data.points_balance ?? 0,
  });
}

export async function ensureCampaignUser(
  campaignId: string,
  userId: string
): Promise<CampaignUser> {
  const existing = await getCampaignUser(
    campaignId,
    userId
  );

  if (existing) {
    return existing;
  }

  return joinCampaign(campaignId, userId);
}

/* ============================================================
   LOCATIONS
   ============================================================ */

export async function getLocations(
  campaignId: string
): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  return asAppType<Location[]>(data || []);
}

/* ============================================================
   INTERACTION SOURCES
   ============================================================ */

export async function getInteractionSources(
  campaignId: string
): Promise<InteractionSource[]> {
  const { data, error } = await supabase
    .from('interaction_sources')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  return asAppType<InteractionSource[]>(data || []);
}

/* ============================================================
   QR CODE HASH
   ============================================================ */

/*
 * The current qr_codes table does NOT have:
 *
 *   code
 *
 * It has:
 *
 *   code_hash
 *
 * The existing values are 32 hexadecimal characters,
 * which is consistent with MD5-style hashes.
 *
 * We implement MD5 locally so the public app can look up
 * a scanned code without storing the plaintext QR value.
 */

function md5(input: string): string {
  function rotateLeft(
    value: number,
    amount: number
  ): number {
    return (
      (value << amount) |
      (value >>> (32 - amount))
    ) >>> 0;
  }

  function addUnsigned(
    a: number,
    b: number
  ): number {
    return (a + b) >>> 0;
  }

  function safeAdd(
    a: number,
    b: number
  ): number {
    return addUnsigned(a, b);
  }

  function F(
    x: number,
    y: number,
    z: number
  ): number {
    return (x & y) | (~x & z);
  }

  function G(
    x: number,
    y: number,
    z: number
  ): number {
    return (x & z) | (y & ~z);
  }

  function H(
    x: number,
    y: number,
    z: number
  ): number {
    return x ^ y ^ z;
  }

  function I(
    x: number,
    y: number,
    z: number
  ): number {
    return y ^ (x | ~z);
  }

  function FF(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = safeAdd(
      a,
      safeAdd(
        safeAdd(F(b, c, d), x),
        ac
      )
    );

    return safeAdd(
      rotateLeft(a, s),
      b
    );
  }

  function GG(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = safeAdd(
      a,
      safeAdd(
        safeAdd(G(b, c, d), x),
        ac
      )
    );

    return safeAdd(
      rotateLeft(a, s),
      b
    );
  }

  function HH(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = safeAdd(
      a,
      safeAdd(
        safeAdd(H(b, c, d), x),
        ac
      )
    );

    return safeAdd(
      rotateLeft(a, s),
      b
    );
  }

  function II(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number
  ): number {
    a = safeAdd(
      a,
      safeAdd(
        safeAdd(I(b, c, d), x),
        ac
      )
    );

    return safeAdd(
      rotateLeft(a, s),
      b
    );
  }

  const encoder = new TextEncoder();
  const bytes = Array.from(
    encoder.encode(input)
  );

  const originalBitLength =
    bytes.length * 8;

  bytes.push(0x80);

  while (
    (bytes.length % 64) !== 56
  ) {
    bytes.push(0);
  }

  for (let i = 0; i < 8; i++) {
    bytes.push(
      (originalBitLength >> (8 * i)) & 0xff
    );
  }

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += 64
  ) {
    const x = new Array<number>(16);

    for (let i = 0; i < 16; i++) {
      const index =
        offset + i * 4;

      x[i] =
        (bytes[index]) |
        (bytes[index + 1] << 8) |
        (bytes[index + 2] << 16) |
        (bytes[index + 3] << 24);
    }

    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = FF(a, b, c, d, x[0], 7, 0xd76aa478);
    d = FF(d, a, b, c, x[1], 12, 0xe8c7b756);
    c = FF(c, d, a, b, x[2], 17, 0x242070db);
    b = FF(b, c, d, a, x[3], 22, 0xc1bdceee);

    a = FF(a, b, c, d, x[4], 7, 0xf57c0faf);
    d = FF(d, a, b, c, x[5], 12, 0x4787c62a);
    c = FF(c, d, a, b, x[6], 17, 0xa8304613);
    b = FF(b, c, d, a, x[7], 22, 0xfd469501);

    a = FF(a, b, c, d, x[8], 7, 0x698098d8);
    d = FF(d, a, b, c, x[9], 12, 0x8b44f7af);
    c = FF(c, d, a, b, x[10], 17, 0xffff5bb1);
    b = FF(b, c, d, a, x[11], 22, 0x895cd7be);

    a = FF(a, b, c, d, x[12], 7, 0x6b901122);
    d = FF(d, a, b, c, x[13], 12, 0xfd987193);
    c = FF(c, d, a, b, x[14], 17, 0xa679438e);
    b = FF(b, c, d, a, x[15], 22, 0x49b40821);

    a = GG(a, b, c, d, x[1], 5, 0xf61e2562);
    d = GG(d, a, b, c, x[6], 9, 0xc040b340);
    c = GG(c, d, a, b, x[11], 14, 0x265e5a51);
    b = GG(b, c, d, a, x[0], 20, 0xe9b6c7aa);

    a = GG(a, b, c, d, x[5], 5, 0xd62f105d);
    d = GG(d, a, b, c, x[10], 9, 0x02441453);
    c = GG(c, d, a, b, x[15], 14, 0xd8a1e681);
    b = GG(b, c, d, a, x[4], 20, 0xe7d3fbc8);

    a = GG(a, b, c, d, x[9], 5, 0x21e1cde6);
    d = GG(d, a, b, c, x[14], 9, 0xc33707d6);
    c = GG(c, d, a, b, x[3], 14, 0xf4d50d87);
    b = GG(b, c, d, a, x[8], 20, 0x455a14ed);

    a = GG(a, b, c, d, x[13], 5, 0xa9e3e905);
    d = GG(d, a, b, c, x[2], 9, 0xfcefa3f8);
    c = GG(c, d, a, b, x[7], 14, 0x676f02d9);
    b = GG(b, c, d, a, x[12], 20, 0x8d2a4c8a);

    a = HH(a, b, c, d, x[5], 4, 0xfffa3942);
    d = HH(d, a, b, c, x[8], 11, 0x8771f681);
    c = HH(c, d, a, b, x[11], 16, 0x6d9d6122);
    b = HH(b, c, d, a, x[14], 23, 0xfde5380c);

    a = HH(a, b, c, d, x[1], 4, 0xa4beea44);
    d = HH(d, a, b, c, x[4], 11, 0x4bdecfa9);
    c = HH(c, d, a, b, x[7], 16, 0xf6bb4b60);
    b = HH(b, c, d, a, x[10], 23, 0xbebfbc70);

    a = HH(a, b, c, d, x[13], 4, 0x289b7ec6);
    d = HH(d, a, b, c, x[0], 11, 0xeaa127fa);
    c = HH(c, d, a, b, x[3], 16, 0xd4ef3085);
    b = HH(b, c, d, a, x[6], 23, 0x04881d05);

    a = HH(a, b, c, d, x[9], 4, 0xd9d4d039);
    d = HH(d, a, b, c, x[12], 11, 0xe6db99e5);
    c = HH(c, d, a, b, x[15], 16, 0x1fa27cf8);
    b = HH(b, c, d, a, x[2], 23, 0xc4ac5665);

    a = II(a, b, c, d, x[0], 6, 0xf4292244);
    d = II(d, a, b, c, x[7], 10, 0x432aff97);
    c = II(c, d, a, b, x[14], 15, 0xab9423a7);
    b = II(b, c, d, a, x[5], 21, 0xfc93a039);

    a = II(a, b, c, d, x[12], 6, 0x655b59c3);
    d = II(d, a, b, c, x[3], 10, 0x8f0ccc92);
    c = II(c, d, a, b, x[10], 15, 0xffeff47d);
    b = II(b, c, d, a, x[1], 21, 0x85845dd1);

    a = II(a, b, c, d, x[8], 6, 0x6fa87e4f);
    d = II(d, a, b, c, x[15], 10, 0xfe2ce6e0);
    c = II(c, d, a, b, x[6], 15, 0xa3014314);
    b = II(b, c, d, a, x[13], 21, 0x4e0811a1);

    a = II(a, b, c, d, x[4], 6, 0xf7537e82);
    d = II(d, a, b, c, x[11], 10, 0xbd3af235);
    c = II(c, d, a, b, x[2], 15, 0x2ad7d2bb);
    b = II(b, c, d, a, x[9], 21, 0xeb86d391);

    a = safeAdd(a, oldA);
    b = safeAdd(b, oldB);
    c = safeAdd(c, oldC);
    d = safeAdd(d, oldD);
  }

  const words = [a, b, c, d];

  let output = '';

  for (const word of words) {
    for (let i = 0; i < 4; i++) {
      output += (
        (word >>> (i * 8)) & 0xff
      )
        .toString(16)
        .padStart(2, '0');
    }
  }

  return output;
}

/* ============================================================
   QR CODES
   ============================================================ */

export async function getQRCode(
  code: string
): Promise<QRCode | null> {
  const normalizedCode =
    code.trim();

  if (!normalizedCode) {
    return null;
  }

  const hash = md5(normalizedCode);

  const { data, error } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('code_hash', hash)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return null;
  }

  /*
   * The DB deliberately does not expose the plaintext code.
   * Add the scanned code to the returned app object so the
   * existing frontend can still work if it expects `code`.
   */
  return asAppType<QRCode>({
    ...data,
    code: normalizedCode,
  });
}

/* ============================================================
   SCANS
   ============================================================ */

export async function getUserScans(
  campaignId: string,
  userId: string
): Promise<Scan[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('scanned_at', {
      ascending: false,
    });

  if (error) throw error;

  /*
   * DB:
   * qr_id
   * scanned_at
   *
   * Frontend:
   * qr_code_id
   * created_at
   *
   * points_awarded is not stored on scans, so it is
   * reconstructed later from interaction_sources when needed.
   */
  const mapped = (data || []).map((row) => ({
    ...row,
    qr_code_id: row.qr_id,
    created_at: row.scanned_at,
  }));

  return asAppType<Scan[]>(mapped);
}

/* ============================================================
   POINT TRANSACTIONS
   ============================================================ */

export async function getPointTransactions(
  campaignId: string,
  userId: string
): Promise<PointTransaction[]> {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', {
      ascending: false,
    });

  if (error) throw error;

  const mapped = (data || []).map((row) => ({
    ...row,
    points: row.amount,
    reason: row.description,
  }));

  return asAppType<PointTransaction[]>(
    mapped
  );
}

/* ============================================================
   MISSIONS
   ============================================================ */

export async function getMissions(
  campaignId: string
): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('target_value', {
      ascending: true,
    });

  if (error) throw error;

  const mapped = (data || []).map((row) => ({
    ...row,

    /*
     * DB -> frontend compatibility
     */
    title: row.name,
    target_count: row.target_value,
    points_reward: row.reward_points,
  }));

  return asAppType<Mission[]>(mapped);
}

/* ============================================================
   MISSION PROGRESS
   ============================================================ */

export async function getMissionProgress(
  campaignId: string,
  userId: string
): Promise<MissionProgress[]> {
  /*
   * mission_progress does not contain campaign_id.
   *
   * First get missions belonging to this campaign,
   * then use their IDs to filter progress.
   */

  const { data: missions, error: missionError } =
    await supabase
      .from('missions')
      .select('id')
      .eq('campaign_id', campaignId);

  if (missionError) {
    throw missionError;
  }

  const missionIds =
    (missions || []).map(
      (mission) => mission.id
    );

  if (missionIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('mission_progress')
    .select('*')
    .eq('user_id', userId)
    .in('mission_id', missionIds);

  if (error) throw error;

  return asAppType<MissionProgress[]>(
    data || []
  );
}

/* ============================================================
   REWARDS
   ============================================================ */

export async function getRewards(
  campaignId: string
): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('points_required', {
      ascending: true,
    });

  if (error) throw error;

  return asAppType<Reward[]>(data || []);
}

/* ============================================================
   REWARD ENTRIES
   ============================================================ */

export async function getRewardEntries(
  campaignId: string,
  userId: string
): Promise<RewardEntry[]> {
  const { data, error } = await supabase
    .from('reward_entries')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', {
      ascending: false,
    });

  if (error) throw error;

  const mapped = (data || []).map((row) => ({
    ...row,

    /*
     * DB:
     * entry_count
     *
     * Frontend:
     * entries
     */
    entries: row.entry_count,
  }));

  return asAppType<RewardEntry[]>(
    mapped
  );
}

export async function getRewardClaims(
  campaignId: string,
  userId: string
): Promise<RewardClaim[]> {
  const { data, error } = await supabase
    .from('reward_claims')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('claimed_at', {
      ascending: false,
    });

  if (error) throw error;

  const mapped = (data || []).map((row) => ({
    ...row,

    /*
     * DB:
     * claimed_at
     *
     * Frontend:
     * created_at
     */
    created_at: row.claimed_at,
  }));

  return asAppType<RewardClaim[]>(
    mapped
  );
}

export function calculateEntryTotal(
  entries: RewardEntry[]
): number {
  return entries.reduce(
    (sum, entry) =>
      sum + Number(
        (entry as any).entries ??
        (entry as any).entry_count ??
        0
      ),
    0
  );
}

/* ============================================================
   CLAIM REWARD
   ============================================================ */

export async function claimReward(
  campaignId: string,
  userId: string,
  reward: Reward
): Promise<RewardClaim> {
  /*
   * Reward redemption changes the user's balance, inventory,
   * claim record, transaction history, and activity log.
   * Keep all of those changes in one database transaction.
   */
  void userId;

  const { data, error } = await supabase.rpc('claim_reward', {
    p_campaign_id: campaignId,
    p_reward_id: reward.id,
  });

  if (error) {
    throw error;
  }

  if (!data?.success || !data.claim) {
    throw new Error(
      data?.message || 'Reward could not be claimed.'
    );
  }

  return asAppType<RewardClaim>({
    ...data.claim,
    created_at: data.claim.claimed_at,
  });
}

/* ============================================================
   BADGES
   ============================================================ */

export async function getBadges(
  campaignId: string
): Promise<Badge[]> {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('name');

  if (error) throw error;

  return asAppType<Badge[]>(data || []);
}

/* ============================================================
   USER BADGES
   ============================================================ */

export async function getUserBadges(
  campaignId: string,
  userId: string
): Promise<UserBadge[]> {
  /*
   * user_badges does NOT have campaign_id.
   *
   * We first get badges belonging to this campaign,
   * then filter user_badges by those badge IDs.
   */

  const { data: badges, error: badgeError } =
    await supabase
      .from('badges')
      .select('id')
      .eq('campaign_id', campaignId);

  if (badgeError) {
    throw badgeError;
  }

  const badgeIds =
    (badges || []).map(
      (badge) => badge.id
    );

  if (badgeIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .in('badge_id', badgeIds);

  if (error) throw error;

  return asAppType<UserBadge[]>(
    data || []
  );
}

/* ============================================================
   LEADERBOARD
   ============================================================ */

export async function getLeaderboard(
  campaignId: string
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('campaign_leaderboard')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('points', {
      ascending: false,
    })
    .limit(50);

  if (error) throw error;

  return asAppType<LeaderboardEntry[]>(
    data || []
  );
}

export async function getMyLeaderboardPosition(
  campaignId: string,
  userId: string
): Promise<LeaderboardEntry | null> {
  const { data, error } = await supabase
    .from('campaign_leaderboard')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return asAppType<LeaderboardEntry | null>(
    data
  );
}

/* ============================================================
   REFERRALS
   ============================================================ */

export async function getReferralCode(
  campaignId: string,
  userId: string
): Promise<ReferralCode | null> {
  const { data, error } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return asAppType<ReferralCode | null>(
    data
  );
}

export async function createReferralCode(
  campaignId: string,
  userId: string,
  displayName: string
): Promise<ReferralCode> {
  const code =
    `HB-${displayName
      .replace(/[^A-Z0-9]/gi, '')
      .substring(0, 4)
      .toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

  const { data, error } = await supabase
    .from('referral_codes')
    .insert({
      campaign_id: campaignId,
      user_id: userId,
      code,
    })
    .select()
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(
      'Referral code was not created.'
    );
  }

  return asAppType<ReferralCode>(data);
}

export async function getReferrals(
  campaignId: string,
  userId: string
): Promise<Referral[]> {
  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('referrer_user_id', userId)
    .order('created_at', {
      ascending: false,
    });

  if (error) throw error;

  const mapped = (data || []).map((row) => ({
    ...row,
    referrer_id: row.referrer_user_id,
  }));

  return asAppType<Referral[]>(
    mapped
  );
}

/* ============================================================
   ACTIVITY EVENTS
   ============================================================ */

export async function getActivityEvents(
  campaignId: string,
  userId: string
): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', {
      ascending: false,
    })
    .limit(30);

  if (error) throw error;

  return asAppType<ActivityEvent[]>(
    data || []
  );
}

export async function logActivity(
  campaignId: string,
  userId: string,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  try {
    const { error } = await supabase
      .from('activity_events')
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        event_type: eventType,
        metadata: metadata || {},
      });

    if (error) {
      console.warn(
        '[Supabase] Activity log failed:',
        error.message
      );
    }
  } catch (error) {
    console.warn(
      '[Supabase] Activity log failed:',
      error
    );
  }
}

/* ============================================================
   SCAN PROCESSING
   ============================================================ */

export interface ScanResult {
  success: boolean;
  message: string;
  pointsAwarded: number;
  sourceName: string;
  sourceType: string;
  isNew: boolean;
  campaignId: string;
}

export async function processScan(
  campaignId: string,
  userId: string,
  code: string
): Promise<ScanResult> {
  /*
   * Scanning changes several protected tables at once.
   * Do the validation, scan insert, point award, mission progress,
   * balance update, and usage counter in one server-side transaction.
   *
   * The database function derives the authenticated user from auth.uid()
   * and does not trust the userId supplied by the browser.
   */
  void userId;

  const { data, error } = await supabase.rpc('process_scan', {
    p_campaign_id: campaignId,
    p_code: code,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Scan processing returned no result.');
  }

  return asAppType<ScanResult>(data);
}

/* ============================================================
   DASHBOARD
   ============================================================ */

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
  myLeaderboardPosition:
    | LeaderboardEntry
    | null;
  profile: Profile | null;
}

export async function getCampaignDashboard(
  campaignId: string,
  userId: string
): Promise<CampaignDashboard> {
  const [
    campaignResult,
    campaignUserResult,
    missionsResult,
    missionsProgressResult,
    rewardsResult,
    locationsResult,
    sourcesResult,
    rewardEntriesResult,
    rewardClaimsResult,
    badgesResult,
    userBadgesResult,
    scansResult,
    leaderboardResult,
    myPositionResult,
    profileResult,
  ] = await Promise.all([
    getCampaign(campaignId),

    getCampaignUser(
      campaignId,
      userId
    ),

    getMissions(campaignId),

    getMissionProgress(
      campaignId,
      userId
    ),

    getRewards(campaignId),

    getLocations(campaignId),

    getInteractionSources(
      campaignId
    ),

    getRewardEntries(
      campaignId,
      userId
    ),

    getRewardClaims(
      campaignId,
      userId
    ),

    getBadges(campaignId),

    getUserBadges(
      campaignId,
      userId
    ),

    getUserScans(
      campaignId,
      userId
    ),

    getLeaderboard(
      campaignId
    ),

    getMyLeaderboardPosition(
      campaignId,
      userId
    ),

    getProfile(userId),
  ]);

  return {
    campaign: campaignResult,
    campaignUser:
      campaignUserResult,
    missions:
      missionsResult,
    missionProgress:
      missionsProgressResult,
    rewards:
      rewardsResult,
    locations:
      locationsResult,
    interactionSources:
      sourcesResult,
    rewardEntries:
      rewardEntriesResult,
    rewardClaims:
      rewardClaimsResult,
    badges:
      badgesResult,
    userBadges:
      userBadgesResult,
    scans:
      scansResult,
    leaderboard:
      leaderboardResult,
    myLeaderboardPosition:
      myPositionResult,
    profile:
      profileResult,
  };
}
