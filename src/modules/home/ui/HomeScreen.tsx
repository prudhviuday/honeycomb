import { useEffect, useMemo, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {
  Zap, MapPin, Trophy, Flame, ScanLine, Award, Gift,
  ChevronRight, ChevronDown, Check, Star, Target, X, Ticket, Clapperboard, Clock, Crown,
  Film, CalendarDays, ShoppingBag, Sparkles, Medal, MapPinned, Gamepad2,
} from 'lucide-react';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import {
  getCampaignDashboard,
  getLeaderboard,
  getMyLeaderboardPosition,
  getOverallLeaderboard,
  type CampaignDashboard,
} from '@/modules/home/api/homeApi';
import { getCompletedMissionCount } from '@/modules/home/logic/homeLogic';
import { calculateDistance } from '@/modules/maps/logic/mapData';
import type { Tab } from './AppShell';
import type { Campaign, LeaderboardEntry } from '@/types';
import { RewardIdeas } from '@/modules/rewards/ui/RewardIdeas';
import { PointsBadge, PointsIcon } from '@/components/points/PointsIndicator';
import { FanTierBadge } from '@/components/badges/FanTierBadge';
import { FanTierDetailsModal } from './FanTierDetailsModal';

interface Props {
  onNavigate?: (tab: Tab) => void;
  onOpenMovie?: (campaign: Campaign) => void;
}

const LEVEL_NAMES = [
  'New Fan',
  'Fan',
  'Super Fan',
  'Movie Buff',
  'Cinephile',
  'Hype Star',
  'Superstar',
  'Legend',
];

const levelFor = (pts: number) => Math.floor(pts / 100) + 1;

type CollectionItem = {
  id: string;
  kind: 'card' | 'ticket' | 'merch' | 'badge';
  label: string;
  sub: string;
};

type LeaderboardMode = 'overall' | 'movie';
type LeaderboardDisplayEntry = Pick<
  LeaderboardEntry,
  'id' | 'user_id' | 'display_name' | 'avatar_url' | 'points' | 'rank'
>;

type MovieCardData = {
  id: string;
  movie_title: string;
  title: string;
  hero_image_url?: string | null;
  /** Active state of the underlying movie record, separate from campaign status. */
  movieActive?: boolean;
  demo: boolean;
};

const publicMovieAsset = (fileName: string) =>
  `${import.meta.env.BASE_URL}movies/${fileName}`;

const localMovieImage = (movieTitle?: string | null) => {
  const name = String(movieTitle ?? '').toLowerCase();
  if (name.includes('baasha')) return publicMovieAsset('baasha.webp');
  if (name.includes('anniyan')) return publicMovieAsset('anniyan.jpg');
  if (name.includes('mandaadi')) return publicMovieAsset('mandaadi.jpg');
  if (name.includes('sholay')) return publicMovieAsset('sholay.jpg');
  return undefined;
};

const defaultMovieImage = publicMovieAsset('movie.jpg');

const DEMO_MOVIES: MovieCardData[] = [
  {
    id: 'demo-baasha',
    movie_title: 'Baasha',
    title: 'The Mass Hunt',
    hero_image_url: localMovieImage('Baasha'),
    demo: true,
  },
  {
    id: 'demo-anniyan',
    movie_title: 'Anniyan',
    title: 'The Mind Hunt',
    hero_image_url: localMovieImage('Anniyan'),
    demo: true,
  },
  {
    id: 'demo-mandaadi',
    movie_title: 'Mandaadi',
    title: 'The Street Hunt',
    hero_image_url: localMovieImage('Mandaadi'),
    demo: true,
  },
  {
    id: 'demo-sholay',
    movie_title: 'Sholay',
    title: 'The Classic Hunt',
    hero_image_url: localMovieImage('Sholay'),
    demo: true,
  },
];

export function HomeScreen({ onNavigate, onOpenMovie }: Props) {
  const { user, profile } = useAuth();
  const { campaigns, activeCampaign, campaignUser, overallPoints, overallPointsLoading, selectCampaign, loading: campaignsLoading } = useCampaign();
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null);
  const [dashboardKey, setDashboardKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [fanJourneyOpen, setFanJourneyOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>('overall');
  const [leaderboardCampaign, setLeaderboardCampaign] = useState<Campaign | null>(activeCampaign);
  const [leaderboardPickerOpen, setLeaderboardPickerOpen] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardDisplayEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [leaderboardReload, setLeaderboardReload] = useState(0);
  const [movieIndex, setMovieIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    loop: false,
    containScroll: false,
    dragFree: false,
    duration: 28,
  });

  // Depend on stable IDs rather than Supabase object identities. Auth token
  // refreshes can replace the User object without changing which user is signed in.
  const campaignId = activeCampaign?.id ?? null;
  const userId = user?.id ?? null;
  const currentDashboardKey = campaignId && userId ? `${campaignId}:${userId}` : null;
  const selectedLeaderboardCampaign = leaderboardCampaign ?? activeCampaign;
  const leaderboardCampaignId = selectedLeaderboardCampaign?.id ?? null;
  const leaderboardRequestCampaignId = leaderboardMode === 'movie' ? leaderboardCampaignId : null;
  const leaderboardCampaignOptions = useMemo(() => {
    const seen = new Set<string>();
    return campaigns.filter((campaign) => {
      if (seen.has(campaign.id)) return false;
      seen.add(campaign.id);
      return true;
    });
  }, [campaigns]);
  const openLeaderboard = (mode: LeaderboardMode) => {
    setLeaderboardMode(mode);
    setLeaderboardCampaign(activeCampaign);
    setLeaderboardPickerOpen(false);
    setLeaderboardOpen(true);
  }

  useEffect(() => {
    if (!leaderboardOpen) return;

    let cancelled = false;
    setLeaderboardLoading(true);
    setLeaderboardError(false);

    const load = async () => {
      try {
        let entries: LeaderboardDisplayEntry[] = [];
        if (leaderboardMode === 'overall') {
          entries = await getOverallLeaderboard();
        } else if (leaderboardRequestCampaignId) {
          const [topEntries, myPosition] = await Promise.all([
            getLeaderboard(leaderboardRequestCampaignId),
            userId
              ? getMyLeaderboardPosition(leaderboardRequestCampaignId, userId)
              : Promise.resolve(null),
          ]);
          entries = [...topEntries];
          if (myPosition && !entries.some((entry) => entry.user_id === myPosition.user_id)) {
            entries.push(myPosition);
          }
          entries.sort((a, b) => a.rank - b.rank);
        }

        if (!cancelled) setLeaderboardEntries(entries);
      } catch (error) {
        console.warn('[Home] Failed to load leaderboard:', error);
        if (!cancelled) {
          setLeaderboardEntries([]);
          setLeaderboardError(true);
        }
      } finally {
        if (!cancelled) setLeaderboardLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [leaderboardOpen, leaderboardMode, leaderboardRequestCampaignId, leaderboardReload, userId]);

  useEffect(() => {
    let cancelled = false;

    if (!campaignId || !userId) {
      setLoading(false);
      setDashboard(null);
      setDashboardKey(null);
      setLoadError(false);
      return () => {
        cancelled = true;
      };
    }

    const requestKey = `${campaignId}:${userId}`;
    setLoading(true);
    setLoadError(false);

    void getCampaignDashboard(campaignId, userId)
      .then((data) => {
        if (!cancelled) {
          setDashboard(data);
          setDashboardKey(requestKey);
        }
      })
      .catch((error) => {
        console.error('[Home] Failed to load campaign dashboard:', error);
        if (!cancelled) {
          setDashboard(null);
          setDashboardKey(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, userId, retryCount]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  // Keep the four verified local movie posters visible while we are
  // building out live campaign/movie artwork. Live campaigns follow them.
  const movies: MovieCardData[] = [
    ...DEMO_MOVIES,
    ...campaigns.map((campaign) => {
      const movieTitle = String(campaign.movie_title ?? '').trim();
      const campaignTitle = String(campaign.title ?? '').trim();

      return {
        id: campaign.id,
        movie_title: movieTitle || campaignTitle || 'Movie',
        title: campaignTitle || movieTitle || 'Movie Hunt',
        hero_image_url:
          campaign.hero_image_url ||
          localMovieImage(movieTitle) ||
          defaultMovieImage,
        movieActive: campaign.movie_active !== false,
        demo: false,
      };
    }),
  ];
  useEffect(() => {
    if (!emblaApi) return;
    const syncSelected = () => setMovieIndex(emblaApi.selectedScrollSnap());
    syncSelected();
    emblaApi.on('select', syncSelected);
    emblaApi.on('reInit', syncSelected);
    return () => {
      emblaApi.off('select', syncSelected);
      emblaApi.off('reInit', syncSelected);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const activeIndex = activeCampaign ? movies.findIndex((movie) => movie.id === activeCampaign.id) : -1;
    if (activeIndex >= 0 && activeIndex !== emblaApi.selectedScrollSnap()) {
      emblaApi.scrollTo(activeIndex);
    }
  }, [activeCampaign?.id, campaigns.length, emblaApi]);

  // Only block the screen for the first load of this user/campaign pair.
  // A refreshed auth object with the same user ID must not put Home back into
  // a full-screen spinner while its existing dashboard is already usable.
  if (campaignsLoading || (loading && dashboardKey !== currentDashboardKey)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!activeCampaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 bg-bg-primary text-center">
        <p className="text-text-primary font-semibold">No active movie campaigns</p>
        <p className="text-sm text-text-muted">Please check back when a campaign is available.</p>
      </div>
    );
  }

  if (!dashboard || loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 bg-bg-primary text-center">
        <p className="text-text-primary font-semibold">Couldn’t load your campaign</p>
        <p className="text-sm text-text-muted">Your session is still active. Try loading the campaign data again.</p>
        <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="px-4 py-2 rounded-full bg-accent text-white text-sm font-semibold">
          Try again
        </button>
      </div>
    );
  }

  // Points always come from the shared campaign membership balance, not a second dashboard fetch.
  const points = campaignUser?.points ?? 0;
  const scanCount = dashboard.scans.length;
  const completedMissions = getCompletedMissionCount(dashboard);
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
  const levelName = LEVEL_NAMES[Math.min(Math.max(level, 1), LEVEL_NAMES.length) - 1];
  const levelProgress = level >= LEVEL_NAMES.length ? 100 : points % 100;
  const challengesToNextReward = Math.max(0, 3 - (scanCount % 3));

  const nextReward = dashboard.rewards
    .filter((r) => r.points_required > points)
    .sort((a, b) => a.points_required - b.points_required)[0];
  const closestReward = nextReward ?? dashboard.rewards[0];
  const claimableCount = dashboard.rewards.filter((r) => points >= r.points_required).length;

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

  const collection: CollectionItem[] = [
    ...dashboard.rewardClaims
      .filter((c) => c.status !== 'rejected')
      .map((c) => {
        const reward = dashboard.rewards.find((r) => r.id === c.reward_id);
        const title = reward?.title ?? 'Reward';
        return {
          id: 'claim-' + c.id,
          kind: /ticket/i.test(title) ? ('ticket' as const) : ('merch' as const),
          label: title,
          sub: c.status,
        };
      }),
    ...dashboard.userBadges.map((ub) => ({
      id: 'badge-' + ub.id,
      kind: 'badge' as const,
      label: dashboard.badges.find((b) => b.id === ub.badge_id)?.name ?? 'Badge',
      sub: 'Badge',
    })),
    ...dashboard.locations
      .filter((loc) =>
        dashboard.interactionSources.some((s) => s.location_id === loc.id && scannedSourceIds.has(s.id)),
      )
      .map((loc) => ({ id: 'loc-' + loc.id, kind: 'card' as const, label: loc.name, sub: 'Campaign card' })),
  ];

  const top3 = dashboard.leaderboard.slice(0, 3);
  const me = dashboard.myLeaderboardPosition;
  const showMeSeparately = !!me && !top3.some((e) => e.user_id === me.user_id);
  const boardTopThreeOrder: (LeaderboardDisplayEntry | null)[] = leaderboardEntries.length >= 3
    ? [leaderboardEntries[1], leaderboardEntries[0], leaderboardEntries[2]]
    : leaderboardEntries.length === 2
      ? [leaderboardEntries[1], leaderboardEntries[0], null]
      : [null, leaderboardEntries[0] ?? null, null];
  const boardCurrentUser = leaderboardEntries.find((entry) => entry.user_id === user?.id) ?? null;
  const boardScope = leaderboardMode === 'overall' ? 'overall' : 'campaign';
  const boardRemainingEntries = leaderboardEntries.filter(
    (entry) => entry.rank > 3 && entry.user_id !== user?.id,
  );

  const earnedBadgeIds = new Set(dashboard.userBadges.map((b) => b.badge_id));
  const allBadges = dashboard.badges;
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Player';
  const locationLabel = profile?.city || 'Chennai';

  const safeMovieIndex = Math.min(movieIndex, Math.max(movies.length - 1, 0));

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectMovie = (index: number) => {
    if (!emblaApi || index < 0 || index >= movies.length) return;
    emblaApi.scrollTo(index);
  };

  const activateMovie = (index: number) => {
    const movie = movies[index];
    if (!movie || movie.demo) return;

    const realCampaign = campaigns.find((campaign) => campaign.id === movie.id);
    if (realCampaign) {
      void selectCampaign(realCampaign as Campaign);
      onOpenMovie?.(realCampaign);
    }
  };

  return (
    <div className="pb-8 animate-fade-in overflow-x-hidden">
      {/* TOP BAR */}
      <header className="sticky top-0 z-40 px-4 pt-3 pb-3 bg-bg-primary/85 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1 leading-none">
              <span className="font-display text-[22px] text-white tracking-wide">HONEY</span>
              <span className="font-display text-[22px] text-accent tracking-wide">BADGER</span>
            </div>
            <p className="text-[11px] text-text-muted flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-accent" aria-hidden="true" />
              <span className="font-medium text-text-primary">{locationLabel}</span>
              <ChevronRight className="w-3 h-3 rotate-90" aria-hidden="true" />
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('profile')}
            className="flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-bg-surface border border-amber-300/15 hover:border-amber-200/30 transition-colors flex-shrink-0"
            aria-label={overallPointsLoading ? 'Loading overall points' : overallPoints.toLocaleString() + ' overall points across all movies'}
          >
            <PointsBadge
              scope="overall"
              points={overallPoints}
              loading={overallPointsLoading}
              size="sm"
              valueClassName="text-xs text-text-primary"
            />
            <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-100/60">PTS</span>
          </button>
          <button
            type="button"
            onClick={() => setFanJourneyOpen(true)}
            className="fan-profile-insignia flex items-center justify-center shrink-0"
            title="View your fan rank and badge collection"
            aria-label="View your fan rank and badge collection"
          >
            <FanTierBadge points={overallPoints} size="xs" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('profile')}
            className="w-9 h-9 rounded-full overflow-hidden bg-bg-elevated border border-white/10 flex items-center justify-center flex-shrink-0"
            aria-label="Open profile"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-white">{displayName.charAt(0).toUpperCase()}</span>
            )}
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-8">
      {/* MOVIE CAROUSEL */}
      {movies.length > 0 && (
        <section id="movie-campaigns" className="scroll-mt-4">
          <div className="flex items-end justify-between px-1 mb-3">
            <div>
              <p className="text-[10px] text-accent uppercase tracking-[0.24em] font-semibold">Now playing</p>
              <h2 className="font-display text-[28px] text-text-white leading-none mt-1">MOVIES YOU CAN HUNT</h2>
            </div>
            <span className="text-[10px] text-white/38 uppercase tracking-[0.16em]">
              {campaigns.length} live
            </span>
          </div>

          <div className="relative -mx-4 px-4 select-none">
            <div
              ref={emblaRef}
              className="overflow-hidden"
              style={{ touchAction: 'pan-y pinch-zoom' }}
            >
              <div className="flex items-center gap-4 py-3">
                {movies.map((movie, index) => {
                  const isCenter = index === movieIndex;
                  const isVisible = Math.abs(index - movieIndex) <= 2;

                  return (
                    <button
                      key={movie.id}
                      type="button"
                      onClick={() => {
                        if (index !== movieIndex) {
                          selectMovie(index);
                        } else {
                          activateMovie(index);
                        }
                      }}
                      className={
                        'relative flex-[0_0_218px] w-[218px] h-[320px] text-left overflow-hidden rounded-[24px] ' +
                        'transition-[transform,opacity,filter,box-shadow] duration-300 ease-out ' +
                        (isCenter
                          ? 'z-20 scale-100 opacity-100 shadow-[0_20px_52px_-24px_rgba(0,0,0,0.9)]'
                          : isVisible
                            ? 'z-10 scale-[0.88] opacity-55 saturate-[0.65]'
                            : 'z-0 scale-[0.78] opacity-0 pointer-events-none')
                      }
                      style={{ userSelect: 'none', WebkitUserDrag: 'none' }}
                    >
                      <MovieArtwork movie={movie} isCenter={isCenter} />
                      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/12 to-transparent pointer-events-none" />
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#07070F] via-[#07070F]/55 to-transparent pointer-events-none" />
                      <div className={
                        'absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md pointer-events-none ' +
                        (movie.demo
                          ? 'bg-black/35'
                          : movie.movieActive === false
                            ? 'bg-rose-950/85 border border-rose-400/30'
                            : 'bg-emerald-950/80 border border-emerald-400/25')
                      }>
                        <span className={'w-1.5 h-1.5 rounded-full ' +
                          (movie.demo ? 'bg-gold' : movie.movieActive === false ? 'bg-[#FF7474]' : 'bg-[#45D483]')} />
                        <span className="text-[9px] uppercase tracking-[0.12em] text-white/85">
                          {movie.demo ? 'Demo' : movie.movieActive === false ? 'Movie inactive' : 'Movie active'}
                        </span>
                      </div>
                      <div className="absolute z-20 left-4 right-4 bottom-4 pointer-events-none">
                        <p className="font-display text-[27px] text-white leading-none truncate drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
                          {String(movie.movie_title ?? '').trim() || String(movie.title ?? '').trim() || 'Movie'}
                        </p>
                        <p className="text-[10px] text-white/70 mt-1.5 truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                          {String(movie.title ?? '').trim() || 'Movie Hunt'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              {movies.map((movie, index) => (
                <button
                  key={movie.id + '-dot'}
                  type="button"
                  aria-label={`Show ${movie.movie_title || 'movie'}`}
                  onClick={() => selectMovie(index)}
                  className={
                    'h-1.5 rounded-full transition-all duration-300 ' +
                    (index === movieIndex ? 'w-5 bg-accent' : 'w-1.5 bg-white/20')
                  }
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* EXPLORE */}
      <section aria-labelledby="explore-heading">
        <div className="flex items-end justify-between mb-3">
          <h2 id="explore-heading" className="text-[17px] font-bold text-text-white tracking-tight">Explore</h2>
          <span className="text-[11px] text-text-subtle">Pick your vibe</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickAction imageSrc="movies.jpg" label="Movies" onClick={() => scrollToSection('movie-campaigns')} />
          <QuickAction imageSrc="hunt.jpg" label="Hunts" onClick={() => onNavigate?.('hunts')} />
          <QuickAction imageSrc="events.jpg" label="Events" onClick={() => scrollToSection('featured-hunt')} />
        </div>
        <div className="grid grid-cols-4 gap-2.5 mt-2.5">
          <QuickAction imageSrc="malls.jpg" label="Malls" compact onClick={() => scrollToSection('nearby-challenges')} />
          <QuickAction imageSrc="activities.jpg" label="Activities" compact onClick={() => scrollToSection('nearby-challenges')} />
          <QuickAction imageSrc="rewards.jpg" label="Rewards" compact onClick={() => onNavigate?.('rewards')} />
          <QuickAction imageSrc="leaderboard.jpg" label="Ranks" compact onClick={() => openLeaderboard('overall')} />
        </div>
      </section>

      {/* YOUR JOURNEY */}
      <section aria-label="Your progress" className="rounded-[20px] bg-bg-secondary border border-white/[0.06] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">Welcome back,</p>
            <p className="text-base font-bold text-text-white truncate">{displayName}</p>
            <div className="mt-2 flex items-center gap-1.5 min-w-0">
              <span className="text-[9px] uppercase tracking-wide text-text-subtle shrink-0">This movie</span>
              <span className="text-[10px] text-text-muted truncate">{activeCampaign.movie_title || activeCampaign.title}</span>
              <PointsBadge scope="campaign" points={points} size="xs" className="ml-auto rounded-full border border-orange-300/15 bg-orange-400/[0.06] px-1.5 py-1" valueClassName="text-[10px] text-orange-200" />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white/[0.035] border border-white/[0.08]">
            <FanTierBadge points={points} size="xs" />
            <span className="text-[11px] font-semibold text-gold">{levelName}</span>
            <span className="text-[10px] text-gold/60">LV {Math.min(level, LEVEL_NAMES.length)}</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-text-muted">
              <span className="text-text-primary font-semibold">{challengesToNextReward}</span>{' '}
              {challengesToNextReward === 1 ? 'challenge' : 'challenges'} to next reward
            </span>
            <span className="text-text-subtle tabular-nums">{levelProgress}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: levelProgress + '%' }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <StatChip icon={ScanLine} value={scanCount} label="Scans" onClick={() => onNavigate?.('scanner')} />
          <StatChip icon={Target} value={completedMissions + '/' + totalMissions} label="Missions" onClick={() => onNavigate?.('hunts')} />
          <StatChip icon={Trophy} value={'#' + myRank} label="Rank" onClick={() => openLeaderboard('movie')} />
        </div>
      </section>

      {/* FEATURED HUNT */}
      {nextMission && (
        <section id="featured-hunt" className="rounded-[24px] overflow-hidden bg-bg-secondary border border-white/[0.06] scroll-mt-4">
          <div className="relative h-52">
            <div className="absolute inset-0 bg-bg-elevated" />
            {activeCampaign.hero_image_url ? (
              <img
                src={activeCampaign.hero_image_url}
                alt={activeCampaign.movie_title}
                className="w-full h-full object-cover opacity-85"
              />
            ) : (
              <PosterArtwork
                movie={{
                  id: activeCampaign.id,
                  movie_title: activeCampaign.movie_title,
                  title: activeCampaign.title,
                  hero_image_url: null,
                  demo: false,
                }}
                isCenter
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E1A] via-[#0E0E1A]/25 to-transparent" />
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-md">
              <Flame className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] text-white/90 uppercase tracking-[0.18em] font-medium">Active Hunt</span>
            </div>
            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-gold text-black font-display text-base tabular-nums">
              {missionDone}/{nextMission.target_count}
            </div>
          </div>

          <div className="px-5 pb-5 -mt-5 relative">
            <h2 className="font-display text-[26px] text-text-white leading-tight mb-1 flex items-center gap-2">
              {nextMission.title} <Clapperboard className="w-5 h-5 text-accent" />
            </h2>
            <p className="text-sm text-text-muted line-clamp-2 mb-2">{nextMission.description}</p>
            <p className="text-xs text-text-subtle flex items-center gap-1 mb-4">
              <MapPin className="w-3.5 h-3.5" /> {locationLabel} · {activeCampaign.movie_title}
            </p>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: Math.min((missionDone / Math.max(nextMission.target_count, 1)) * 100, 100) + '%' }}
                />
              </div>
              <span className="text-xs text-text-primary font-medium tabular-nums">
                {missionDone} / {nextMission.target_count}
              </span>
            </div>

            <button
              onClick={() => onNavigate?.('scanner')}
              className="w-full py-3.5 bg-accent hover:bg-accent-bright text-white rounded-[14px] font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(124, 92, 255,0.6)] active:scale-[0.98] transition-transform"
            >
              {missionDone ? 'Continue Hunt' : 'Start Hunt'}
              <span className="inline-flex items-center gap-1 text-white/70">· <PointsIcon scope="campaign" size="xs" /> +{nextMission.points_reward} pts</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* REWARD PREVIEW */}
      <RewardIdeas onOpenRewards={() => onNavigate?.('rewards')} />

      {/* NEAREST CHALLENGES */}
      {nearbyChallenges.length > 0 && (
        <section id="nearby-challenges" className="scroll-mt-4">
          <Section title="Around you" onMore={() => onNavigate?.('map')}>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
              {nearbyChallenges.map(({ loc, totalPts, km }) => (
                <button
                  key={loc.id}
                  onClick={() => onNavigate?.('map')}
                  className="flex-shrink-0 w-44 text-left bg-bg-secondary border border-white/[0.06] rounded-[18px] p-4 shadow-[0_12px_30px_-24px_rgba(232,62,140,0.55)] active:scale-[0.97] transition-transform"
                >
                  <div className="w-10 h-10 rounded-[13px] bg-gradient-to-br from-white/10 to-white/[0.02] flex items-center justify-center mb-3">
                    <MapPinned className="w-4.5 h-4.5 text-text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary truncate">{loc.name}</p>
                  <p className="text-[11px] text-text-muted truncate mb-3 flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" /> {loc.address}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-400/[0.08] text-[10px] font-semibold text-orange-200">
                      <PointsIcon scope="campaign" size="xs" /> +{totalPts} pts
                    </span>
                    {km !== null && (
                      <span className="px-2 py-0.5 rounded-full bg-white/6 text-[10px] text-text-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {km < 2 ? Math.max(1, Math.round(km * 12)) + ' min' : km.toFixed(1) + ' km'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Section>
        </section>
      )}

      {/* MY COLLECTION */}
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
            className="w-full bg-bg-secondary border border-white/[0.06] rounded-[18px] p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex -space-x-2">
              {[Clapperboard, Ticket, Star].map((Icon, i) => (
                <div key={i} className="w-9 h-9 rounded-[11px] bg-white/5 flex items-center justify-center shadow-lg">
                  <Icon className="w-4 h-4 text-white/45" />
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted flex-1">Scan your first location to start collecting campaign cards.</p>
            <ChevronRight className="w-4 h-4 text-text-subtle" />
          </button>
        )}
      </Section>

      {/* LEADERBOARD PREVIEW */}
      {dashboard.leaderboard.length > 0 && (
        <Section title="Leaderboard" onMore={() => openLeaderboard('movie')}>
          <button
            type="button"
            onClick={() => openLeaderboard('movie')}
            aria-label="Open movie leaderboard"
            className="leaderboard-preview group w-full overflow-hidden rounded-2xl border border-white/[0.08] text-left"
          >
            <div className="leaderboard-preview-list divide-y divide-white/[0.055]">
              {top3.map((entry) => (
                <div
                  key={entry.id}
                  className="leaderboard-preview-row relative flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-white/85">
                      {entry.user_id === user?.id ? 'You' : entry.display_name || 'Movie Explorer'}
                    </span>
                    <FanTierBadge points={entry.points} size="xs" showLabel className="shrink-0" />
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-display text-sm font-semibold tabular-nums text-white/90">
                    <PointsIcon scope="campaign" size="xs" />
                    {entry.points.toLocaleString()}
                  </span>
                </div>
              ))}
              {showMeSeparately && me && (
                <div
                  className="leaderboard-preview-row leaderboard-preview-row-you relative flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-violet-100/90">You</span>
                    <FanTierBadge points={me.points} size="xs" showLabel className="shrink-0" />
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-display text-sm font-semibold tabular-nums text-violet-100">
                    <PointsIcon scope="campaign" size="xs" />
                    {me.points.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </button>
        </Section>
      )}

      {/* ACHIEVEMENTS */}
      {allBadges.length > 0 && (
        <Section title="Achievements" onMore={() => onNavigate?.('profile')}>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {allBadges.map((badge) => {
              const earned = earnedBadgeIds.has(badge.id);
              return (
                <div key={badge.id} className="flex-shrink-0 w-[68px] flex flex-col items-center">
                  <div
                    className={
                      'w-14 h-14 rounded-full flex items-center justify-center mb-1.5 ' +
                      (earned
                        ? 'bg-gradient-to-br from-accent/25 to-accent/5 shadow-[0_0_18px_rgba(124, 92, 255,0.22)]'
                        : 'bg-white/5')
                    }
                  >
                    {earned ? (
                      <Star className="w-6 h-6 text-accent" fill="currentColor" />
                    ) : (
                      <Award className="w-6 h-6 text-text-subtle" />
                    )}
                  </div>
                  <p className={'text-[10px] text-center leading-tight ' + (earned ? 'text-text-primary' : 'text-text-subtle')}>
                    {badge.name}
                  </p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* RECENT ACTIVITY */}
      {dashboard.scans.length > 0 && (
        <Section title="Recent activity">
          <div className="bg-bg-secondary border border-white/[0.06] rounded-[18px] px-4 py-1.5">
            {dashboard.scans.slice(0, 4).map((scan) => {
              const source = dashboard.interactionSources.find((s) => s.id === scan.interaction_source_id);
              return (
                <div key={scan.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-b-0">
                  <ScanLine className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{source?.name ?? 'QR Scan'}</p>
                    <p className="text-[11px] text-text-subtle">
                      {new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 font-display text-base text-accent"><PointsIcon scope="campaign" size="xs" />+{scan.points_awarded}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <div className="flex items-baseline justify-center gap-0.5 pt-2">
        <span className="font-display text-xs text-white/20">HONEY</span>
        <span className="font-display text-xs text-accent">BADGER</span>
        <span className="text-[9px] text-white/20 uppercase tracking-[0.2em] ml-1">Media</span>
      </div>

      </div>

      {fanJourneyOpen && (
        <FanTierDetailsModal
          points={overallPoints}
          onClose={() => setFanJourneyOpen(false)}
        />
      )}

      {/* LEADERBOARD SHEET */}
      {leaderboardOpen && (
        <div
          className="fixed inset-0 z-[60] max-w-lg mx-auto"
          onClick={() => setLeaderboardOpen(false)}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Honeycomb leaderboard"
            className="absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] border border-white/10 bg-[#0B0B14] shadow-[0_-18px_60px_rgba(0,0,0,0.55)] animate-slide-up flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="relative shrink-0 px-5 pt-3 pb-4 border-b border-white/[0.07]">
              <div className="pointer-events-none absolute -top-24 -right-10 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl animate-aurora" />
              <div className="pointer-events-none absolute top-12 -left-12 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
              <div className="relative">
                <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-4" />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="leaderboard-trophy-wrap relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-300/20 via-amber-500/10 to-violet-500/15 shadow-[0_0_30px_rgba(245,190,75,0.12)]">
                      <Trophy className="h-6 w-6 text-amber-200" />
                      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(253,224,71,0.85)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-amber-200/75">Honeycomb rankings</p>
                      <h2 className="font-display text-[26px] leading-tight tracking-wide text-white">Leaderboard</h2>
                      <p className="mt-0.5 text-[11px] text-white/45">Every scan brings you closer to the crown.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close leaderboard"
                    onClick={() => setLeaderboardOpen(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.07] bg-black/25 p-1">
                  <button
                    type="button"
                    onClick={() => { setLeaderboardMode('overall'); setLeaderboardPickerOpen(false); }}
                    className={'flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all ' + (leaderboardMode === 'overall'
                      ? 'bg-gradient-to-r from-amber-300/20 to-amber-500/10 text-amber-100 shadow-inner shadow-amber-100/5 ring-1 ring-amber-300/20'
                      : 'text-white/45 hover:text-white/80')}
                  >
                    <Zap className="h-3.5 w-3.5" /> Overall
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaderboardMode('movie')}
                    className={'flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all ' + (leaderboardMode === 'movie'
                      ? 'bg-gradient-to-r from-violet-400/20 to-violet-500/10 text-violet-100 shadow-inner shadow-violet-100/5 ring-1 ring-violet-300/20'
                      : 'text-white/45 hover:text-white/80')}
                  >
                    <Film className="h-3.5 w-3.5" /> By movie
                  </button>
                </div>

                {leaderboardMode === 'movie' && (
                  <div className="relative mt-3">
                    <button
                      type="button"
                      aria-expanded={leaderboardPickerOpen}
                      onClick={() => setLeaderboardPickerOpen((open) => !open)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-2.5 text-left shadow-inner shadow-black/20 hover:border-amber-200/25 hover:bg-white/[0.07]"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {selectedLeaderboardCampaign?.hero_image_url ? (
                          <img src={selectedLeaderboardCampaign.hero_image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center"><Film className="h-4 w-4 text-white/35" /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40">Movie leaderboard</p>
                        <p className="mt-0.5 truncate text-sm font-semibold text-white">
                          {selectedLeaderboardCampaign?.movie_title || selectedLeaderboardCampaign?.title || 'Select a movie'}
                        </p>
                      </div>
                      <ChevronDown className={'h-4 w-4 shrink-0 text-white/45 transition-transform ' + (leaderboardPickerOpen ? 'rotate-180' : '')} />
                    </button>
                    {leaderboardPickerOpen && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[80] max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-[#171522] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.72)] animate-scale-in">
                        {leaderboardCampaignOptions.length === 0 ? (
                          <p className="px-3 py-4 text-xs text-white/45">No movie campaigns available.</p>
                        ) : leaderboardCampaignOptions.map((campaign) => {
                          const isSelected = campaign.id === selectedLeaderboardCampaign?.id;
                          return (
                            <button
                              key={campaign.id}
                              type="button"
                              onClick={() => { setLeaderboardCampaign(campaign); setLeaderboardPickerOpen(false); }}
                              className={'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left ' + (isSelected ? 'bg-amber-300/10 ring-1 ring-amber-200/15' : 'hover:bg-white/[0.05]')}
                            >
                              <div className={'h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-white/5 ' + (isSelected ? 'ring-1 ring-amber-200/35' : '')}>
                                {campaign.hero_image_url ? (
                                  <img src={campaign.hero_image_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center"><Film className="h-4 w-4 text-white/35" /></div>
                                )}
                              </div>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-white/90">{campaign.movie_title || campaign.title}</span>
                                <span className="mt-0.5 block truncate text-[10px] text-white/40">{campaign.title}</span>
                              </span>
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-amber-200" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-4 no-scrollbar">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">
                    {leaderboardMode === 'overall' ? 'All movies · All campaigns' : (selectedLeaderboardCampaign?.movie_title || selectedLeaderboardCampaign?.title || 'Movie campaign')}
                  </p>
                  <p className="mt-0.5 text-xs text-white/55">
                    {leaderboardMode === 'overall' ? 'Your net points combined across every movie.' : 'Compete with fans hunting this movie.'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-white/45">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                  Top fans
                </span>
              </div>

              {leaderboardLoading ? (
                <div className="space-y-3 py-2" aria-label="Loading leaderboard">
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((item) => <div key={item} className={'h-36 rounded-2xl shimmer ' + (item === 1 ? '' : 'mt-5')} />)}
                  </div>
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-[62px] rounded-2xl shimmer" />)}
                </div>
              ) : leaderboardError ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-8 text-center animate-scale-in">
                  <Trophy className="mx-auto h-7 w-7 text-white/25" />
                  <p className="mt-3 text-sm font-semibold text-white/80">The rankings didn’t load</p>
                  <p className="mt-1 text-xs text-white/40">Try again to refresh the leaderboard.</p>
                  <button type="button" onClick={() => setLeaderboardReload((value) => value + 1)} className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15">Try again</button>
                </div>
              ) : leaderboardEntries.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-9 text-center animate-scale-in">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200/15 bg-amber-200/[0.06]">
                    <Trophy className="h-6 w-6 text-amber-100/60" />
                  </div>
                  <p className="mt-3 font-display text-lg text-white">The race starts here</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/45">
                    {leaderboardMode === 'overall' ? 'Earn points in a movie hunt to appear on the global board.' : 'Be the first fan to earn points for this movie.'}
                  </p>
                </div>
              ) : (
                <div className="animate-fade-in">
                  <div className="grid grid-cols-3 items-end gap-2 pb-4">
                    {boardTopThreeOrder.map((entry, index) => {
                      if (!entry) return <div key={'empty-podium-' + index} />;
                      const champion = entry.rank === 1;
                      const isMe = entry.user_id === user?.id;
                      const podiumStyle = champion
                        ? 'leaderboard-champion relative z-10 border-amber-200/25 bg-gradient-to-b from-amber-200/[0.13] via-amber-400/[0.06] to-white/[0.025] shadow-[0_10px_35px_rgba(245,190,75,0.08)]'
                        : entry.rank === 2
                          ? 'mt-5 border-slate-200/15 bg-gradient-to-b from-slate-100/[0.07] to-white/[0.025]'
                          : 'mt-7 border-orange-300/15 bg-gradient-to-b from-orange-300/[0.07] to-white/[0.02]';
                      return (
                        <div key={entry.user_id} className={'min-w-0 rounded-2xl border px-1.5 pb-3 pt-3 text-center ' + podiumStyle + ' animate-rise-in'} style={{ animationDelay: `${index * 90}ms` }}>
                          <div className="relative mx-auto mb-2 w-fit">
                            <div className={'relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 bg-[#151521] text-sm font-bold text-white ' + (champion ? 'border-amber-200/70 shadow-[0_0_18px_rgba(245,190,75,0.25)]' : entry.rank === 2 ? 'border-slate-200/45' : 'border-orange-300/40')}>
                              {entry.avatar_url ? (
                                <img src={entry.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span>{(entry.display_name || 'H').trim().charAt(0).toUpperCase() || 'H'}</span>
                              )}
                            </div>
                            {champion ? (
                              <Crown className="absolute -top-4 left-1/2 h-5 w-5 -translate-x-1/2 text-amber-200 drop-shadow-[0_0_8px_rgba(245,190,75,0.5)]" fill="currentColor" />
                            ) : (
                              <span className={'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-black ' + (entry.rank === 2 ? 'border-slate-200/30 bg-slate-200/15 text-slate-100' : 'border-orange-300/25 bg-orange-300/10 text-orange-100')}>{entry.rank}</span>
                            )}
                          </div>
                          <p className={'truncate text-[10px] font-bold ' + (isMe ? 'text-amber-100' : 'text-white/85')}>{isMe ? 'You' : entry.display_name || 'Movie Explorer'}</p>
                          <p className="mt-0.5 text-[9px] text-white/35">#{entry.rank} {champion ? '· Champion' : '· Top fan'}</p>
                          <span className={'mt-2 inline-flex max-w-full items-center justify-center gap-1 rounded-full px-1.5 py-1 font-display text-[11px] tabular-nums ' + (champion ? 'bg-amber-200/10 text-amber-100' : 'bg-white/[0.04] text-white/75')}>
                            <PointsIcon scope={boardScope} size="xs" />{entry.points.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {boardCurrentUser && boardCurrentUser.rank > 3 && (
                    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-violet-300/20 bg-gradient-to-r from-violet-400/[0.12] to-violet-400/[0.035] px-3 py-3 shadow-[0_8px_24px_rgba(124,92,255,0.08)] animate-scale-in">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-300/10 text-sm font-black text-violet-100">#{boardCurrentUser.rank}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-100/65">Your current position</p>
                        <p className="truncate text-xs font-semibold text-white">{boardCurrentUser.display_name || 'You'}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 font-display text-sm text-violet-100 tabular-nums"><PointsIcon scope={boardScope} size="xs" />{boardCurrentUser.points.toLocaleString()}</span>
                    </div>
                  )}

                  {boardRemainingEntries.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.018] px-3">
                      <div className="flex items-center justify-between border-b border-white/[0.06] py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">The leaderboard</p>
                        <span className="text-[10px] tabular-nums text-white/30">{boardRemainingEntries.length} {boardRemainingEntries.length === 1 ? 'player' : 'players'}</span>
                      </div>
                      {boardRemainingEntries.map((entry, index) => (
                        <LeaderboardListRow
                          key={entry.id}
                          entry={entry}
                          isMe={false}
                          scope={boardScope}
                          index={index}
                        />
                      ))}
                    </div>
                  )}
                  <p className="pt-4 text-center text-[9px] uppercase tracking-[0.18em] text-white/20">Play fair · Earn your place · Keep hunting</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
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
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-[14px] bg-bg-surface border border-white/[0.04] px-2.5 py-2.5 active:scale-[0.97] transition-transform hover:bg-bg-elevated"
    >
      <span className="w-8 h-8 rounded-[10px] bg-white/[0.05] flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-text-primary" aria-hidden="true" />
      </span>
      <span className="text-left leading-none min-w-0">
        <span className="block text-sm font-bold text-text-white tabular-nums">{value}</span>
        <span className="block text-[10px] text-text-subtle mt-1">{label}</span>
      </span>
    </button>
  );
}

function QuickAction({
  imageSrc,
  label,
  compact = false,
  onClick,
}: {
  imageSrc: string;
  label: string;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'group relative overflow-hidden rounded-[16px] bg-bg-surface border border-white/[0.06] text-left active:scale-[0.97] transition-transform ' +
        (compact ? 'aspect-[4/5]' : 'aspect-[3/4]')
      }
    >
      <img
        src={`${import.meta.env.BASE_URL}categories/${imageSrc}`}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        className={
          'absolute inset-0 w-full h-full object-cover transition-transform duration-500 ' +
          // The Movies artwork has a thin white edge in the source image.
          // Crop it slightly at rest, while keeping a subtle extra hover zoom.
          (imageSrc === 'movies.jpg'
            ? 'scale-[1.08] group-hover:scale-[1.13]'
            : 'group-hover:scale-105')
        }
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
      <span
        className={
          'absolute left-2.5 right-2.5 bottom-2.5 font-semibold text-white leading-tight ' +
          (compact ? 'text-[11px]' : 'text-[13px]')
        }
      >
        {label}
      </span>
    </button>
  );
}

function PosterArtwork({ movie, isCenter }: { movie: MovieCardData; isCenter: boolean }) {
  const movieName = String(movie.movie_title || movie.title || 'Movie');
  const isBaasha = /baasha/i.test(movieName);
  const isMounaRagam = /mouna/i.test(movieName);
  const isRoja = /roja/i.test(movieName);
  const isGhilli = /ghilli/i.test(movieName);
  const theme =
    isBaasha
      ? { bg: '#5C160F', accent: '#FF8A5B', glow: '#EF4444', shape: 'action' }
      : isMounaRagam
        ? { bg: '#421D3A', accent: '#F7A1D4', glow: '#A78BFA', shape: 'romance' }
        : isRoja
          ? { bg: '#4A1124', accent: '#FF6B7A', glow: '#8B5CF6', shape: 'dramatic' }
          : isGhilli
            ? { bg: '#163752', accent: '#FF9C54', glow: '#31A8FF', shape: 'energy' }
            : { bg: '#31152B', accent: '#F04F9B', glow: '#8B5CF6', shape: 'default' };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(155deg,' + theme.bg + ' 0%, #120B12 100%)' }}
    >
      <div
        className="absolute w-40 h-40 rounded-full blur-3xl opacity-70"
        style={{ background: theme.glow, top: '-20%', right: '-18%' }}
      />
      <div
        className="absolute w-52 h-52 rounded-full blur-3xl opacity-25"
        style={{ background: theme.accent, bottom: '-25%', left: '-18%' }}
      />
      {theme.shape === 'action' && (
        <>
          <div className="absolute w-28 h-60 rotate-[25deg] -right-8 top-8 bg-[#F97316]/20 blur-xl" />
          <div className="absolute left-[-25%] top-[28%] w-[150%] h-1 bg-[#FF8A5B]/60 rotate-[-16deg] blur-[1px]" />
          <div className="absolute left-[15%] top-[42%] w-20 h-20 rounded-full bg-black/40 border border-[#FF8A5B]/35" />
        </>
      )}
      {theme.shape === 'romance' && (
        <>
          <div className="absolute w-36 h-36 rounded-full border border-pink-200/20 left-[12%] top-[24%]" />
          <div className="absolute w-48 h-48 rounded-full border border-violet-300/15 left-[4%] top-[18%]" />
          <div className="absolute left-[18%] right-[18%] bottom-[24%] h-1 rounded-full bg-pink-200/30 blur-[1px]" />
        </>
      )}
      {theme.shape === 'dramatic' && (
        <>
          <div className="absolute inset-x-[-20%] top-[30%] h-40 bg-gradient-to-b from-transparent via-red-500/15 to-transparent rotate-[-14deg]" />
          <div className="absolute w-32 h-32 rounded-full border border-rose-300/20 right-[8%] top-[25%]" />
        </>
      )}
      {theme.shape === 'energy' && (
        <>
          <div className="absolute w-56 h-56 border-[18px] border-cyan-300/10 rounded-full -right-20 top-4" />
          <div className="absolute left-[-8%] top-[26%] w-[120%] h-24 bg-gradient-to-r from-transparent via-blue-400/20 to-transparent rotate-[22deg] blur-sm" />
          <div className="absolute right-[15%] top-[44%] w-3 h-16 bg-orange-300/60 rotate-[26deg] shadow-[0_0_18px_rgba(255,156,84,0.6)]" />
        </>
      )}
      {theme.shape === 'default' && (
        <div className="absolute inset-8 rounded-[28px] border border-white/10" />
      )}

      <svg viewBox="0 0 100 140" className="absolute inset-0 w-full h-full opacity-70">
        <defs>
          <linearGradient id={'posterFade-' + movie.id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="68%" stopColor="rgba(8,5,9,0.2)" />
            <stop offset="100%" stopColor="rgba(8,5,9,0.92)" />
          </linearGradient>
        </defs>
        <path d="M6 108 C 20 86, 36 91, 49 106 C 64 121, 78 84, 94 70 L 100 140 L 0 140 Z" fill="rgba(5,5,8,0.35)" />
        <rect width="100" height="140" fill={'url(#posterFade-' + movie.id + ')'} />
      </svg>

      <div className="absolute left-4 right-4 bottom-16">
        <div className="text-[9px] uppercase tracking-[0.22em] font-semibold" style={{ color: theme.accent }}>
          Honeycomb Original
        </div>
        <div className={'font-display text-white leading-[0.9] mt-1 ' + (isCenter ? 'text-[33px]' : 'text-[24px]')}>
          {movieName}
        </div>
      </div>
    </div>
  );
}

function MovieArtwork({ movie, isCenter }: { movie: MovieCardData; isCenter: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);

  const movieTitle = String(movie.movie_title ?? '').trim();
  const localFallback = localMovieImage(movieTitle);
  const primaryImage = movie.hero_image_url || localFallback || defaultMovieImage;
  const displayTitle = movieTitle || String(movie.title ?? '').trim() || 'Movie';

  useEffect(() => {
    setImageFailed(false);
  }, [movie.id, movie.hero_image_url, movie.movie_title, movie.title]);

  const imageSrc =
    !imageFailed && primaryImage
      ? primaryImage
      : !imageFailed
        ? undefined
        : movie.hero_image_url && movie.hero_image_url !== primaryImage
          ? movie.hero_image_url
          : undefined;

  return (
    <div className="absolute inset-0 bg-[#0E0E1A] z-0">
      {imageSrc ? (
        <img
          key={imageSrc}
          src={imageSrc}
          alt={displayTitle}
          draggable={false}
          className="absolute inset-0 z-0 w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 z-0">
          <PosterArtwork movie={{ ...movie, movie_title: displayTitle }} isCenter={isCenter} />
        </div>
      )}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#07070F]/95 via-[#07070F]/5 to-transparent pointer-events-none" />
    </div>
  );
}

const collectionStyle: Record<CollectionItem['kind'], { icon: typeof Zap; tone: string }> = {
  card: { icon: Clapperboard, tone: 'from-accent/25 to-accent/5 text-text-primary' },
  ticket: { icon: Ticket, tone: 'from-rose-400/25 to-orange-400/5 text-rose-200' },
  merch: { icon: Gift, tone: 'from-cyan-400/25 to-blue-400/5 text-cyan-200' },
  badge: { icon: Star, tone: 'from-emerald-400/25 to-green-400/5 text-emerald-200' },
};

function CollectionTile({ item }: { item: CollectionItem }) {
  const { icon: Icon, tone } = collectionStyle[item.kind];
  return (
    <div className="flex-shrink-0 w-24 bg-bg-secondary border border-white/[0.06] rounded-[16px] p-2.5">
      <div className={'h-16 rounded-[11px] bg-gradient-to-br flex items-center justify-center mb-2 ' + tone}>
        <Icon className="w-7 h-7" />
      </div>
      <p className="text-[11px] font-medium text-text-primary truncate">{item.label}</p>
      <p className="text-[9px] text-text-subtle uppercase tracking-wide truncate">{item.sub}</p>
    </div>
  );
}

function LeaderboardListRow({
  entry,
  isMe,
  scope,
  index,
}: {
  entry: LeaderboardDisplayEntry;
  isMe: boolean;
  scope: 'overall' | 'campaign';
  index: number;
}) {
  const playerName = isMe ? 'You' : (entry.display_name || 'Movie Explorer');
  return (
    <div
      className={'leaderboard-row-reveal flex items-center gap-3 border-b border-white/[0.055] py-3 last:border-b-0 ' + (isMe ? 'rounded-xl bg-violet-300/[0.06] px-2' : '')}
    >
      <span className={'w-6 shrink-0 text-center font-display text-sm tabular-nums ' + (entry.rank === 1 ? 'text-amber-200' : entry.rank === 2 ? 'text-slate-200' : entry.rank === 3 ? 'text-orange-200' : 'text-white/35')}>
        {entry.rank}
      </span>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.045] text-xs font-bold text-white/70">
        {entry.avatar_url ? <img src={entry.avatar_url} alt="" className="h-full w-full object-cover" /> : (entry.display_name || 'H').trim().charAt(0).toUpperCase() || 'H'}
      </div>
      <div className="min-w-0 flex-1">
        <p className={'truncate text-xs font-semibold ' + (isMe ? 'text-violet-100' : 'text-white/85')}>{playerName}</p>
        <div className="mt-1"><FanTierBadge points={entry.points} size="sm" showLabel /></div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-display text-sm tabular-nums text-white/80">
        <PointsIcon scope={scope === 'overall' ? 'overall' : 'campaign'} size="xs" />
        {entry.points.toLocaleString()}
      </span>
    </div>
  );
}

function LeaderRow({ entry, isMe }: { entry: CampaignDashboard['leaderboard'][number]; isMe: boolean }) {
  const medal = ['text-gold', 'text-zinc-300', 'text-amber-600'][entry.rank - 1];
  return (
    <div className={'flex items-center gap-3 py-2.5 border-b border-white/5 last:border-b-0 ' + (isMe ? '-mx-2 px-2 rounded-[10px] bg-accent/10' : '')}>
      <span className={'font-display text-base w-6 text-center ' + (medal ?? 'text-text-muted')}>
        {entry.rank <= 3 ? <Trophy className="w-4 h-4 inline" fill="currentColor" /> : entry.rank}
      </span>
      <span className="flex-1 min-w-0">
        <span className={'block text-sm truncate ' + (isMe ? 'text-text-primary font-semibold' : 'text-text-primary')}>
          {isMe ? 'You' : entry.display_name}
        </span>
        <span className="block mt-1"><FanTierBadge points={entry.points} size="xs" showLabel /></span>
      </span>
      <span className="inline-flex items-center gap-1 font-display text-sm text-text-primary tabular-nums"><PointsIcon scope="campaign" size="xs" />{entry.points.toLocaleString()}</span>
    </div>
  );
}

function Section({ title, onMore, children }: { title: string; onMore?: () => void; children: ReactNode }) {
  return (
    <section className="pt-1">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-display text-[22px] text-text-primary tracking-wide">{title}</h3>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-text-muted active:scale-95 transition-transform"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
