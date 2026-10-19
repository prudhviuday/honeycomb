import { resolveActiveQr } from "../../verification.ts";
import type { ActivityVerifier } from "../types.ts";

/**
 * Informational QR preview only. It deliberately does not record an activity,
 * advance a mission, or award points. Reward-bearing scans still use process_scan.
 */
export const resolveQrVerifier: ActivityVerifier = async ({ admin, body }) => {
  if (typeof body.code !== "string") {
    return { status: 400, body: { error: "code is required." } };
  }

  const qr = await resolveActiveQr(admin, body.code);
  if (!qr) {
    return {
      body: {
        valid: false,
        message: "QR is invalid, inactive, expired, or exhausted.",
      },
    };
  }

  return {
    body: {
      valid: true,
      qr: {
        id: qr.id,
        campaignId: qr.campaign_id,
        purpose: qr.purpose,
        qrType: qr.qr_type,
        venueId: qr.venue_id,
        huntId: qr.hunt_id,
        displayName: qr.display_name,
      },
    },
  };
};
