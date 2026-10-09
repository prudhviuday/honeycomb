import { supabase } from '@/lib/supabase';
import type { ActivityEvent } from '@/modules/analytics/types';

/** Fetch recent activity for a campaign, optionally limited to one user. */
export async function getActivityEvents(
  campaignId: string,
  userId?: string,
): Promise<ActivityEvent[]> {
  let query = supabase
    .from('activity_events')
    .select('id, campaign_id, user_id, event_type, entity_type, entity_id, metadata, created_at, location_id, interaction_source_id, event_key, origin')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ActivityEvent[];
}
