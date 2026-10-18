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
 * Resolves only active, in-window QR codes belonging to active campaigns.
 * This lookup is not itself proof that a scan is eligible for a reward:
 * use a transactional scan verifier (currently process_scan) for that.
 */
export async function resolveActiveQr(
  admin: SupabaseClient,
  code: string,
): Promise<VerifiedQr | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length > 256) return null;

  const { data, error } = await admin
    .from("qr_codes")
    .select("id,campaign_id,purpose,qr_type,venue_id,hunt_id,display_name")
    .eq("is_active", true)
    .or(`public_code.eq.${normalized},short_code.eq.${normalized},code_hash.eq.${await md5(normalized)}`)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("QR verification lookup failed.");
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

  return data as VerifiedQr;
}

async function md5(value: string): Promise<string> {
  // Web Crypto does not support MD5. The database's code_hash fallback is
  // intentionally omitted here; clients should use public_code/short_code.
  // Return an impossible sentinel so it cannot accidentally match a real hash.
  void value;
  return "__unsupported_md5_lookup__";
}
