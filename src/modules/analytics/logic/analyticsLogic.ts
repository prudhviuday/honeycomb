import type { ActivityEvent } from "@/shared/types";
import type { AnalyticsMetric, LocationAnalytics } from "../types";
export function countEvents(
  events: ActivityEvent[],
  eventType: string,
): number {
  return events.filter((event) => event.event_type === eventType).length;
}
export function sortEventsByTime(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
}
export const metricLabels: Record<AnalyticsMetric, string> = {
  scans: "QR scans",
  unique_users: "Unique users",
  task_completions: "Task completions",
  reward_claims: "Reward claims",
  interactions: "Interactions",
  engagement_rate: "Engagement rate",
};
// Date controls use campaign reporting time (India), with an exclusive end boundary.
export function reportingRange(
  from: string,
  through: string,
): { from: string; to: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through))
    throw new Error("Choose valid dates.");
  const start = Date.parse(`${from}T00:00:00+05:30`);
  const end = Date.parse(`${through}T00:00:00+05:30`) + 86400000;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 366 * 86400000
  )
    throw new Error("Choose a valid date range of up to 366 days.");
  return {
    from: new Date(start).toISOString(),
    to: new Date(end).toISOString(),
  };
}
export function analyticsHeatmap(
  locations: LocationAnalytics[],
  metric: AnalyticsMetric,
) {
  const valid = locations.filter(
    (location) =>
      Number.isFinite(Number(location.latitude)) &&
      Math.abs(Number(location.latitude)) <= 90 &&
      Number.isFinite(Number(location.longitude)) &&
      Math.abs(Number(location.longitude)) <= 180 &&
      Number.isFinite(Number(location[metric])) &&
      Number(location[metric]) > 0,
  );
  const maxWeight = valid.reduce(
    (maximum, location) => Math.max(maximum, Number(location[metric])),
    1,
  );
  return valid.map((location) => ({
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    weight: 1 + (19 * Number(location[metric])) / maxWeight,
  }));
}
export function rankedLocations(
  locations: LocationAnalytics[],
  metric: AnalyticsMetric,
) {
  return [...locations].sort(
    (a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name),
  );
}
