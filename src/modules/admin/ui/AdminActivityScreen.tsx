import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Search, UserRound, Mail, Phone, Clock3, Activity, RefreshCw, ShieldAlert } from "lucide-react";
import { checkAdminAccess, getAdminUserActivity, searchAdminUsers, type AdminUserActivityResponse, type AdminUserSearchResult } from "@/modules/admin/api/adminApi";

const fieldClass = "w-full rounded-xl border border-white/10 bg-bg-secondary px-4 py-3 text-sm text-text-primary outline-none focus:border-gold/60";
const displayDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const titleCase = (value: string | null | undefined) => (value ?? "Activity").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function AdminActivityScreen({ onBack }: { onBack: () => void }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserSearchResult[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [detail, setDetail] = useState<AdminUserActivityResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let active = true;
    checkAdminAccess().then((allowed) => { if (active) setAuthorized(allowed); });
    return () => { active = false; };
  }, []);

  const runSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    const term = query.trim();
    if (term.length < 2) { setError("Enter at least 2 characters, or paste a full user ID."); return; }
    setSearching(true); setError(""); setSearched(true); setUsers([]); setSelectedUserId(""); setDetail(null);
    try {
      const matches = await searchAdminUsers(term);
      setUsers(matches);
      if (!matches.length) setError("No users matched that name, phone number, email or user ID.");
    } catch {
      setError("User search failed. Check that your account has admin access and try again.");
    } finally { setSearching(false); }
  };

  const openUser = async (user: AdminUserSearchResult) => {
    setSelectedUserId(user.user_id); setLoadingDetail(true); setError(""); setDetail(null);
    try { setDetail(await getAdminUserActivity(user.user_id)); }
    catch { setError("Could not load this user's activity. Your admin access may have changed."); }
    finally { setLoadingDetail(false); }
  };

  if (authorized === null) return <div className="min-h-screen bg-bg-primary p-6 text-text-muted">Checking administrator access…</div>;
  if (!authorized) return (
    <div className="min-h-screen bg-bg-primary px-5 py-8 text-text-primary">
      <button type="button" onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-text-muted"><ArrowLeft size={17} /> Back</button>
      <div className="mx-auto max-w-lg rounded-2xl border border-red-400/20 bg-bg-surface p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-red-300" />
        <h1 className="text-lg font-semibold">Administrator access required</h1>
        <p className="mt-2 text-sm text-text-muted">This panel is restricted to accounts with the admin role.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-primary px-4 pb-10 pt-7 text-text-primary sm:px-6">
      <div className="mx-auto max-w-5xl">
        <button type="button" onClick={onBack} className="mb-5 flex items-center gap-2 text-sm text-text-muted transition hover:text-text-primary"><ArrowLeft size={17} /> Back to Honeycomb</button>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold">Admin tools</p><h1 className="text-2xl font-semibold sm:text-3xl">User activity</h1><p className="mt-2 max-w-xl text-sm text-text-muted">Find a user and inspect their recent campaign, QR scan, mission and reward activity.</p></div>
          <div className="rounded-xl border border-white/10 bg-bg-surface p-3 text-gold"><Activity size={22} /></div>
        </div>

        <form onSubmit={runSearch} className="mb-5 rounded-2xl border border-white/10 bg-bg-surface p-3 sm:p-4">
          <label htmlFor="admin-user-search" className="mb-2 block text-sm font-medium">Find a user</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input id="admin-user-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, email or user UUID" className={fieldClass + " pl-10"} autoComplete="off" /></div>
            <button disabled={searching} type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-bg-primary disabled:opacity-50">{searching ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}{searching ? "Searching…" : "Search users"}</button>
          </div>
          <p className="mt-2 text-xs text-text-muted">Phone search works best with at least the last 4 digits.</p>
        </form>

        {error && <div role="status" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{error}</div>}

        {users.length > 0 && <section className="mb-6"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Matching users</h2><span className="text-xs text-text-muted">{users.length} result{users.length === 1 ? "" : "s"}</span></div><div className="grid gap-2">
          {users.map((user) => <button type="button" key={user.user_id} onClick={() => void openUser(user)} className={"w-full rounded-2xl border p-4 text-left transition " + (selectedUserId === user.user_id ? "border-gold/60 bg-gold/5" : "border-white/10 bg-bg-surface hover:border-white/20")}>
            <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-gold"><UserRound size={19} /></div><div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{user.display_name}</span><span className="text-xs text-text-muted">{user.activity_count} logged events</span></div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">{user.email && <span className="inline-flex items-center gap-1.5"><Mail size={12} />{user.email}</span>}{user.phone && <span className="inline-flex items-center gap-1.5"><Phone size={12} />{user.phone}</span>}</div>
              <div className="mt-2 break-all font-mono text-[10px] text-text-muted/80">{user.user_id}</div>
            </div></div>
          </button>)}
        </div></section>}

        {loadingDetail && <div className="rounded-2xl border border-white/10 bg-bg-surface p-6 text-sm text-text-muted">Loading activity history…</div>}

        {detail && !loadingDetail && <section className="overflow-hidden rounded-2xl border border-white/10 bg-bg-surface">
          <div className="border-b border-white/10 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-text-muted">Selected user</p><h2 className="mt-1 text-xl font-semibold">{detail.user.display_name}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-text-muted">{detail.user.email && <span className="inline-flex items-center gap-1.5"><Mail size={14} />{detail.user.email}</span>}{detail.user.phone && <span className="inline-flex items-center gap-1.5"><Phone size={14} />{detail.user.phone}</span>}</div></div><button type="button" onClick={() => { const selected = users.find((u) => u.user_id === selectedUserId); if (selected) void openUser(selected); }} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-text-muted hover:text-text-primary"><RefreshCw size={13} /> Refresh</button></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-xl bg-bg-secondary p-3"><div className="text-xs text-text-muted">Activity events loaded</div><div className="mt-1 text-xl font-semibold">{detail.activities.length}</div></div><div className="rounded-xl bg-bg-secondary p-3"><div className="text-xs text-text-muted">Joined</div><div className="mt-1 text-sm font-medium">{displayDate(detail.user.created_at)}</div></div><div className="col-span-2 rounded-xl bg-bg-secondary p-3 sm:col-span-1"><div className="text-xs text-text-muted">Last active</div><div className="mt-1 text-sm font-medium">{displayDate(detail.user.last_active_at)}</div></div></div>
          <div className="mt-3 break-all font-mono text-[10px] text-text-muted">{detail.user.user_id}</div></div>
          <div className="p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-semibold">Recent activity timeline</h3><span className="text-xs text-text-muted">Newest first · up to 150 events</span></div>
            {detail.activities.length === 0 ? <p className="rounded-xl bg-bg-secondary p-4 text-sm text-text-muted">No activity events have been recorded for this user yet.</p> : <ol className="space-y-3">{detail.activities.map((item) => <li key={item.id} className="rounded-xl border border-white/10 bg-bg-secondary/60 p-3 sm:p-4"><div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold"><Activity size={15} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{titleCase(item.event_type)}</span><span className="inline-flex items-center gap-1.5 text-xs text-text-muted"><Clock3 size={12} />{displayDate(item.created_at)}</span></div><div className="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">{item.campaign_name && <span className="rounded-md bg-white/5 px-2 py-1">{item.campaign_name}</span>}{item.event_type_id != null && <span className="rounded-md bg-white/5 px-2 py-1">Event #{item.event_type_id}</span>}{item.entity_type && <span className="rounded-md bg-white/5 px-2 py-1">{titleCase(item.entity_type)}</span>}{item.origin && <span className="rounded-md bg-white/5 px-2 py-1">{item.origin}</span>}</div>
            {item.metadata && Object.keys(item.metadata).length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs text-text-muted">Event details</summary><pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/20 p-3 text-[11px] text-text-muted">{JSON.stringify(item.metadata, null, 2)}</pre></details>}
            {item.entity_id && <div className="mt-2 break-all font-mono text-[10px] text-text-muted/70">Entity ID: {item.entity_id}</div>}</div></div></li>)}</ol>}
          </div>
        </section>}
      </div>
    </div>
  );
}
