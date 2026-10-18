import { supabase } from "@/lib/supabase";

export interface AdminUserSearchResult {
  user_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_active_at: string | null;
  activity_count: number;
}

export interface AdminUserActivity {
  id: string;
  created_at: string;
  campaign_id: string | null;
  campaign_name: string | null;
  event_type_id: number | null;
  event_type: string | null;
  event_description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  location_id: string | null;
  origin: string;
  metadata: Record<string, unknown> | null;
}

export interface AdminUserActivityResponse {
  user: {
    user_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    created_at: string;
    last_active_at: string | null;
  };
  activities: AdminUserActivity[];
}

export async function checkAdminAccess(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

export async function searchAdminUsers(query: string): Promise<AdminUserSearchResult[]> {
  const { data, error } = await supabase.rpc("admin_search_users", {
    p_query: query.trim(),
    p_limit: 25,
  });
  if (error) throw error;
  return (data?.users ?? []) as AdminUserSearchResult[];
}

export async function getAdminUserActivity(userId: string): Promise<AdminUserActivityResponse> {
  const { data, error } = await supabase.rpc("admin_get_user_activity", {
    p_user_id: userId,
    p_limit: 150,
  });
  if (error) throw error;
  return data as AdminUserActivityResponse;
}
