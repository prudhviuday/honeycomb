/** Server-only contract. Call after validation, with a stable domain operation key.
 * If the domain operation must be atomic with the event, call blueprint_log_event
 * inside the same database transaction, or dispatch this helper from an outbox.
 */
export const eventTypes = [
  "QR_SCANNED", "USER_REGISTERED", "HUNT_STARTED", "TASK_STARTED",
  "TASK_COMPLETED", "LOCATION_VISITED", "REWARD_UNLOCKED", "REWARD_CLAIMED",
  "REWARD_REDEEMED", "SHARE_COMPLETED", "REFERRAL_JOINED", "BADGE_EARNED",
] as const;
export type EventType = typeof eventTypes[number];
export interface EventInput {
  campaignId: string;
  profileId: string | null;
  eventType: EventType;
  eventKey: string;
  venueId?: string;
  qrId?: string;
  taskId?: string;
  rewardId?: string;
  metadata?: { is_valid?: boolean; source?: "scan" | "direct_link" };
  occurredAt?: string;
}
interface EventClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown; error: { message: string } | null;
  }>;
}
export async function logEvent(client: EventClient, event: EventInput): Promise<string> {
  if (!eventTypes.includes(event.eventType) || !event.eventKey.trim()) {
    throw new Error("A supported event and stable operation key are required");
  }
  const { data, error } = await client.rpc("blueprint_log_event", {
    p_campaign_id: event.campaignId, p_profile_id: event.profileId,
    p_event_type: event.eventType, p_event_key: event.eventKey,
    p_venue_id: event.venueId ?? null, p_qr_id: event.qrId ?? null,
    p_task_id: event.taskId ?? null, p_reward_id: event.rewardId ?? null,
    p_metadata: event.metadata ?? {},
    ...(event.occurredAt ? { p_created_at: event.occurredAt } : {}),
  });
  if (error) throw new Error(error.message);
  return String(data);
}
