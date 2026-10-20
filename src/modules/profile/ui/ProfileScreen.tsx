import { useState } from 'react';
import { User as UserIcon, Mail, MapPin, LogOut, ChevronRight, Award, Share2, Pencil, Gift, Sparkles } from 'lucide-react';
import type { Tab } from '@/app/AppShell';
import type { Campaign } from '@/types';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import { signOut, upsertProfile } from '@/modules/profile/api/profileApi';
import { getDisplayName, normalizeProfileInput } from '@/modules/profile/logic/profileLogic';
import { registerActivity } from '@/modules/analytics/api/analyticsApi';
import { PointsIcon } from '@/components/points/PointsIndicator';
import { ProfileEditModal } from '@/modules/profile/ui/ProfileEditModal';

interface Props {
  onNavigate?: (tab: Tab) => void;
  onOpenMovie?: (campaign: Campaign) => void;
}

export function ProfileScreen({ onNavigate, onOpenMovie }: Props) {
  const { user, profile } = useAuth();
  const { activeCampaign, overallPoints, overallPointsLoading: pointsLoading } = useCampaign();
  const [editing, setEditing] = useState(false);
  const handleSignOut = async () => { await signOut(); };

  const handleSaveProfile = async (data: { display_name: string; city: string }) => {
    if (!user) return;
    const normalized = normalizeProfileInput(data);
    await upsertProfile({ user_id: user.id, ...normalized });
    void registerActivity({
      eventType: 'profile_updated',
      sourceModule: 'profile',
      metadata: { fields_updated: Object.keys(normalized) },
    });
  };

  const displayName = getDisplayName(profile?.display_name, user?.email);

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

      {/* Cross-campaign wallet: current net balance, after reward spending. */}
      <section
        aria-label="Overall points balance"
        className="relative w-full overflow-hidden rounded-[24px] text-left mb-8 p-5 border border-amber-300/20 bg-gradient-to-br from-[#30200D] via-[#19140F] to-[#101014] shadow-[0_20px_50px_-30px_rgba(245,158,11,0.5)]"
      >
        <div className="absolute -right-7 -top-9 w-36 h-36 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="absolute right-4 top-4 text-amber-200/70">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/75 flex items-center gap-2">
              <PointsIcon scope="overall" size="xs" /> Your Honeycomb balance
            </p>
            <p className="font-display text-[42px] leading-none tracking-tight text-amber-100 mt-3 tabular-nums">
              {pointsLoading ? '···' : overallPoints.toLocaleString()}
              <span className="text-sm font-semibold tracking-normal text-amber-200/70 ml-2">PTS</span>
            </p>
            <p className="text-[11px] text-white/55 mt-2">Net total across movies · redeem within each movie campaign</p>
          </div>
          <div className="shrink-0 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-[10px] font-semibold text-amber-100">
            All movies
          </div>
        </div>
      </section>

      {/* Menu */}
      <div className="space-y-px mb-8">
        <MenuRow icon={Gift} label="My Rewards" onClick={() => onNavigate?.('rewards')} />
        <MenuRow icon={Award} label="Achievements" onClick={() => onNavigate?.('home')} />
        <MenuRow
          icon={Share2}
          label="Refer Friends"
          onClick={() => {
            if (activeCampaign && onOpenMovie) onOpenMovie(activeCampaign);
            else onNavigate?.('hunts');
          }}
        />
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

function MenuRow({ icon: Icon, label, onClick }: { icon: typeof UserIcon; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 py-3.5 hairline-b last:border-b-0 text-left hover:bg-white/[0.02] transition-colors">
      <Icon className="w-[18px] h-[18px] text-text-muted" />
      <span className="flex-1 text-sm text-text-primary">{label}</span>
      <ChevronRight className="w-4 h-4 text-text-subtle" />
    </button>
  );
}
