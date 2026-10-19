import { recordedQrScanVerifier } from "./verifiers/recorded-qr-scan.ts";
import type { TaskVerifierDefinition } from "./task-types.ts";
const taskVerifiers: Readonly<Record<string, TaskVerifierDefinition>> = {
  recorded_qr_scan: {
    key: "recorded_qr_scan", label: "Recent accepted QR scan",
    description: "Checks a recent accepted scan for this user and campaign, optionally filtered by QR purpose, venue, or hunt.",
    uiComponents: ["qr_scanner"], requiredEventTypeCode: "qr_scan_task_verified", verify: recordedQrScanVerifier,
  },
};
export type TaskVerificationMethod = Omit<TaskVerifierDefinition, "verify">;
export function getTaskVerifier(key: string): TaskVerifierDefinition | null { return taskVerifiers[key] ?? null; }
export function getTaskVerificationCatalog() {
  return {
    methods: Object.values(taskVerifiers).map(({ verify: _verify, ...definition }) => definition),
    modes: [{ key: "event_progress", label: "Trusted event progress", description: "Existing trusted app/server events advance this task; manual completion claims are rejected." }],
    // Presentation actions are separate from evidence verification. This list is
    // metadata for the admin selector; the actual renderers live in the app UI registry.
    uiComponents: [
      { key: "generic", label: "Generic task action", description: "Open the default task flow." },
      { key: "qr_scanner", label: "Open QR scanner", description: "Navigate to the campaign QR scanner." },
      { key: "open_url", label: "Open URL", description: "Open a configured HTTP(S) destination." },
      { key: "video_link", label: "Open trailer / video link", description: "Open a configured trailer URL; this does not prove playback." },
    ],
  };
}
