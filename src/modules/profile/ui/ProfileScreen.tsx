import { useState, useEffect } from 'react';
import { User as UserIcon, Mail, MapPin, LogOut, ChevronRight, Award, Share2, Pencil } from 'lucide-react';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import { signOut, upsertProfile } from '@/modules/profile/api/profileApi';
import { getDisplayName, normalizeProfileInput } from '@/modules/profile/logic/profileLogic';
import { registerActivity } from '@/modules/analytics/api/analyticsApi';
import { supabase } from '@/lib/supabase';
import { ProfileEditModal } from '@/modules/profile/ui/ProfileEditModal';

export function ProfileScreen() {
  const { user, profile } = useAuth();
  const { activeCampaign, campaignUser } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase.from('profiles').select('location_tracking_enabled').eq('user_id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (active && !error) setLocationTracking(data?.location_tracking_enabled === true);
      });
    return () => { active = false; };
  }, [user?.id]);

  const handleLocationTrackingChange = async () => {
    if (!user || locationSaving) return;
    setLocationSaving(true);
    setLocationMessage('');
    try {
      const nextEnabled = !locationTracking;
      if (nextEnabled) {
        if (!('geolocation' in navigator)) throw new Error('This browser does not support device location.');
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            maximumAge: 60_000,
            timeout: 8_000,
          });
        });
      }
      const { error } = await supabase.from('profiles')
        .update({ location_tracking_enabled: nextEnabled })
        .eq('user_id', user.id);
      if (error) throw error;
      setLocationTracking(nextEnabled);
      setLocationMessage(nextEnabled
        ? 'Location sharing is on. Coordinates are recorded only when an activity is logged.'
        : 'Location sharing is off. New activity events will not include device coordinates.');
    } catch (error) {
      const geoError = typeof error === 'object' && error !== null && 'code' in error
        ? error as GeolocationPositionError
        : null;
      const message = geoError
        ? (geoError.code === 1 ? 'Location permission was denied. Allow location in your browser settings and try again.' : 'Could not obtain your location. Please try again.')
        : error instanceof Error ? error.message : 'Could not update location settings.';
      setLocationMessage(message);
    } finally {
      setLocationSaving(false);
    }
  };

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
        <div className="text-center">
          <p className="font-display text-3xl text-gold leading-none">{points}</p>
          <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em] mt-2">Points</p>
        </div>
      </div>

      {/* Location collection is opt-in and is never background tracking. */}
      <section className="mb-8 rounded-xl hairline bg-bg-surface p-4">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-gold mt-0.5 shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-medium text-text-primary">Share location with activity history</h2>
            <p className="text-xs leading-relaxed text-text-muted mt-1">
              When enabled, your device location may be attached to logged events such as QR scans and mission completions. Authorized administrators can see those event locations and their order on a map. This does not run in the background. Your browser will ask for location permission.
            </p>
            <button type="button" disabled={locationSaving} onClick={() => void handleLocationTrackingChange()}
              className="mt-3 rounded-lg border border-gold/30 px-3 py-2 text-xs font-medium text-gold disabled:opacity-50">
              {locationSaving ? 'Updating…' : locationTracking ? 'Location sharing: On · Turn off' : 'Turn on location sharing'}
            </button>
            {locationMessage && <p role="status" className="text-xs text-text-muted mt-2">{locationMessage}</p>}
          </div>
        </div>
      </section>

      {/* Menu */}
      <div className="space-y-px mb-8">
        <MenuRow icon={Award} label="Badges" />
        <MenuRow icon={Share2} label="Refer Friends" />
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
