import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from './types';

import { supabase } from '@/infrastructure/supabase/client';

/*
 * Shared API
 *
 * Put only cross-feature data access here.
 * Feature-specific operations stay in the owning module API.
 */

/* ============================================================
   AUTH / CURRENT USER
   ============================================================ */

export const getSession = () => supabase.auth.getSession();

export const getCurrentUser = () => supabase.auth.getUser();

export const onAuthStateChange = (
  callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]
) => supabase.auth.onAuthStateChange(callback);

export const signOut = () => supabase.auth.signOut();

/* ============================================================
   USER PROFILE
   ============================================================ */

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return data as Profile | null;
}

export async function upsertProfile(
  profile: Partial<Profile> & { user_id: string }
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile)
    .select()
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error('Profile was not created.');
  }

  return data as Profile;
}

/* ============================================================
   LOCATION
   ============================================================ */

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  weight: number;
}

export async function recordUserLocation(
  latitude: number,
  longitude: number,
  accuracy?: number
): Promise<void> {
  const { error } = await supabase.rpc('record_user_location', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_m: accuracy ?? null,
  });

  if (error) throw error;
}

export async function getLocationHeatmap(
  campaignId?: string | null
): Promise<HeatmapPoint[]> {
  const { data, error } = await supabase.rpc(
    'get_location_heatmap',
    { p_campaign_id: campaignId ?? null }
  );

  if (error) throw error;

  return (data ?? []).map(
    (row: {
      latitude: number | string;
      longitude: number | string;
      weight: number | string;
    }) => ({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      weight: Number(row.weight),
    })
  );
}

/* ============================================================
   ACTIVITY
   ============================================================ */

export async function logActivity(
  campaignId: string,
  userId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase
      .from('activity_events')
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        event_type: eventType,
        metadata: metadata ?? {},
      });

    if (error) {
      console.warn(
        '[Supabase] Activity log failed:',
        error.message
      );
    }
  } catch (error) {
    console.warn('[Supabase] Activity log failed:', error);
  }
}

export type { Session, User };
