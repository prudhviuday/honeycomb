import { useEffect, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {
  Zap, MapPin, Trophy, Flame, ScanLine, Award, Gift,
  ChevronRight, Star, Target, X, Ticket, Clapperboard, Clock, Crown,
  Film, CalendarDays, ShoppingBag, Sparkles, Medal, MapPinned, Gamepad2,
} from 'lucide-react';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import { getCampaignDashboard, type CampaignDashboard } from '@/modules/home/api/homeApi';
import { getHomePoints, getCompletedMissionCount } from '@/modules/home/logic/homeLogic';
import { calculateDistance } from '@/modules/maps/logic/mapData';
import type { Tab } from './AppShell';
import type { Campaign } from '@/types';

interface Props {
  onNavigate?: (tab: Tab) => void;
  onOpenMovie?: (campaign: Campaign) => void;
}

const LEVEL_NAMES = [
  'Explorer',
  'Movie Fan',
  'Super Fan',
  'Movie Buff',
  'Cinema Insider',
  'Legend',
];

const levelFor = (pts: number) => Math.floor(pts / 100) + 1;

type CollectionItem = {
  id: string;
  kind: 'card' | 'ticket' | 'merch' | 'badge';
  label: string;
  sub: string;
};

type MovieCardData = {
  id: string;
  movie_title: string;
  title: string;
  hero_image_url?: string | null;
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
  const { campaigns, activeCampaign, campaignUser, refreshCampaignUser, selectCampaign } = useCampaign();
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [movieIndex, setMovieIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    loop: false,
    containScroll: false,
    dragFree: false,
    duration: 28,
  });

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

  if (loading || !dashboard || !activeCampaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const points = getHomePoints(dashboard);
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
            onClick={() => onNavigate?.('rewards')}
            className="flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-full bg-bg-surface border border-white/[0.06]"
            aria-label={points + ' points, view rewards'}
          >
            <span className="w-5 h-5 rounded-full bg-gold/15 flex items-center justify-center">
              <Zap className="w-3 h-3 text-gold" fill="currentColor" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-text-primary tabular-nums">{points.toLocaleString()}</span>
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
                      style={{ userSelect: 'none' }}
                    >
                      <MovieArtwork movie={movie} isCenter={isCenter} />
                      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/12 to-transparent pointer-events-none" />
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#08080A] via-[#08080A]/55 to-transparent pointer-events-none" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-md pointer-events-none">
                        <span className={'w-1.5 h-1.5 rounded-full ' + (movie.demo ? 'bg-gold' : 'bg-[#45D483]')} />
                        <span className="text-[9px] uppercase tracking-[0.16em] text-white/75">
                          {movie.demo ? 'Demo' : 'Live'}
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
          <QuickAction imageSrc="leaderboard.jpg" label="Ranks" compact onClick={() => setLeaderboardOpen(true)} />
        </div>
      </section>

      {/* YOUR JOURNEY */}
      <section aria-label="Your progress" className="rounded-[20px] bg-bg-secondary border border-white/[0.06] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-text-muted">Welcome back,</p>
            <p className="text-base font-bold text-text-white truncate">{displayName}</p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/20">
            <Crown className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
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
          <StatChip icon={Trophy} value={'#' + myRank} label="Rank" onClick={() => setLeaderboardOpen(true)} />
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
            <div className="absolute inset-0 bg-gradient-to-t from-[#101013] via-[#101013]/25 to-transparent" />
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
              className="w-full py-3.5 bg-accent hover:bg-accent-bright text-white rounded-[14px] font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(229,9,20,0.6)] active:scale-[0.98] transition-transform"
            >
              {missionDone ? 'Continue Hunt' : 'Start Hunt'}
              <span className="text-white/60">· +{nextMission.points_reward} XP</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

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
                    <span className="px-2 py-0.5 rounded-full bg-accent/12 text-[10px] font-semibold text-accent">
                      +{totalPts} pts
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
        <Section title="Leaderboard" onMore={() => setLeaderboardOpen(true)}>
          <button
            onClick={() => setLeaderboardOpen(true)}
            className="w-full text-left bg-bg-secondary border border-white/[0.06] rounded-[18px] px-4 py-1.5"
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
                        ? 'bg-gradient-to-br from-accent/25 to-accent/5 shadow-[0_0_18px_rgba(229,9,20,0.22)]'
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
                  <span className="font-display text-base text-accent">+{scan.points_awarded}</span>
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

      {/* LEADERBOARD SHEET */}
      {leaderboardOpen && (
        <div className="fixed inset-0 z-[60] max-w-lg mx-auto" onClick={() => setLeaderboardOpen(false)}>
          <div className="absolute inset-0 bg-[#000000]/75 backdrop-blur-sm animate-fade-in" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#101013] rounded-t-[24px] animate-slide-up max-h-[80%] flex flex-col"
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
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
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
    <div className="absolute inset-0 bg-[#101013] z-0">
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
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#08080A]/95 via-[#08080A]/5 to-transparent pointer-events-none" />
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
        <span className="block text-[10px] text-text-subtle">
          {LEVEL_NAMES[Math.min(Math.max(levelFor(entry.points), 1), LEVEL_NAMES.length) - 1]}
        </span>
      </span>
      <span className="font-display text-sm text-text-primary tabular-nums">{entry.points.toLocaleString()}</span>
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
