import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export type VerifiedQr = {
  id: string;
  campaign_id: string;
  purpose: string | null;
  qr_type: string | null;
  venue_id: string | null;
  hunt_id: string | null;
  display_name: string | null;
};

/**
 * Resolves active, in-window QR codes belonging to active campaigns.
 * This lookup is not itself proof that a scan is eligible for a reward:
 * use the transactional scan verifier (currently process_scan) for that.
 *
 * Separate equality queries avoid interpolating untrusted QR text into a
 * PostgREST filter expression. Legacy code_hash resolution stays in the
 * existing database scan function until a compatible hash verifier is added.
 */
export async function resolveActiveQr(
  admin: SupabaseClient,
  code: string,
): Promise<VerifiedQr | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length > 256) return null;

  const columns = "id,campaign_id,purpose,qr_type,venue_id,hunt_id,display_name";
  let data: Record<string, unknown> | null = null;

  for (const column of ["public_code", "short_code"] as const) {
    const result = await admin
      .from("qr_codes")
      .select(columns)
      .eq("is_active", true)
      .eq(column, normalized)
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error("QR verification lookup failed.");
    if (result.data) {
      data = result.data as unknown as Record<string, unknown>;
      break;
    }
  }
  if (!data) return null;

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id")
    .eq("id", data.campaign_id)
    .eq("active", true)
    .maybeSingle();
  if (campaignError) throw new Error("Campaign verification failed.");
  if (!campaign) return null;

  const { data: fullQr, error: fullQrError } = await admin
    .from("qr_codes")
    .select("id,starts_at,expires_at,max_uses,use_count")
    .eq("id", data.id)
    .maybeSingle();
  if (fullQrError || !fullQr) throw new Error("QR eligibility could not be verified.");

  const now = Date.now();
  if (fullQr.starts_at && Date.parse(fullQr.starts_at) > now) return null;
  if (fullQr.expires_at && Date.parse(fullQr.expires_at) < now) return null;
  if (fullQr.max_uses !== null && fullQr.use_count >= fullQr.max_uses) return null;

  return data as unknown as VerifiedQr;
}
