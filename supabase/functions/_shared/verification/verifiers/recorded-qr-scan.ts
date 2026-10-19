import type { TaskVerifier } from "../task-types.ts";
export const recordedQrScanVerifier: TaskVerifier = async ({ admin, userId, task }) => {
  const config = task.verification_config ?? {};
  const configuredWindow = Number(config.scan_lookback_seconds ?? 120);
  const lookback = Number.isFinite(configuredWindow) ? Math.max(15, Math.min(600, Math.floor(configuredWindow))) : 120;
  const now = Date.now();
  const { data: scans, error } = await admin.from("scans")
    .select("id,qr_id,scanned_at,campaign_id,user_id").eq("campaign_id", task.campaign_id)
    .eq("user_id", userId).order("scanned_at", { ascending: false }).limit(10);
  if (error) throw new Error("Could not verify recorded QR scan evidence.");
  if (!scans?.length) return { verified: false, status: 409, message: "Scan a QR code for this movie campaign, then retry the task." };
  for (const scan of scans) {
    const time = Date.parse(String(scan.scanned_at ?? ""));
    if (!Number.isFinite(time) || time < now - lookback * 1000 || time > now + 5000) continue;
    if (typeof scan.id !== "string" || typeof scan.qr_id !== "string") continue;
    const { data: qr, error: qrError } = await admin.from("qr_codes")
      .select("id,purpose,venue_id,hunt_id,qr_type").eq("id", scan.qr_id).maybeSingle();
    if (qrError) throw new Error("Could not verify the QR code associated with this scan.");
    if (!qr) continue;
    if (typeof config.qr_id === "string" && config.qr_id !== qr.id) continue;
    if (typeof config.purpose === "string" && config.purpose !== qr.purpose) continue;
    if (typeof config.venue_id === "string" && config.venue_id !== qr.venue_id) continue;
    if (typeof config.hunt_id === "string" && config.hunt_id !== qr.hunt_id) continue;
    return { verified: true, message: "A recent accepted QR scan was verified.", evidence: {
      entityType: "qr_scan", entityId: scan.id, idempotencyKey: scan.id,
      metadata: { scan_id: scan.id, qr_id: qr.id, qr_purpose: qr.purpose ?? null, venue_id: qr.venue_id ?? null,
        hunt_id: qr.hunt_id ?? null, qr_type: qr.qr_type ?? null, verified_by: "recorded_qr_scan" },
    }};
  }
  return { verified: false, status: 409, message: "No recent accepted QR scan matches this task's configured QR/venue rules." };
};
