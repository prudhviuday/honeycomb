import { useState } from 'react';
import { User as UserIcon, Mail, MapPin, LogOut, ChevronRight, Award, Share2, Pencil, Gift } from 'lucide-react';
import type { Tab } from '@/app/AppShell';
import type { Campaign } from '@/types';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import { signOut, upsertProfile } from '@/modules/profile/api/profileApi';
import { getDisplayName, normalizeProfileInput } from '@/modules/profile/logic/profileLogic';
import { registerActivity } from '@/modules/analytics/api/analyticsApi';
import { ProfileEditModal } from '@/modules/profile/ui/ProfileEditModal';

interface Props {
  onNavigate?: (tab: Tab) => void;
  onOpenMovie?: (campaign: Campaign) => void;
}

export function ProfileScreen({ onNavigate, onOpenMovie }: Props) {
  const { user, profile } = useAuth();
  const { activeCampaign, campaignUser } = useCampaign();
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

  const points = campaignUser?.points ?? 0;
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

      {/* Stats — editorial divider style */}
      <div className="grid grid-cols-1 gap-0 mb-8 hairline-t hairline-b py-5">
        <button
          type="button"
          onClick={() => onNavigate?.('rewards')}
          aria-label="View rewards for your points"
          className="w-full text-center rounded-xl py-2 hover:bg-white/[0.03] transition-colors"
        >
          <p className="font-display text-3xl text-gold leading-none">{points}</p>
          <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em] mt-2">Points · Tap to view rewards</p>
        </button>
      </div>

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
