import { useEffect, useState } from 'react';
import {
  Zap, MapPin, Trophy, Flame, ScanLine, Award, Gift,
  ChevronRight, Star, Target, User as UserIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { getCampaignDashboard, type CampaignDashboard } from '@/lib/api';
import type { Tab } from './AppShell';

interface Props {
  onNavigate?: (tab: Tab) => void;
}

export function HomeScreen({ onNavigate }: Props) {
  const { user, profile } = useAuth();
  const { activeCampaign, campaignUser, refreshCampaignUser } = useCampaign();
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Level calculation — every 100 points = 1 level
  const level = Math.floor(points / 100) + 1;
  const levelProgress = points % 100;
  const challengesToNextReward = Math.max(0, 3 - (scanCount % 3));

  // Next reward to show in the reward card
  const nextReward = dashboard.rewards
    .filter((r) => r.points_required > points)
    .sort((a, b) => a.points_required - b.points_required)[0];
  const closestReward = nextReward ?? dashboard.rewards[0];

  // Nearest challenges — locations with sources that aren't scanned
  const nearbyChallenges = dashboard.locations
    .filter((loc) => {
      const srcs = dashboard.interactionSources.filter((s) => s.location_id === loc.id);
      const scanned = srcs.some((s) =>
        dashboard.scans.some((sc) => sc.interaction_source_id === s.id),
      );
      return srcs.length > 0 && !scanned;
    })
    .slice(0, 4);

  // Badges
  const earnedBadgeIds = new Set(dashboard.userBadges.map((b) => b.badge_id));
  const allBadges = dashboard.badges;

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Player';

  return (
    <div className="px-4 pt-12 pb-6 animate-fade-in">
      {/* ============================================================
          1. PERSONALIZED USER CARD — large, first visual
         ============================================================ */}
      <div className="bg-bg-surface hairline rounded-[14px] p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-bg-elevated hairline flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-6 h-6 text-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em]">Welcome back</p>
            <h1 className="font-display text-xl text-text-primary leading-tight mt-0.5">
              {displayName.toUpperCase()}
            </h1>
            <p className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {profile?.city || 'Chennai'}
            </p>
          </div>
        </div>

        {/* Level + Points */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] text-text-subtle uppercase tracking-wide">Level</p>
            <p className="font-display text-2xl text-text-primary leading-none">{level}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-text-subtle uppercase tracking-wide">Points</p>
            <p className="font-display text-2xl text-gold leading-none">{points}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-white/6 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gold rounded-full transition-all duration-500"
            style={{ width: `${levelProgress}%` }}
          />
        </div>
        <p className="text-[11px] text-text-muted">
          {challengesToNextReward} {challengesToNextReward === 1 ? 'scan' : 'scans'} to next reward
        </p>
      </div>

      {/* ============================================================
          2. REWARD / COUPON CARD
         ============================================================ */}
      {closestReward && (
        <div
          className="bg-bg-surface hairline rounded-[14px] overflow-hidden mb-4 cursor-pointer active:scale-[0.99] transition-transform"
          onClick={() => onNavigate?.('rewards')}
        >
          <div className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-[10px] bg-gold/10 flex items-center justify-center flex-shrink-0">
              <Gift className="w-6 h-6 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gold uppercase tracking-[0.15em] mb-0.5">
                {closestReward.reward_type === 'lucky_draw' ? 'Lucky Draw' : 'Guaranteed'}
              </p>
              <p className="text-sm font-medium text-text-primary truncate">{closestReward.title}</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                {points >= closestReward.points_required
                  ? 'Ready to claim'
                  : `${(closestReward.points_required - points).toLocaleString()} more points`}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-subtle flex-shrink-0" />
          </div>
          {points < closestReward.points_required && (
            <div className="h-0.5 bg-white/4">
              <div
                className="h-full bg-gold/60"
                style={{ width: `${Math.min((points / closestReward.points_required) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          3. FEATURED HUNT / MISSION CARD — large hero card
         ============================================================ */}
      {nextMission && (
        <div
          className="relative rounded-[14px] overflow-hidden mb-4 cursor-pointer active:scale-[0.99] transition-transform"
          onClick={() => onNavigate?.('scanner')}
        >
          {/* Campaign image background */}
          <div className="relative h-44">
            <img
              src={activeCampaign.hero_image_url || 'https://images.pexels.com/photos/2873486/pexels-photo-2873486.jpeg'}
              alt={activeCampaign.movie_title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/50 to-transparent" />
          </div>

          {/* Content overlay */}
          <div className="absolute inset-0 flex flex-col justify-end p-5">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-gold" />
              <p className="text-[10px] text-gold uppercase tracking-[0.2em] font-medium">Active Hunt</p>
            </div>
            <h2 className="font-display text-2xl text-text-white leading-tight mb-1">{nextMission.title}</h2>
            <p className="text-xs text-text-muted line-clamp-1 mb-3">{nextMission.description}</p>

            {/* Progress */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(((nextMissionProgress?.progress ?? 0) / nextMission.target_count) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-text-white font-medium tabular-nums">
                {nextMissionProgress?.progress ?? 0}/{nextMission.target_count}
              </span>
            </div>

            {/* CTA */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gold font-medium">+{nextMission.points_reward} XP</span>
              <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-gold text-bg-primary rounded-[8px]">
                <span className="text-xs font-semibold">
                  {nextMissionProgress?.progress ? 'Continue Hunt' : 'Start Hunt'}
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          4. NEAREST CHALLENGES — horizontal scroll cards
         ============================================================ */}
      {nearbyChallenges.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] text-text-subtle uppercase tracking-[0.2em] font-medium">
              Nearest Challenges
            </h3>
            <button onClick={() => onNavigate?.('map')} className="text-text-subtle">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-1 pb-1">
            {nearbyChallenges.map((loc) => {
              const srcs = dashboard.interactionSources.filter((s) => s.location_id === loc.id);
              const totalPts = srcs.reduce((sum, s) => sum + s.points, 0);
              return (
                <div
                  key={loc.id}
                  className="flex-shrink-0 w-40 bg-bg-surface hairline rounded-[12px] p-4 cursor-pointer active:scale-[0.97] transition-transform"
                  onClick={() => onNavigate?.('map')}
                >
                  <div className="w-9 h-9 rounded-full bg-gold/10 flex items-center justify-center mb-3">
                    <Target className="w-4 h-4 text-gold" />
                  </div>
                  <p className="text-sm font-medium text-text-primary truncate mb-1">{loc.name}</p>
                  <p className="text-[11px] text-text-muted truncate mb-3">{loc.address}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm text-gold">+{totalPts}</span>
                    <span className="text-[10px] text-text-subtle uppercase">XP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================
          5. QUICK STATS ROW — compact
         ============================================================ */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <QuickStat icon={ScanLine} value={scanCount} label="Scans" onClick={() => onNavigate?.('scanner')} />
        <QuickStat icon={Target} value={`${completedMissions}/${totalMissions}`} label="Missions" onClick={() => onNavigate?.('scanner')} />
        <QuickStat icon={Trophy} value={`#${myRank}`} label="Rank" onClick={() => onNavigate?.('rewards')} />
      </div>

      {/* ============================================================
          6. RECENT ACTIVITY — compact list
         ============================================================ */}
      {dashboard.scans.length > 0 && (
        <div className="mb-5">
          <h3 className="text-[11px] text-text-subtle uppercase tracking-[0.2em] font-medium mb-3 px-1">
            Recent Activity
          </h3>
          <div className="bg-bg-surface hairline rounded-[12px] p-4 space-y-px">
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
        </div>
      )}

      {/* ============================================================
          7. LEADERBOARD CARD — compact preview
         ============================================================ */}
      {dashboard.leaderboard.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] text-text-subtle uppercase tracking-[0.2em] font-medium">
              Leaderboard
            </h3>
            <button onClick={() => onNavigate?.('rewards')} className="text-text-subtle">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-bg-surface hairline rounded-[12px] p-4 space-y-px">
            {dashboard.leaderboard.slice(0, 3).map((entry, i) => (
              <div key={entry.id} className="flex items-center gap-3 py-2.5 hairline-b last:border-b-0">
                <span className={`font-display text-base w-6 ${i === 0 ? 'text-gold' : 'text-text-muted'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-text-primary truncate">{entry.display_name}</span>
                <span className="font-display text-sm text-text-primary">{entry.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================
          8. ACHIEVEMENTS — horizontal scroll badges
         ============================================================ */}
      {allBadges.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] text-text-subtle uppercase tracking-[0.2em] font-medium">
              Achievements
            </h3>
            <button onClick={() => onNavigate?.('profile')} className="text-text-subtle">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar px-1 pb-1">
            {allBadges.map((badge) => {
              const earned = earnedBadgeIds.has(badge.id);
              return (
                <div
                  key={badge.id}
                  className="flex-shrink-0 w-20 flex flex-col items-center"
                >
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${
                      earned
                        ? 'bg-gold/10 border border-gold/30'
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
        </div>
      )}

      {/* Brand footer */}
      <div className="flex items-baseline justify-center gap-0.5 mt-6 mb-2">
        <span className="font-display text-xs text-text-subtle">HONEY</span>
        <span className="font-display text-xs text-gold/60">BADGER</span>
        <span className="text-[9px] text-text-subtle uppercase tracking-[0.2em] ml-1">Media</span>
      </div>
    </div>
  );
}

function QuickStat({
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
      className="bg-bg-surface hairline rounded-[10px] p-3 text-center active:scale-[0.97] transition-transform"
    >
      <Icon className="w-4 h-4 text-gold mx-auto mb-1.5" />
      <p className="font-display text-lg text-text-primary leading-none">{value}</p>
      <p className="text-[9px] text-text-subtle uppercase tracking-wide mt-1">{label}</p>
    </button>
  );
}
