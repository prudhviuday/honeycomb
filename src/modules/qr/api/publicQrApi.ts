import { supabase } from '@/infrastructure/supabase/client';

export type QrPurpose =
  | 'vendor'
  | 'mall'
  | 'friend_invite'
  | 'hunt_location'
  | 'general';

export interface PublicQrResolution {
  success: boolean;
  message?: string;
  qrCodeId?: string;
  campaignId?: string;
  campaignName?: string;
  campaignMediaUrl?: string | null;
  movieTitle?: string;
  posterUrl?: string | null;
  trailerUrl?: string | null;
  purpose?: QrPurpose;
  qrType?: string;
  sourceName?: string;
  sourceType?: string | null;
  locationId?: string | null;
  venueId?: string | null;
  inviterUserId?: string | null;
  referralCode?: string | null;
  huntId?: string | null;
}

export async function resolvePublicQr(code: string): Promise<PublicQrResolution> {
  const normalized = code.trim();
  if (!normalized) return { success: false, message: 'QR code is missing.' };

  const { data, error } = await supabase.rpc('resolve_public_qr', {
    p_code: normalized,
  });

  if (error) throw error;
  return (data ?? { success: false, message: 'This QR code could not be resolved.' }) as PublicQrResolution;
}

export function getQrVisitorId(): string {
  const key = 'honeycomb_qr_visitor_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function recordQrLandingEvent(
  code: string,
  eventType: 'page_view' | 'signup_started' | 'signup_completed' | 'campaign_joined',
): Promise<void> {
  const { error } = await supabase.rpc('record_qr_landing_event', {
    p_code: code.trim(),
    p_event_type: eventType,
    p_visitor_id: getQrVisitorId(),
  });
  if (error) throw error;
}

export async function getOrCreateFriendInviteQr(
  campaignId: string,
  referralCode: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_friend_invite_qr', {
    p_campaign_id: campaignId,
    p_referral_code: referralCode,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Could not create a movie invitation QR.');
  }
  return data;
}

export interface CreatePromotionQrInput {
  campaignId: string;
  purpose: 'vendor' | 'mall' | 'hunt_location' | 'general';
  venueId?: string | null;
  huntId?: string | null;
  interactionSourceId?: string | null;
  sourceName?: string | null;
}

/** Admin-only: create a QR code tied to an active movie promotion. */
export async function createPromotionQr(input: CreatePromotionQrInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_promotion_qr', {
    p_campaign_id: input.campaignId,
    p_purpose: input.purpose,
    p_venue_id: input.venueId ?? null,
    p_hunt_id: input.huntId ?? null,
    p_interaction_source_id: input.interactionSourceId ?? null,
    p_source_name: input.sourceName ?? null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Could not create the movie promotion QR.');
  }
  return data;
}

export interface CampaignQrRecord {
  id: string;
  campaign_id: string;
  public_code: string | null;
  purpose: QrPurpose;
  venue_id: string | null;
  inviter_user_id: string | null;
  referral_code: string | null;
  hunt_id: string | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Admin-only listing used when printing/replacing QR artwork with /q/:code URLs. */
export async function getCampaignQrCodesForAdmin(campaignId: string): Promise<CampaignQrRecord[]> {
  const { data, error } = await supabase
    .from('qr_codes')
    .select('id, campaign_id, public_code, purpose, venue_id, inviter_user_id, referral_code, hunt_id, is_active, starts_at, expires_at, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CampaignQrRecord[];
}
