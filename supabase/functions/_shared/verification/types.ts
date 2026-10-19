import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export type VerificationContext = {
  admin: SupabaseClient;
  userId: string;
  body: Record<string, unknown>;
};

export type VerificationOutcome = {
  status?: number;
  body: unknown;
};

/**
 * A verifier must derive eligibility from trusted server/database evidence.
 * Never accept a client-provided "completed" flag as proof.
 */
export type ActivityVerifier = (
  context: VerificationContext,
) => Promise<VerificationOutcome>;
