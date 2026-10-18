import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export type VerifiedQr = {
  id: string; campaign_id: string; purpose: string | null; qr_type: string | null;
  venue_id: string | null; hunt_id: string | null; display_name: string | null;
};

/** Lookup only: this is not reward eligibility. Use the transactional process_scan for scans. */
export async function resolveActiveQr(admin: SupabaseClient, code: string): Promise<VerifiedQr | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length > 256) return null;
  const columns = "id,campaign_id,purpose,qr_type,venue_id,hunt_id,display_name";
  let data: Record<string, unknown> | null = null;

  // Exact queries avoid interpolating untrusted QR input into a PostgREST filter.
  for (const column of ["public_code", "short_code"] as const) {
    const result = await admin.from("qr_codes").select(columns)
      .eq("is_active", true).eq(column, normalized).limit(1).maybeSingle();
    if (result.error) throw new Error("QR verification lookup failed.");
    if (result.data) { data = result.data as unknown as Record<string, unknown>; break; }
  }
  if (!data) return null;

  const { data: campaign, error: campaignError } = await admin.from("campaigns")
    .select("id").eq("id", data.campaign_id).eq("active", true).maybeSingle();
  if (campaignError) throw new Error("Campaign verification failed.");
  if (!campaign) return null;

  const { data: qr, error } = await admin.from("qr_codes")
    .select("id,starts_at,expires_at,max_uses,use_count").eq("id", data.id).maybeSingle();
  if (error || !qr) throw new Error("QR eligibility could not be verified.");
  const now = Date.now();
  if (qr.starts_at && Date.parse(qr.starts_at) > now) return null;
  if (qr.expires_at && Date.parse(qr.expires_at) < now) return null;
  if (qr.max_uses !== null && qr.use_count >= qr.max_uses) return null;
  return data as unknown as VerifiedQr;
}
