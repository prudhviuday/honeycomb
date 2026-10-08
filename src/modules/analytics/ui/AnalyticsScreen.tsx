import { useEffect, useMemo, useState } from "react";
import { useCampaign } from "@/application/state/CampaignContext";
import {
  getAnalyticsCampaignIds,
  getCampaignAnalytics,
} from "../api/analyticsApi";
import {
  analyticsHeatmap,
  metricLabels,
  rankedLocations,
  reportingRange,
} from "../logic/analyticsLogic";
import type { AnalyticsMetric, CampaignAnalytics } from "../types";
import { MapLibreMap } from "@/modules/maps/ui/MapLibreMap";

const dateInIndia = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const inputClass =
  "w-full rounded-lg bg-bg-secondary border border-white/20 p-2 text-sm";
export function AnalyticsScreen() {
  const { campaigns } = useCampaign();
  const [allowed, setAllowed] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState(() =>
    dateInIndia(new Date(Date.now() - 29 * 86400000)),
  );
  const [through, setThrough] = useState(() => dateInIndia(new Date()));
  const [metric, setMetric] = useState<AnalyticsMetric>("scans");
  const [locationId, setLocationId] = useState("");
  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [reportError, setError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessLoading, setAccessLoading] = useState(true);
  const error = accessError || reportError;
  const [reportLoading, setLoading] = useState(false);
  const loading = accessLoading || reportLoading;
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setAccessLoading(true);
    setAccessError("");
    getAnalyticsCampaignIds()
      .then((ids) => {
        if (active) {
          setAllowed(ids);
          setCampaignId((current) =>
            ids.includes(current) ? current : (ids[0] ?? ""),
          );
          setAccessLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setAccessError(
            "Analytics access could not be checked. Please retry or contact your campaign administrator.",
          );
          setAccessLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setData(null);
    if (!campaignId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const range = reportingRange(from, through);
      getCampaignAnalytics(campaignId, range.from, range.to)
        .then((result) => {
          if (active) setData(result);
        })
        .catch(() => {
          if (active)
            setError(
              "Campaign analytics could not be loaded. Check your access and try again.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid dates");
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [campaignId, from, through, refresh]);
  const locations = useMemo(
    () =>
      data?.locations.filter((l) => !locationId || l.id === locationId) ?? [],
    [data, locationId],
  );
  const points = useMemo(
    () => analyticsHeatmap(locations, metric),
    [locations, metric],
  );
  return (
    <section className="px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-2xl font-display">Campaign intelligence</h1>
        <p className="text-sm text-text-muted mt-1">
          Recorded activity across your campaign locations.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs">
          Campaign
          <select
            className={inputClass}
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setLocationId("");
            }}
          >
            <option value="">Select campaign</option>
            {allowed.map((id) => (
              <option key={id} value={id}>
                {campaigns.find((c) => c.id === id)?.title ?? id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          From (India time)
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Through (India time)
          <input
            type="date"
            className={inputClass}
            value={through}
            onChange={(e) => setThrough(e.target.value)}
          />
        </label>
      </div>
      <button
        className="text-sm text-gold underline"
        onClick={() => setRefresh((x) => x + 1)}
      >
        Refresh analytics
      </button>
      {loading && <p role="status">Loading analytics…</p>}
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {!loading && !error && !allowed.length && (
        <p>
          Your account has no producer analytics access. A campaign
          administrator can assign access.
        </p>
      )}
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Unique users", data.summary.unique_users],
                ["Interactions", data.summary.interactions],
                ["QR scans", data.summary.scans],
                ["Task completions", data.summary.task_completions],
                ["Reward claims", data.summary.reward_claims],
                ["Repeat users", data.summary.repeat_users],
                ["Engagement rate", `${data.summary.engagement_rate}%`],
                ["Campaign joins", data.summary.campaign_joins],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-bg-secondary p-3">
                <p className="text-xs text-text-muted">{label}</p>
                <p className="text-2xl mt-1">
                  {typeof value === "number" ? value.toLocaleString() : value}
                </p>
              </div>
            ))}
          </div>
          {!data.summary.interactions && (
            <p role="status">
              No recorded activity in this date range. Counts are not demo data.
            </p>
          )}
          <p className="text-xs text-text-muted">
            Engagement = users completing a task ÷ active users. Repeat users
            were active on two or more days in this range. Summary totals cover
            the full campaign.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              Map metric
              <select
                className={inputClass}
                value={metric}
                onChange={(e) => setMetric(e.target.value as AnalyticsMetric)}
              >
                {Object.entries(metricLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Map location
              <select
                className={inputClass}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">All locations</option>
                {data.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="relative h-72 rounded-xl overflow-hidden"
            aria-label={`${metricLabels[metric]} by campaign location`}
          >
            <MapLibreMap
              fitActivity
              features={[]}
              activityScans={[]}
              generalHeatmap={[]}
              campaignHeatmap={points}
              userLocation={null}
              onMarkerClick={() => {}}
              onMapClick={() => {}}
            />
          </div>
          <p className="text-xs text-text-muted">
            Larger glows indicate more {metricLabels[metric].toLowerCase()}.
            Points show venue coordinates. {data.unattributed_interactions}{" "}
            interactions have no location attribution.
          </p>
          <div>
            <h2 className="text-lg mb-2">Location performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">Location</th>
                    <th className="p-2 text-right">{metricLabels[metric]}</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedLocations(locations, metric).map((l) => (
                    <tr key={l.id} className="border-t border-white/10">
                      <td className="p-2">{l.name}</td>
                      <td className="p-2 text-right">
                        {l[metric].toLocaleString()}
                        {metric === "engagement_rate" ? "%" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="text-lg">Campaign stages</h2>
            <p className="text-xs text-text-muted mb-2">
              Distinct users per stage in this range. These are independent
              stage counts, not a sequential conversion cohort.
            </p>
            {[
              ["QR_SCANNED", "Scanned QR"],
              ["CAMPAIGN_JOINED", "Joined campaign"],
              ["HUNT_STARTED", "Started hunt"],
              ["TASK_COMPLETED", "Completed task"],
              ["HUNT_COMPLETED", "Completed hunt"],
              ["REWARD_CLAIMED", "Claimed reward"],
              ["SHARE_COMPLETED", "Shared"],
            ].map(([key, label]) => (
              <div
                className="flex justify-between py-2 border-b border-white/10 text-sm"
                key={key}
              >
                <span>{label}</span>
                <span>
                  {(
                    data.funnel.find((f) => f.event_type === key)?.users ?? 0
                  ).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <details className="text-sm">
            <summary>Daily activity</summary>
            <table className="w-full text-left mt-2">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Interactions</th>
                  <th>Users</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.interactions}</td>
                    <td>{d.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className="text-xs text-text-muted">
            Tracking begins when event capture is installed. Earlier activity is
            not reconstructed. Hunt and share stages require their owning
            backend to send events.
          </p>
        </>
      )}
    </section>
  );
}
