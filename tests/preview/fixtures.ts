export const useCampaign = () => ({
  campaigns: [{ id: "preview", title: "Honeycomb demonstration" }],
});
export async function getAnalyticsCampaignIds() {
  return ["preview"];
}
export async function getCampaignAnalytics() {
  return {
    summary: {
      interactions: 525,
      unique_users: 160,
      scans: 240,
      campaign_joins: 80,
      hunt_starts: 60,
      hunt_completions: 25,
      task_completions: 100,
      reward_claims: 20,
      shares: 0,
      repeat_users: 34,
      engagement_rate: 37.5,
    },
    locations: [
      {
        id: "mall",
        venue_id: null,
        name: "Demo Mall",
        latitude: 13.05,
        longitude: 80.21,
        interactions: 230,
        unique_users: 100,
        scans: 160,
        task_completions: 60,
        reward_claims: 10,
        engagement_rate: 40,
      },
      {
        id: "college",
        venue_id: null,
        name: "Demo College",
        latitude: 13.08,
        longitude: 80.27,
        interactions: 130,
        unique_users: 70,
        scans: 80,
        task_completions: 40,
        reward_claims: 10,
        engagement_rate: 57.1,
      },
      {
        id: "empty",
        venue_id: null,
        name: "Demo Venue — no activity",
        latitude: 13.01,
        longitude: 80.24,
        interactions: 0,
        unique_users: 0,
        scans: 0,
        task_completions: 0,
        reward_claims: 0,
        engagement_rate: 0,
      },
    ],
    daily: [
      { day: "2026-10-06", interactions: 225, unique_users: 100 },
      { day: "2026-10-07", interactions: 300, unique_users: 120 },
    ],
    funnel: [
      { event_type: "QR_SCANNED", events: 240, users: 160 },
      { event_type: "CAMPAIGN_JOINED", events: 80, users: 80 },
      { event_type: "HUNT_STARTED", events: 60, users: 60 },
      { event_type: "TASK_COMPLETED", events: 100, users: 60 },
      { event_type: "HUNT_COMPLETED", events: 25, users: 25 },
      { event_type: "REWARD_CLAIMED", events: 20, users: 20 },
    ],
    unattributed_interactions: 165,
    tracking_started_at: "2026-10-06T00:00:00Z",
  };
}
