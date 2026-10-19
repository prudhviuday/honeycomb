import type { ActivityVerifier, VerificationContext, VerificationOutcome } from "./types.ts";
import { resolveQrVerifier } from "./verifiers/resolve-qr.ts";

/**
 * The single action-to-verifier registry.
 *
 * To add a verifier:
 * 1. Create a module in ./verifiers/ that checks trusted evidence.
 * 2. Register its action here.
 * 3. Add tests and, where needed, a database migration/transaction.
 *
 * Registration does not make a task reward-bearing automatically. A verifier
 * must explicitly record trusted activity through the activity engine or a
 * trusted database RPC after the evidence has been checked.
 */
const verifiers: Readonly<Record<string, ActivityVerifier>> = {
  resolve_qr: resolveQrVerifier,
};

export function getSupportedVerificationActions(): string[] {
  return Object.keys(verifiers);
}

export function getActivityVerifier(action: string): ActivityVerifier | null {
  return verifiers[action] ?? null;
}

export async function runVerification(
  verifier: ActivityVerifier,
  context: VerificationContext,
): Promise<VerificationOutcome> {
  return verifier(context);
}

export type { ActivityVerifier, VerificationContext, VerificationOutcome } from "./types.ts";
