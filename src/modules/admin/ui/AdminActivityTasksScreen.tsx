import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, CircleAlert, ClipboardList, Film, ListChecks, Plus, RefreshCw, ShieldCheck, Activity } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ActivityType = { id: number; code: string; description: string | null; is_important: boolean };
type Campaign = { id: string; name: string; active: boolean };
type Mission = { id: string; name: string; campaign_id: string | null; target_value: number; reward_points: number; progress_event_type_id: number | null; progress_mode: "event_count" | "distinct_entities"; is_active: boolean };
type ActivityLog = { activity_number: number; event_type_id: number; user_id: string | null; campaign_id: string | null; entity_type: string | null; entity_id: string | null; created_at: string; event_key: string | null };

type Section = "activities" | "tasks" | "logs";
const fieldClass = "mt-1 w-full rounded-xl border border-white/10 bg-[#101013] px-3 py-2.5 text-sm text-white outline-none focus:border-[#E9B44C]";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function AdminActivityTasksScreen() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("activities");
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [activityName, setActivityName] = useState("");
  const [activityCode, setActivityCode] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [important, setImportant] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [eventTypeId, setEventTypeId] = useState("");
  const [progressMode, setProgressMode] = useState<"event_count" | "distinct_entities">("event_count");
  const [targetCount, setTargetCount] = useState("3");
  const [rewardPoints, setRewardPoints] = useState("50");

  const loadData = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    const { data: adminResult, error: adminError } = await supabase.rpc("is_admin");
    if (adminError || adminResult !== true) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    setAuthorized(true);
    const [typeResult, campaignResult, missionResult, logResult] = await Promise.all([
      supabase.from("activity_event_types").select("id,code,description,is_important").order("id"),
      supabase.from("campaigns").select("id,name,active").order("name"),
      supabase.from("missions").select("id,name,campaign_id,target_value,reward_points,progress_event_type_id,progress_mode,is_active").order("created_at", { ascending: false }),
      supabase.from("activity_events").select("activity_number,event_type_id,user_id,campaign_id,entity_type,entity_id,created_at,event_key").order("activity_number", { ascending: false }).limit(100),
    ]);
    const errors = [typeResult.error, campaignResult.error, missionResult.error, logResult.error].filter(Boolean);
    if (errors.length) setNotice({ kind: "error", message: errors.map((error) => error?.message).join(" · ") });
    if (typeResult.data) setTypes(typeResult.data as ActivityType[]);
    if (campaignResult.data) setCampaigns(campaignResult.data as Campaign[]);
    if (missionResult.data) setMissions(missionResult.data as Mission[]);
    if (logResult.data) setLogs(logResult.data as ActivityLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activityName.trim() || !/^[a-z][a-z0-9_]{2,62}$/.test(activityCode.trim())) {
      setNotice({ kind: "error", message: "Enter a name and a code using lowercase letters, numbers and underscores (3–63 characters)." });
      return;
    }
    setSaving(true); setNotice(null);
    const nextId = Math.max(0, ...types.map((item) => item.id)) + 1;
    const { error } = await supabase.from("activity_event_types").insert({
      id: nextId, code: activityCode.trim(), description: activityDescription.trim() || activityName.trim(), is_important: important,
    });
    setSaving(false);
    if (error) { setNotice({ kind: "error", message: error.message }); return; }
    setActivityName(""); setActivityCode(""); setActivityDescription(""); setImportant(false);
    setNotice({ kind: "success", message: `Activity type created with category ID ${nextId}. This is a type ID, not an individual activity occurrence number.` });
    await loadData();
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = Number(targetCount); const points = Number(rewardPoints);
    if (!taskTitle.trim() || !campaignId || !eventTypeId || !Number.isInteger(target) || target < 1 || !Number.isInteger(points) || points < 0) {
      setNotice({ kind: "error", message: "Choose a movie campaign and activity type, and enter a positive target and a non-negative points reward." });
      return;
    }
    setSaving(true); setNotice(null);
    const { error } = await supabase.from("missions").insert({
      name: taskTitle.trim(), campaign_id: campaignId, progress_event_type_id: Number(eventTypeId),
      progress_mode: progressMode, target_value: target, reward_points: points, is_active: true,
    });
    setSaving(false);
    if (error) { setNotice({ kind: "error", message: error.message }); return; }
    setTaskTitle(""); setTargetCount("3"); setRewardPoints("50");
    setNotice({ kind: "success", message: "Task created and activated." });
    await loadData();
  }

  async function toggleTask(mission: Mission) {
    setSaving(true); setNotice(null);
    const { error } = await supabase.from("missions").update({ is_active: !mission.is_active }).eq("id", mission.id);
    setSaving(false);
    if (error) setNotice({ kind: "error", message: error.message });
    else { setNotice({ kind: "success", message: `Task ${mission.is_active ? "paused" : "activated"}.` }); await loadData(); }
  }

  if (authorized === false) {
    return <div className="min-h-screen bg-[#08080A] px-5 py-16 text-white"><div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-[#101013] p-7"><ShieldCheck className="mb-4 h-9 w-9 text-[#E9B44C]" /><h1 className="text-2xl font-bold">Admin access required</h1><p className="mt-3 text-sm leading-6 text-white/60">This console is restricted by the database admin check and row-level security. Sign in with an account whose server-side role is admin.</p><button className={`${buttonClass} mt-6 bg-white/10 text-white`} onClick={() => { window.location.href = "/"; }}> <ArrowLeft size={16}/> Return to app</button></div></div>;
  }

  const tabs: { id: Section; label: string; icon: typeof Activity }[] = [
    { id: "activities", label: "Activity types", icon: Activity },
    { id: "tasks", label: "Tasks & missions", icon: ListChecks },
    { id: "logs", label: "Activity log", icon: ClipboardList },
  ];

  return <div className="min-h-screen bg-[#08080A] px-4 pb-12 pt-5 text-white sm:px-7">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div><button onClick={() => { window.location.href = "/"; }} className="mb-3 inline-flex items-center gap-2 text-xs text-white/50 hover:text-white"><ArrowLeft size={14}/> Back to Honeycomb</button><div className="flex items-center gap-3"><div className="rounded-2xl bg-[#E9B44C]/15 p-3 text-[#E9B44C]"><ShieldCheck size={25}/></div><div><p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#E9B44C]">Honeycomb · Admin</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Activity & task management</h1></div></div><p className="mt-3 max-w-2xl text-sm text-white/55">Configure the event categories that power your movie hunts, then create campaign tasks and audit recorded activity.</p></div>
        <button onClick={() => void loadData()} disabled={loading} className={`${buttonClass} border border-white/10 bg-white/5 text-white`}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh</button>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ label: "Activity categories", value: types.length, icon: Activity }, { label: "Configured tasks", value: missions.length, icon: ListChecks }, { label: "Active tasks", value: missions.filter((m) => m.is_active).length, icon: Check }, { label: "Recent event records", value: logs.length, icon: ClipboardList }].map((metric) => <div key={metric.label} className="rounded-2xl border border-white/10 bg-[#101013] p-4"><div className="flex items-center justify-between text-xs text-white/50"><span>{metric.label}</span><metric.icon size={16}/></div><p className="mt-3 text-3xl font-bold tabular-nums">{loading ? "—" : metric.value}</p></div>)}
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#101013] p-1.5">{tabs.map((tab) => <button key={tab.id} onClick={() => setSection(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${section === tab.id ? "bg-[#E9B44C] text-black" : "text-white/60 hover:bg-white/5 hover:text-white"}`}><tab.icon size={16}/>{tab.label}</button>)}</div>

      {notice && <div role="status" className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${notice.kind === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>{notice.kind === "error" ? <CircleAlert size={17} className="mt-0.5 shrink-0"/> : <Check size={17} className="mt-0.5 shrink-0"/>}<span>{notice.message}</span></div>}

      {loading ? <div className="py-20 text-center text-sm text-white/50">Loading admin data…</div> : <>
        {section === "activities" && <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <form onSubmit={createActivity} className="h-fit rounded-2xl border border-white/10 bg-[#101013] p-5">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-[#E9B44C]/15 p-2 text-[#E9B44C]"><Plus size={19}/></div><div><h2 className="font-bold">Create activity type</h2><p className="text-xs text-white/50">Register a reusable activity category</p></div></div>
            <label className="block text-xs font-semibold text-white/70">Display name<input className={fieldClass} value={activityName} onChange={(e) => { setActivityName(e.target.value); if (!activityCode || activityCode === activityName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")) setActivityCode(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")); }} placeholder="Friend referral qualified" required /></label>
            <label className="mt-4 block text-xs font-semibold text-white/70">Stable code<input className={fieldClass} value={activityCode} onChange={(e) => setActivityCode(e.target.value)} placeholder="referral_friend_qualified" pattern="[a-z][a-z0-9_]{2,62}" required/><span className="mt-1 block font-normal text-white/35">Lowercase, starts with a letter, underscores allowed.</span></label>
            <label className="mt-4 block text-xs font-semibold text-white/70">Description<textarea className={fieldClass} rows={3} value={activityDescription} onChange={(e) => setActivityDescription(e.target.value)} placeholder="What should this event represent?"/></label>
            <label className="mt-4 flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="accent-[#E9B44C]"/> Mark as important for analytics</label>
            <button type="submit" disabled={saving} className={`${buttonClass} mt-5 w-full bg-[#E9B44C] text-black hover:bg-[#F5C96B]`}><Plus size={16}/>{saving ? "Saving…" : "Create activity type"}</button>
            <p className="mt-3 text-xs leading-5 text-white/40">Category IDs are assigned sequentially from the current registry. Keep existing IDs stable once the app starts recording them.</p>
          </form>
          <div className="rounded-2xl border border-white/10 bg-[#101013] p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Activity registry</h2><p className="mt-1 text-xs text-white/45">Numeric type ID · code · importance</p></div><span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/50">{types.length} types</span></div><div className="max-h-[620px] space-y-2 overflow-auto">{types.map((item) => <div key={item.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 p-3"><span className="min-w-10 rounded-lg bg-[#E9B44C]/10 px-2 py-1 text-center font-mono text-sm font-bold text-[#E9B44C]">{item.id}</span><div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{item.code}</p><p className="mt-1 text-xs text-white/45">{item.description || "No description"}</p></div>{item.is_important && <span className="rounded-md border border-[#E9B44C]/20 px-2 py-1 text-[10px] text-[#E9B44C]">Important</span>}</div>)}{types.length === 0 && <p className="py-8 text-center text-sm text-white/40">No activity types found.</p>}</div></div>
        </div>}

        {section === "tasks" && <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <form onSubmit={createTask} className="h-fit rounded-2xl border border-white/10 bg-[#101013] p-5">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-[#E9B44C]/15 p-2 text-[#E9B44C]"><Film size={19}/></div><div><h2 className="font-bold">Create campaign task</h2><p className="text-xs text-white/50">Set a movie, qualifying event and reward</p></div></div>
            <label className="block text-xs font-semibold text-white/70">Task name<input className={fieldClass} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Invite 3 friends to this movie" required/></label>
            <label className="mt-4 block text-xs font-semibold text-white/70">Movie campaign<select className={fieldClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} required><option value="">Select campaign…</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}{campaign.active ? "" : " (inactive)"}</option>)}</select></label>
            <label className="mt-4 block text-xs font-semibold text-white/70">Qualifying activity<select className={fieldClass} value={eventTypeId} onChange={(e) => setEventTypeId(e.target.value)} required><option value="">Select activity type…</option>{types.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.code}</option>)}</select></label>
            <label className="mt-4 block text-xs font-semibold text-white/70">Progress mode<select className={fieldClass} value={progressMode} onChange={(e) => setProgressMode(e.target.value as "event_count" | "distinct_entities")}><option value="event_count">Count qualifying events</option><option value="distinct_entities">Count unique friends / entities</option></select><span className="mt-1 block font-normal text-white/35">Use unique entities for “refer 3 different friends” so one friend cannot count three times.</span></label>
            <div className="mt-4 grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-white/70">Target count<input type="number" min="1" step="1" className={fieldClass} value={targetCount} onChange={(e) => setTargetCount(e.target.value)} required/></label><label className="block text-xs font-semibold text-white/70">Reward points<input type="number" min="0" step="1" className={fieldClass} value={rewardPoints} onChange={(e) => setRewardPoints(e.target.value)} required/></label></div>
            <button type="submit" disabled={saving || campaigns.length === 0 || types.length === 0} className={`${buttonClass} mt-5 w-full bg-[#E9B44C] text-black hover:bg-[#F5C96B]`}><Plus size={16}/>{saving ? "Saving…" : "Create and activate task"}</button>
            <p className="mt-3 text-xs leading-5 text-white/40">This creates task configuration only. Points must still be awarded by the trusted server-side activity processor, never by the browser.</p>
          </form>
          <div className="rounded-2xl border border-white/10 bg-[#101013] p-5"><div className="mb-4"><h2 className="font-bold">Configured tasks</h2><p className="mt-1 text-xs text-white/45">Pause or reactivate tasks without deleting progress</p></div><div className="space-y-3">{missions.map((mission) => { const campaign = campaigns.find((c) => c.id === mission.campaign_id); const type = types.find((t) => t.id === mission.progress_event_type_id); return <div key={mission.id} className="rounded-xl border border-white/8 bg-black/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{mission.name}</p><p className="mt-1 text-xs text-white/45">{campaign?.title || "No campaign"} · {type?.code || "Legacy task"}</p></div><span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${mission.is_active ? "bg-emerald-400/10 text-emerald-300" : "bg-white/10 text-white/45"}`}>{mission.is_active ? "Active" : "Paused"}</span></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/60"><span>Target <b className="text-white">{mission.target_value}</b> · Reward <b className="text-[#E9B44C]">{mission.reward_points} pts</b> · {mission.progress_mode || "legacy"}</span><button disabled={saving} onClick={() => void toggleTask(mission)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/5">{mission.is_active ? "Pause task" : "Activate task"}</button></div></div>; })}{missions.length === 0 && <p className="py-8 text-center text-sm text-white/40">No tasks configured yet.</p>}</div></div>
        </div>}

        {section === "logs" && <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#101013]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><h2 className="font-bold">Recent activity records</h2><p className="mt-1 text-xs text-white/45">Occurrence number is separate from activity category ID</p></div><span className="text-xs text-white/45">Latest {logs.length}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[.03] text-white/45"><tr>{["Activity #","Type ID / code","User","Campaign","Entity","Recorded"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{logs.map((log) => <tr key={log.activity_number} className="border-t border-white/5"><td className="px-4 py-3 font-mono font-bold text-[#E9B44C]">{log.activity_number}</td><td className="px-4 py-3"><span className="font-mono">{log.event_type_id}</span><span className="ml-2 text-white/60">{types.find((t) => t.id === log.event_type_id)?.code || "unknown"}</span></td><td className="px-4 py-3 font-mono text-white/55">{log.user_id ? log.user_id.slice(0, 8) + "…" : "system"}</td><td className="px-4 py-3 font-mono text-white/55">{log.campaign_id ? log.campaign_id.slice(0, 8) + "…" : "—"}</td><td className="px-4 py-3 text-white/55">{log.entity_type || "—"}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}…` : ""}</td><td className="px-4 py-3 text-white/55">{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</td></tr>)}</tbody></table>{logs.length === 0 && <p className="p-8 text-center text-sm text-white/40">No activity records found.</p>}</div></div>}
      </>}
      <footer className="mt-8 flex items-start gap-2 border-t border-white/10 pt-5 text-xs leading-5 text-white/35"><ShieldCheck size={15} className="mt-0.5 shrink-0"/> Admin-only operations are enforced by Supabase policies. If a write is denied, check the database migration and admin role configuration; do not bypass row-level security.</footer>
    </div>
  </div>;
}
