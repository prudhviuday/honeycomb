import { useEffect, useState, type ReactNode } from 'react';
import {
  Zap, MapPin, Trophy, Flame, ScanLine, Award, Gift,
  ChevronRight, Star, Target, X, Ticket, Clapperboard, Clock, Crown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { getCampaignDashboard, type CampaignDashboard } from '@/lib/api';
import { calculateDistance } from '@/lib/mapData';
import type { Tab } from './AppShell';

interface Props {
  onNavigate?: (tab: Tab) => void;
}

// Every 100 points = 1 level (shared by the user card and leaderboard)
const levelFor = (pts: number) => Math.floor(pts / 100) + 1;

const FALLBACK_HERO = 'https://images.pexels.com/photos/2873486/pexels-photo-2873486.jpeg';

type CollectionItem = { id: string; kind: 'card' | 'ticket' | 'merch' | 'badge'; label: string; sub: string };

export function HomeScreen({ onNavigate }: Props) {
  const { user, profile } = useAuth();
  const { campaigns, activeCampaign, campaignUser, refreshCampaignUser, selectCampaign } = useCampaign();
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  useEffect(() => {
    if (activeCampaign && user) {
      (async () => {
        setLoading(true);
        try {
          const data = await getCampaignDashboard(activeCampaign.id, user.id);
          setDashboard(data);
        } catch {
          setDashboard(null);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [activeCampaign, user]);

  useEffect(() => {
    refreshCampaignUser();
  }, [refreshCampaignUser]);

  // Optional — only used to show distance on nearest challenges
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  if (loading || !dashboard || !activeCampaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const points = campaignUser?.points ?? 0;
  const scanCount = dashboard.scans.length;
  const completedMissions = dashboard.missionProgress.filter((m) => m.completed).length;
  const totalMissions = dashboard.missions.length;
  const myRank = dashboard.myLeaderboardPosition?.rank ?? '—';

  const completedMissionIds = new Set(
    dashboard.missionProgress.filter((m) => m.completed).map((m) => m.mission_id),
  );
  const nextMission = dashboard.missions.find((m) => !completedMissionIds.has(m.id));
  const nextMissionProgress = nextMission
    ? dashboard.missionProgress.find((p) => p.mission_id === nextMission.id)
    : null;
  const missionDone = nextMissionProgress?.progress ?? 0;

  const level = levelFor(points);
  const levelProgress = points % 100;
  const challengesToNextReward = Math.max(0, 3 - (scanCount % 3));

  // Next reward to show in the reward card
  const nextReward = dashboard.rewards
    .filter((r) => r.points_required > points)
    .sort((a, b) => a.points_required - b.points_required)[0];
  const closestReward = nextReward ?? dashboard.rewards[0];
  const claimableCount = dashboard.rewards.filter((r) => points >= r.points_required).length;

  // Nearest challenges — locations with sources that aren't scanned, closest first when location is known
  const scannedSourceIds = new Set(dashboard.scans.map((s) => s.interaction_source_id));
  const nearbyChallenges = dashboard.locations
    .map((loc) => {
      const srcs = dashboard.interactionSources.filter((s) => s.location_id === loc.id);
      return {
        loc,
        srcs,
        scanned: srcs.some((s) => scannedSourceIds.has(s.id)),
        totalPts: srcs.reduce((sum, s) => sum + s.points, 0),
        km: userLoc ? calculateDistance(userLoc.lat, userLoc.lng, loc.latitude, loc.longitude) : null,
      };
    })
    .filter((c) => c.srcs.length > 0 && !c.scanned)
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
    .slice(0, 6);

  // Collection — derived from claimed rewards, earned badges and scanned locations
  const collection: CollectionItem[] = [
    ...dashboard.rewardClaims
      .filter((c) => c.status !== 'rejected')
      .map((c) => {
        const reward = dashboard.rewards.find((r) => r.id === c.reward_id);
        const title = reward?.title ?? 'Reward';
        return {
          id: `claim-${c.id}`,
          kind: /ticket/i.test(title) ? ('ticket' as const) : ('merch' as const),
          label: title,
          sub: c.status,
        };
      }),
    ...dashboard.userBadges.map((ub) => ({
      id: `badge-${ub.id}`,
      kind: 'badge' as const,
      label: dashboard.badges.find((b) => b.id === ub.badge_id)?.name ?? 'Badge',
      sub: 'Badge',
    })),
    ...dashboard.locations
      .filter((loc) =>
        dashboard.interactionSources.some((s) => s.location_id === loc.id && scannedSourceIds.has(s.id)),
      )
      .map((loc) => ({ id: `loc-${loc.id}`, kind: 'card' as const, label: loc.name, sub: 'Campaign card' })),
  ];

  // Leaderboard preview — top 3 plus the user's own row if they're outside it
  const top3 = dashboard.leaderboard.slice(0, 3);
  const me = dashboard.myLeaderboardPosition;
  const showMeSeparately = !!me && !top3.some((e) => e.user_id === me.user_id);

  // Badges
  const earnedBadgeIds = new Set(dashboard.userBadges.map((b) => b.badge_id));
  const allBadges = dashboard.badges;

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Player';

  return (
    <div className="px-4 pt-10 pb-6 animate-fade-in space-y-4">
      {/* 1. CAMPAIGN RAIL — switch between live movie experiences */}
      <section className="-mx-4">
        <div className="flex items-end justify-between px-4 mb-3">
          <div>
            <p className="text-[10px] text-accent-bright uppercase tracking-[0.24em] font-semibold">Now playing</p>
            <h2 className="font-display text-2xl text-text-white leading-none mt-1">MOVIE CAMPAIGNS</h2>
          </div>
          <span className="text-[10px] text-text-subtle uppercase tracking-wider">{campaigns.length} live</span>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-2">
          {[
            ...campaigns.map((campaign) => ({ campaign, demo: false })),
            ...(campaigns.length < 4 ? [
              { campaign: { id: 'demo-baasha', movie_title: 'Baasha', title: 'The Mass Hunt', hero_image_url: 'https://images.pexels.com/photos/7991579/pexels-photo-7991579.jpeg' }, demo: true },
              { campaign: { id: 'demo-mouna-ragam', movie_title: 'Mouna Ragam', title: 'Chennai Love Story', hero_image_url: 'https://images.pexels.com/photos/7991379/pexels-photo-7991379.jpeg' }, demo: true },
              { campaign: { id: 'demo-roja', movie_title: 'Roja', title: 'The Secret Trail', hero_image_url: 'https://images.pexels.com/photos/7991486/pexels-photo-7991486.jpeg' }, demo: true },
              { campaign: { id: 'demo-ghilli', movie_title: 'Ghilli', title: 'Race to the Finish', hero_image_url: 'https://images.pexels.com/photos/7991587/pexels-photo-7991587.jpeg' }, demo: true },
            ].slice(0, 4 - campaigns.length) : []),
          ].map(({ campaign, demo }) => {
            const selected = campaign.id === activeCampaign.id;
            return (
              <button
                key={campaign.id}
                type="button"
                onClick={() => !demo && selectCampaign(campaign as typeof activeCampaign)}
                className={`relative flex-shrink-0 w-[142px] h-[190px] overflow-hidden rounded-[20px] text-left group transition-all duration-300 ${selected ? 'ring-2 ring-gold shadow-[0_12px_35px_rgba(255,184,74,0.22)] scale-[1.01]' : 'ring-1 ring-white/8 opacity-80'}`}
              >
                <img src={campaign.hero_image_url} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080910] via-[#080910]/25 to-transparent" />
                <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/45 backdrop-blur-md border border-white/10">
                  <span className={`w-1.5 h-1.5 rounded-full ${demo ? 'bg-accent' : 'bg-emerald-400'}`} />
                  <span className="text-[8px] text-white/85 uppercase tracking-[0.16em]">{demo ? 'Demo' : 'Live'}</span>
                </div>
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <p className="font-display text-[21px] text-white leading-none">{campaign.movie_title}</p>
                  <p className="text-[9px] text-white/60 uppercase tracking-wider mt-1 truncate">{campaign.title}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. PERSONALIZED USER CARD — strongest element */}
      <section className="relative overflow-hidden rounded-[26px] p-5 bg-gradient-to-br from-[#211A12] via-bg-surface to-[#0E1018] border border-gold/20 shadow-[0_18px_55px_-20px_rgba(255,184,74,0.32)]">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gold/10 blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-3.5 mb-5">
          <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-br from-gold-bright to-gold-dim flex-shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover bg-bg-elevated" />
            ) : (
              <div className="w-full h-full rounded-full bg-bg-elevated flex items-center justify-center font-display text-xl text-gold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[30px] text-text-white leading-none truncate tracking-[-0.02em]">
              Hello, {displayName}!
            </h1>
            <p className="text-xs text-text-muted flex items-center gap-1 mt-1.5">
              <MapPin className="w-3.5 h-3.5 text-gold" />
              {profile?.city || 'Chennai'}
            </p>
          </div>
        </div>

        <div className="relative flex items-end justify-between mb-2.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/15 border border-gold/30">
            <Crown className="w-3.5 h-3.5 text-gold" />
            <span className="text-xs font-semibold text-gold">Level {level}</span>
          </div>
          <p className="leading-none">
            <span className="font-display text-3xl text-gold-bright">{points.toLocaleString()}</span>
            <span className="text-xs text-text-muted ml-1">points</span>
          </p>
        </div>

        <div className="relative h-2 bg-white/8 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-gold-dim via-gold to-gold-bright rounded-full transition-all duration-500"
            style={{ width: `${levelProgress}%` }}
          />
        </div>
        <p className="relative text-xs text-text-muted mb-4">
          <span className="text-text-primary font-medium">{challengesToNextReward}</span>{' '}
          {challengesToNextReward === 1 ? 'challenge' : 'challenges'} to next reward
        </p>

        {/* Small stat chips */}
        <div className="relative flex gap-2">
          <StatChip icon={ScanLine} value={scanCount} label="Scans" onClick={() => onNavigate?.('scanner')} />
          <StatChip icon={Target} value={`${completedMissions}/${totalMissions}`} label="Missions" onClick={() => onNavigate?.('hunts')} />
          <StatChip icon={Trophy} value={`#${myRank}`} label="Rank" onClick={() => setLeaderboardOpen(true)} />
        </div>
      </section>

      {/* 3. REWARD / COUPON */}
      {dashboard.rewards.length > 0 && (
        <button
          onClick={() => onNavigate?.('rewards')}
          className="w-full flex items-center justify-between rounded-full px-4 py-2.5 bg-gold/10 border border-gold/25 active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-2 text-xs text-text-primary">
            <Ticket className="w-4 h-4 text-gold" />
            <span className="font-semibold">{dashboard.rewards.length} rewards</span>
            <span className="text-text-muted">· {claimableCount} ready</span>
          </span>
          <span className="text-xs font-semibold text-gold flex items-center gap-0.5">
            Get it <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </button>
      )}

      {closestReward && (
        <section
          onClick={() => onNavigate?.('rewards')}
          className="relative overflow-hidden rounded-[20px] bg-bg-surface hairline cursor-pointer active:scale-[0.99] transition-transform"
        >
          <div className="flex">
            <div className="flex-1 p-5 pr-3">
              <p className="text-[10px] text-gold uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" />
                {closestReward.reward_type === 'lucky_draw' ? 'Lucky Draw' : 'Guaranteed Reward'}
              </p>
              <h2 className="font-display text-xl text-text-white leading-tight mb-1.5">{closestReward.title}</h2>
              <p className="text-xs text-text-muted line-clamp-2 mb-4">
                {closestReward.description || 'Complete location challenges to unlock this reward.'}
              </p>
              <p className="text-[11px] text-text-primary font-medium mb-1.5 tabular-nums">
                {Math.min(points, closestReward.points_required).toLocaleString()} / {closestReward.points_required.toLocaleString()} pts
              </p>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full"
                  style={{ width: `${Math.min((points / Math.max(closestReward.points_required, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div className="relative w-28 flex-shrink-0">
              {closestReward.image_url ? (
                <img src={closestReward.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gold/25 to-gold/5 flex items-center justify-center">
                  <Gift className="w-10 h-10 text-gold" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-bg-surface to-transparent" />
            </div>
          </div>
          <div className="px-5 pb-4 flex justify-end">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold">
              {points >= closestReward.points_required ? 'Claim now' : 'Continue Hunt'}
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </section>
      )}

      {/* 4. FEATURED HUNT — hero gameplay card */}
      {nextMission && (
        <section className="rounded-[22px] overflow-hidden bg-bg-surface hairline">
          <div className="relative h-52">
            <img
              src={activeCampaign.hero_image_url || FALLBACK_HERO}
              alt={activeCampaign.movie_title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg-surface via-bg-surface/30 to-transparent" />
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass">
              <Flame className="w-3.5 h-3.5 text-gold" />
              <span className="text-[10px] text-gold uppercase tracking-[0.18em] font-medium">Active Hunt</span>
            </div>
            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-gold text-bg-primary font-display text-base tabular-nums">
              {missionDone}/{nextMission.target_count}
            </div>
          </div>

          <div className="px-5 pb-5 -mt-6 relative">
            <h2 className="font-display text-[26px] text-text-white leading-tight mb-1 flex items-center gap-2">
              {nextMission.title} <Clapperboard className="w-5 h-5 text-gold" />
            </h2>
            <p className="text-sm text-text-muted line-clamp-2 mb-2">{nextMission.description}</p>
            <p className="text-xs text-text-subtle flex items-center gap-1 mb-4">
              <MapPin className="w-3.5 h-3.5" /> {profile?.city || 'Chennai'} · {activeCampaign.movie_title}
            </p>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((missionDone / Math.max(nextMission.target_count, 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs text-text-primary font-medium tabular-nums">
                {missionDone} / {nextMission.target_count} completed
              </span>
            </div>

            <button
              onClick={() => onNavigate?.('scanner')}
              className="w-full py-3.5 bg-gold text-bg-primary rounded-[12px] font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-gold/20 active:scale-[0.98] transition-transform"
            >
              {missionDone ? 'Continue Hunt' : 'Start Hunt'}
              <span className="text-bg-primary/60">· +{nextMission.points_reward} XP</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* 5. NEAREST CHALLENGES — location discovery */}
      {nearbyChallenges.length > 0 && (
        <Section title="Nearest challenges" onMore={() => onNavigate?.('map')}>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {nearbyChallenges.map(({ loc, totalPts, km }) => (
              <button
                key={loc.id}
                onClick={() => onNavigate?.('map')}
                className="flex-shrink-0 w-44 text-left bg-bg-surface hairline rounded-[16px] p-4 active:scale-[0.97] transition-transform"
              >
                <div className="w-9 h-9 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center mb-3">
                  <Target className="w-4 h-4 text-gold" />
                </div>
                <p className="text-sm font-semibold text-text-primary truncate">{loc.name}</p>
                <p className="text-[11px] text-text-muted truncate mb-3 flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" /> {loc.address}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-gold/15 text-[10px] font-semibold text-gold">
                    +{totalPts} pts
                  </span>
                  {km !== null && (
                    <span className="px-2 py-0.5 rounded-full bg-white/6 text-[10px] text-text-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {km < 2 ? `${Math.max(1, Math.round(km * 12))} min` : `${km.toFixed(1)} km`}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* 6. MY COLLECTION */}
      <Section title="My collection" onMore={() => onNavigate?.('profile')}>
        {collection.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {collection.map((item) => (
              <CollectionTile key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <button
            onClick={() => onNavigate?.('scanner')}
            className="w-full bg-bg-surface hairline rounded-[16px] p-4 flex items-center gap-3 text-left"
          >
            <div className="flex -space-x-2">
              {[Clapperboard, Ticket, Star].map((Icon, i) => (
                <div key={i} className="w-9 h-9 rounded-[10px] bg-bg-elevated border border-white/8 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-text-subtle" />
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted flex-1">Scan your first location to start collecting campaign cards.</p>
            <ChevronRight className="w-4 h-4 text-text-subtle" />
          </button>
        )}
      </Section>

      {/* 7. LEADERBOARD PREVIEW */}
      {dashboard.leaderboard.length > 0 && (
        <Section title="Leaderboard" onMore={() => setLeaderboardOpen(true)}>
          <button
            onClick={() => setLeaderboardOpen(true)}
            className="w-full text-left bg-bg-surface hairline rounded-[16px] px-4 py-1.5"
          >
            {top3.map((entry) => (
              <LeaderRow key={entry.id} entry={entry} isMe={entry.user_id === user?.id} />
            ))}
            {showMeSeparately && me && (
              <>
                <div className="text-center text-text-subtle text-xs leading-none py-0.5">···</div>
                <LeaderRow entry={me} isMe />
              </>
            )}
          </button>
        </Section>
      )}

      {/* 8. ACHIEVEMENTS */}
      {allBadges.length > 0 && (
        <Section title="Achievements" onMore={() => onNavigate?.('profile')}>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {allBadges.map((badge) => {
              const earned = earnedBadgeIds.has(badge.id);
              return (
                <div key={badge.id} className="flex-shrink-0 w-[68px] flex flex-col items-center">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center mb-1.5 ${
                      earned
                        ? 'bg-gradient-to-br from-gold/30 to-gold/5 border border-gold/40 shadow-[0_0_16px_rgba(212,175,55,0.25)]'
                        : 'bg-bg-surface border border-white/8'
                    }`}
                  >
                    {earned ? (
                      <Star className="w-6 h-6 text-gold" fill="currentColor" />
                    ) : (
                      <Award className="w-6 h-6 text-text-subtle" />
                    )}
                  </div>
                  <p className={`text-[10px] text-center leading-tight ${earned ? 'text-text-primary' : 'text-text-subtle'}`}>
                    {badge.name}
                  </p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Recent activity */}
      {dashboard.scans.length > 0 && (
        <Section title="Recent activity">
          <div className="bg-bg-surface hairline rounded-[16px] px-4 py-1.5">
            {dashboard.scans.slice(0, 4).map((scan) => {
              const source = dashboard.interactionSources.find((s) => s.id === scan.interaction_source_id);
              return (
                <div key={scan.id} className="flex items-center gap-3 py-2.5 hairline-b last:border-b-0">
                  <ScanLine className="w-4 h-4 text-gold flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{source?.name ?? 'QR Scan'}</p>
                    <p className="text-[11px] text-text-subtle">
                      {new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <span className="font-display text-base text-gold">+{scan.points_awarded}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Brand footer */}
      <div className="flex items-baseline justify-center gap-0.5 pt-4">
        <span className="font-display text-xs text-text-subtle">HONEY</span>
        <span className="font-display text-xs text-gold/60">BADGER</span>
        <span className="text-[9px] text-text-subtle uppercase tracking-[0.2em] ml-1">Media</span>
      </div>

      {/* Full leaderboard sheet */}
      {leaderboardOpen && (
        <div className="fixed inset-0 z-[60] max-w-md mx-auto" onClick={() => setLeaderboardOpen(false)}>
          <div className="absolute inset-0 bg-black/50 animate-fade-in" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-bg-secondary rounded-t-[20px] hairline-t animate-slide-up max-h-[80%] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-3 pb-3 px-5">
              <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl text-text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-gold" /> Leaderboard
                </h3>
                <button onClick={() => setLeaderboardOpen(false)} className="text-text-subtle hover:text-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto no-scrollbar px-5 pb-8">
              {dashboard.leaderboard.map((entry) => (
                <LeaderRow key={entry.id} entry={entry} isMe={entry.user_id === user?.id} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, onMore, children }: { title: string; onMore?: () => void; children: ReactNode }) {
  return (
    <section className="pt-2">
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h3 className="font-display text-lg text-text-primary tracking-wide">{title}</h3>
        {onMore && (
          <button onClick={onMore} className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-text-muted">
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function StatChip({
  icon: Icon,
  value,
  label,
  onClick,
}: {
  icon: typeof Zap;
  value: string | number;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center gap-2 rounded-[12px] bg-black/30 border border-white/6 px-2.5 py-2 active:scale-[0.97] transition-transform"
    >
      <Icon className="w-3.5 h-3.5 text-gold flex-shrink-0" />
      <span className="text-left leading-none">
        <span className="block font-display text-sm text-text-primary">{value}</span>
        <span className="block text-[9px] text-text-subtle uppercase tracking-wide mt-0.5">{label}</span>
      </span>
    </button>
  );
}

const collectionStyle: Record<CollectionItem['kind'], { icon: typeof Zap; tone: string }> = {
  card: { icon: Clapperboard, tone: 'from-gold/25 to-gold/5 border-gold/30' },
  ticket: { icon: Ticket, tone: 'from-rose-400/25 to-rose-400/5 border-rose-400/30' },
  merch: { icon: Gift, tone: 'from-sky-400/25 to-sky-400/5 border-sky-400/30' },
  badge: { icon: Star, tone: 'from-emerald-400/25 to-emerald-400/5 border-emerald-400/30' },
};

function CollectionTile({ item }: { item: CollectionItem }) {
  const { icon: Icon, tone } = collectionStyle[item.kind];
  return (
    <div className="flex-shrink-0 w-24 bg-bg-surface hairline rounded-[14px] p-2.5">
      <div className={`h-16 rounded-[10px] bg-gradient-to-br border flex items-center justify-center mb-2 ${tone}`}>
        <Icon className="w-7 h-7 text-text-white" />
      </div>
      <p className="text-[11px] font-medium text-text-primary truncate">{item.label}</p>
      <p className="text-[9px] text-text-subtle uppercase tracking-wide truncate">{item.sub}</p>
    </div>
  );
}

function LeaderRow({ entry, isMe }: { entry: CampaignDashboard['leaderboard'][number]; isMe: boolean }) {
  const medal = ['text-gold', 'text-zinc-300', 'text-amber-600'][entry.rank - 1];
  return (
    <div className={`flex items-center gap-3 py-2.5 hairline-b last:border-b-0 ${isMe ? '-mx-2 px-2 rounded-[10px] bg-gold/10' : ''}`}>
      <span className={`font-display text-base w-6 text-center ${medal ?? 'text-text-muted'}`}>
        {entry.rank <= 3 ? <Trophy className="w-4 h-4 inline" fill="currentColor" /> : entry.rank}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm truncate ${isMe ? 'text-gold font-semibold' : 'text-text-primary'}`}>
          {isMe ? 'You' : entry.display_name}
        </span>
        <span className="block text-[10px] text-text-subtle">Lv. {levelFor(entry.points)}</span>
      </span>
      <span className="font-display text-sm text-text-primary tabular-nums">{entry.points.toLocaleString()}</span>
    </div>
  );
}
