import { useState, useEffect } from 'react';
import { User as UserIcon, Mail, MapPin, LogOut, ChevronRight, Award, Activity, Share2, ScanLine, Pencil } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { signOut, upsertProfile } from '@/modules/profile/api/profileApi';
import { getActivityEvents } from '@/modules/analytics/api/analyticsApi';
import { getDisplayName, normalizeProfileInput } from '@/modules/profile/logic/profileLogic';
import type { ActivityEvent } from '@/types';
import { ProfileEditModal } from '@/screens/ProfileEditModal';

export function ProfileScreen() {
  const { user, profile } = useAuth();
  const { activeCampaign, campaignUser } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    if (activeCampaign && user) {
      (async () => {
        try {
          const events = await getActivityEvents(activeCampaign.id, user.id);
          setActivities(events);
        } catch {
          // ignore
        } finally {
          setLoadingActivities(false);
        }
      })();
    }
  }, [activeCampaign, user]);

  const handleSignOut = async () => { await signOut(); };

  const handleSaveProfile = async (data: { display_name: string; city: string }) => {
    if (!user) return;
    await upsertProfile({ user_id: user.id, display_name: data.display_name, city: data.city });
  };

  const points = campaignUser?.points ?? 0;
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Player';
  const scanCount = activities.filter(a => a.event_type === 'scan').length;

  return (
    <div className="px-5 pt-14 pb-8 animate-fade-in">
      {/* Profile header */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative mb-4">
          <div className="w-20 h-20 rounded-full bg-bg-surface hairline flex items-center justify-center">
            <UserIcon className="w-9 h-9 text-text-muted" />
          </div>
          <button
            onClick={() => setEditing(true)}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gold flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <Pencil className="w-3 h-3 text-bg-primary" />
          </button>
        </div>
        <h1 className="font-display text-xl text-text-primary">{displayName.toUpperCase()}</h1>
        <p className="text-xs text-text-muted flex items-center gap-1.5 mt-1.5">
          <Mail className="w-3 h-3" />
          {user?.email}
        </p>
        {profile?.city && (
          <p className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
            <MapPin className="w-3 h-3" />
            {profile.city}
          </p>
        )}
      </div>

      {/* Stats — editorial divider style */}
      <div className="grid grid-cols-2 gap-0 mb-8 hairline-t hairline-b py-5">
        <div className="text-center">
          <p className="font-display text-3xl text-gold leading-none">{points}</p>
          <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em] mt-2">Points</p>
        </div>
        <div className="text-center hairline-l px-3">
          <p className="font-display text-3xl text-text-primary leading-none">{scanCount}</p>
          <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em] mt-2">Scans</p>
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-px mb-8">
        <MenuRow icon={Award} label="Badges" />
        <MenuRow icon={Share2} label="Refer Friends" />
      </div>

      {/* Activity */}
      <div className="mb-8">
        <h3 className="text-[11px] text-text-subtle uppercase tracking-[0.2em] font-medium mb-4">Activity</h3>
        {loadingActivities ? (
          <div className="text-center py-6">
            <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : activities.length === 0 ? (
          <div className="bg-bg-surface hairline rounded-[10px] py-10 flex flex-col items-center">
            <Activity className="w-7 h-7 text-text-subtle mb-3" />
            <p className="text-xs text-text-muted">No activity yet</p>
          </div>
        ) : (
          <div className="space-y-px">
            {activities.slice(0, 15).map((event) => (
              <div key={event.id} className="flex items-center gap-3 py-3 hairline-b last:border-b-0">
                <div className="w-7 h-7 rounded-full bg-bg-surface flex items-center justify-center flex-shrink-0">
                  {event.event_type === 'scan'
                    ? <ScanLine className="w-3.5 h-3.5 text-gold" />
                    : <Activity className="w-3.5 h-3.5 text-text-subtle" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary capitalize">{event.event_type.replace(/_/g, ' ')}</p>
                  <p className="text-[11px] text-text-subtle">{new Date(event.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-3.5 text-red-400/70 font-medium text-sm hairline rounded-[10px] hover:bg-red-500/5 transition-colors"
      >
        <LogOut className="w-[18px] h-[18px]" />
        Sign Out
      </button>

      {/* Brand footer */}
      <div className="flex items-baseline justify-center gap-0.5 mt-8 mb-2">
        <span className="font-display text-xs text-text-subtle">HONEY</span>
        <span className="font-display text-xs text-gold/60">BADGER</span>
        <span className="text-[9px] text-text-subtle uppercase tracking-[0.2em] ml-1">Media</span>
      </div>

      {editing && (
        <ProfileEditModal
          profile={profile}
          onSave={handleSaveProfile}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function MenuRow({ icon: Icon, label }: { icon: typeof UserIcon; label: string }) {
  return (
    <button className="w-full flex items-center gap-3 py-3.5 hairline-b last:border-b-0 text-left hover:bg-white/[0.02] transition-colors">
      <Icon className="w-[18px] h-[18px] text-text-muted" />
      <span className="flex-1 text-sm text-text-primary">{label}</span>
      <ChevronRight className="w-4 h-4 text-text-subtle" />
    </button>
  );
}
