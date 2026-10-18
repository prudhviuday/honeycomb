import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export type VerifiedQr = {
  id: string; campaign_id: string; purpose: string | null; qr_type: string | null;
  venue_id: string | null; hunt_id: string | null; display_name: string | null;
};

/** Lookup only: this is not reward eligibility. Use the transactional process_scan for scans. */
export async function resolveActiveQr(admin: SupabaseClient, code: string): Promise<VerifiedQr | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length > 256) return null;
  const columns = "id,campaign_id,purpose,qr_type,venue_id,hunt_id,display_name,starts_at,expires_at,max_uses,use_count,campaigns!inner(id)";
  let data: Record<string, unknown> | null = null;

  // Exact queries avoid interpolating untrusted QR input into a PostgREST filter.
  // Join the active campaign and read QR limits in the same request to avoid
  // separate round trips for campaign and QR eligibility checks.
  for (const column of ["public_code", "short_code"] as const) {
    const result = await admin.from("qr_codes").select(columns)
      .eq("is_active", true).eq("campaigns.active", true)
      .eq(column, normalized).limit(1).maybeSingle();
    if (result.error) throw new Error("QR verification lookup failed.");
    if (result.data) { data = result.data as unknown as Record<string, unknown>; break; }
  }
  if (!data) return null;

  const now = Date.now();
  const startsAt = data.starts_at as string | null;
  const expiresAt = data.expires_at as string | null;
  const maxUses = data.max_uses as number | null;
  const useCount = data.use_count as number;
  if (startsAt && Date.parse(startsAt) > now) return null;
  if (expiresAt && Date.parse(expiresAt) < now) return null;
  if (maxUses !== null && useCount >= maxUses) return null;
  return data as unknown as VerifiedQr;
}
