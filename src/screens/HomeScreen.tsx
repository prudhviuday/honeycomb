import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Zap, MapPin, Trophy, Flame, ScanLine, Award, Gift,
  ChevronRight, Star, Target, X, Ticket, Clapperboard, Clock, Crown,
  Film, CalendarDays, ShoppingBag, Sparkles, Medal, MapPinned, Gamepad2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { getCampaignDashboard, type CampaignDashboard } from '@/lib/api';
import { calculateDistance } from '@/lib/mapData';
import type { Tab } from './AppShell';
import type { Campaign } from '@/types';

interface Props {
  onNavigate?: (tab: Tab) => void;
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

export function HomeScreen({ onNavigate }: Props) {
  const { user, profile } = useAuth();
  const { campaigns, activeCampaign, campaignUser, refreshCampaignUser, selectCampaign } = useCampaign();
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [movieIndex, setMovieIndex] = useState(0);
  const swipeStartXRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

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
    const activeIndex = activeCampaign ? movies.findIndex((movie) => movie.id === activeCampaign.id) : -1;
    if (activeIndex >= 0) setMovieIndex(activeIndex);
  }, [activeCampaign?.id, campaigns.length]);

  if (loading || !dashboard || !activeCampaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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

  const changeMovie = (direction: -1 | 1) => {
    if (movies.length < 2) return;
    setMovieIndex((current) => {
      const next = Math.max(0, Math.min(movies.length - 1, current + direction));
      const selectedMovie = movies[next];
      if (!selectedMovie.demo) {
        const realCampaign = campaigns.find((campaign) => campaign.id === selectedMovie.id);
        if (realCampaign) selectCampaign(realCampaign as Campaign);
      }
      return next;
    });
  };

  return (
    <div className="px-4 pt-7 pb-8 animate-fade-in space-y-6 overflow-x-hidden">
      <svg aria-hidden="true" className="absolute w-0 h-0 overflow-hidden pointer-events-none">
        <defs>
          <filter id="honeycomb-remove-white-icon-bg" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                -0.333 -0.333 -0.333 0 1
              "
            />
          </filter>
        </defs>
      </svg>
      {/* HERO / USER IDENTITY */}
      <section className="relative overflow-hidden rounded-[28px] p-5 bg-[linear-gradient(135deg,#341024_0%,#24101D_48%,#160D17_100%)] shadow-[0_22px_65px_-30px_rgba(232,62,140,0.28)]">
        <div className="absolute -top-24 -right-16 w-56 h-56 rounded-full bg-pink-500/7 blur-3xl pointer-events-none animate-hero-breathe" />
        <div className="absolute -bottom-24 -left-16 w-48 h-48 rounded-full bg-violet-500/12 blur-3xl pointer-events-none" />
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-pink-300/55 to-transparent" />
        <div className="absolute right-5 top-5 text-white/15">
          <Film className="w-12 h-12 rotate-12" />
        </div>

        <div className="relative flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-[18px] p-[2px] bg-gradient-to-br from-pink-300 via-pink-500 to-violet-500 shadow-lg shadow-pink-500/20 flex-shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full rounded-[16px] object-cover bg-bg-elevated" />
            ) : (
              <div className="w-full h-full rounded-[16px] bg-[#24101D] flex items-center justify-center font-display text-xl text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <p className="text-[10px] text-pink-300/80 uppercase tracking-[0.2em] font-semibold mb-1">Your movie journey</p>
            <h1 className="font-display text-[29px] text-text-white leading-none truncate tracking-[-0.02em]">
              Hello, {displayName}!
            </h1>
            <p className="text-xs text-text-muted flex items-center gap-1.5 mt-2">
              <MapPin className="w-3.5 h-3.5 text-pink-300" />
              <span>{locationLabel}</span>
            </p>
          </div>
        </div>

        <div className="relative mt-6 flex items-end justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/7 backdrop-blur-sm">
            <Crown className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-xs font-semibold text-white">{levelName}</span>
            <span className="text-[10px] text-white/45">LV.{Math.min(level, LEVEL_NAMES.length)}</span>
          </div>
          <p className="leading-none text-right">
            <span className="font-display text-[34px] text-[#FFC857]">{points.toLocaleString()}</span>
            <span className="block text-[9px] text-white/45 uppercase tracking-[0.16em] mt-1">points</span>
          </p>
        </div>

        <div className="relative mt-4">
          <div className="h-2.5 bg-black/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#E83E8C] via-[#F04F9B] to-[#FF8A5B] rounded-full transition-all duration-700"
              style={{ width: levelProgress + '%' }}
            />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-[left] duration-700"
            style={{ left: 'calc(' + levelProgress + '%)' }}
          >
            <div className="w-7 h-7 rounded-full bg-[#27101D]/90 flex items-center justify-center shadow-[0_0_18px_rgba(255,106,74,0.42)] animate-flame">
              <Flame className="w-3.5 h-3.5 text-[#FF8A5B]" fill="currentColor" />
            </div>
          </div>
        </div>

        <p className="relative text-[11px] text-white/55 mt-2.5 mb-5">
          <span className="text-white font-semibold">{challengesToNextReward}</span>{' '}
          {challengesToNextReward === 1 ? 'challenge' : 'challenges'} to your next reward
        </p>

        <div className="relative grid grid-cols-3 gap-2">
          <StatChip icon={ScanLine} value={scanCount} label="Scans" onClick={() => onNavigate?.('scanner')} />
          <StatChip icon={Target} value={completedMissions + '/' + totalMissions} label="Missions" onClick={() => onNavigate?.('hunts')} />
          <StatChip icon={Trophy} value={'#' + myRank} label="Rank" onClick={() => setLeaderboardOpen(true)} />
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section>
        <div className="flex items-end justify-between px-1 mb-3">
          <div>
            <p className="text-[10px] text-pink-300 uppercase tracking-[0.22em] font-semibold">Explore</p>
            <h2 className="font-display text-[25px] text-text-white leading-none mt-1">FIND YOUR NEXT MOVE</h2>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <QuickAction iconSrc="Movie.png" label="Movies" tone="pink" onClick={() => scrollToSection('movie-campaigns')} />
          <QuickAction iconSrc="hunt.png" label="Hunt" tone="orange" onClick={() => onNavigate?.('hunts')} />
          <QuickAction iconSrc="events.png" label="Events" tone="violet" onClick={() => scrollToSection('featured-hunt')} />
        </div>
        <div className="grid grid-cols-4 gap-2.5 mt-2.5">
          <QuickAction iconSrc="Mall.png" label="Malls" tone="cyan" onClick={() => scrollToSection('nearby-challenges')} />
          <QuickAction iconSrc="activities.png" label="Activities" tone="green" onClick={() => scrollToSection('nearby-challenges')} />
          <QuickAction iconSrc="Gift.png" label="Rewards" tone="gold" onClick={() => onNavigate?.('rewards')} />
          <QuickAction iconSrc="leaderboard.png" label="Leaderboard" tone="purple" onClick={() => setLeaderboardOpen(true)} />
        </div>
      </section>

      {/* MOVIE CAROUSEL */}
      {movies.length > 0 && (
        <section id="movie-campaigns" className="scroll-mt-4">
          <div className="flex items-end justify-between px-1 mb-3">
            <div>
              <p className="text-[10px] text-pink-300 uppercase tracking-[0.24em] font-semibold">Now playing</p>
              <h2 className="font-display text-[28px] text-text-white leading-none mt-1">MOVIES YOU CAN HUNT</h2>
            </div>
            <span className="text-[10px] text-white/38 uppercase tracking-[0.16em]">
              {campaigns.length} live
            </span>
          </div>

          <div
            className="relative overflow-hidden -mx-4 px-4 select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              swipeStartXRef.current = event.clientX;
              draggedRef.current = false;
              setDragOffset(0);
              setIsDragging(true);
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const startX = swipeStartXRef.current;
              if (startX === null) return;

              const delta = event.clientX - startX;
              if (Math.abs(delta) > 8) {
                draggedRef.current = true;
                event.preventDefault();
                setDragOffset(delta);
              }
            }}
            onPointerUp={(event) => {
              const startX = swipeStartXRef.current;
              if (startX === null) return;

              const delta = event.clientX - startX;
              if (Math.abs(delta) > 45) {
                changeMovie(delta < 0 ? 1 : -1);
              }

              swipeStartXRef.current = null;
              setDragOffset(0);
              setIsDragging(false);
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
            onPointerCancel={(event) => {
              swipeStartXRef.current = null;
              setDragOffset(0);
              setIsDragging(false);
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
          >
            <div className="relative h-[344px] w-full overflow-visible">
              <div
                className="absolute left-1/2 top-1/2 flex items-center gap-4 will-change-transform"
                style={{
                  transform: `translate3d(calc(-109px - ${safeMovieIndex * 234}px + ${dragOffset}px), -50%, 0)`,
                  transition: isDragging ? 'none' : 'transform 480ms cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                {movies.map((movie, index) => {
                  const isCenter = index === safeMovieIndex;
                  const distance = Math.abs(index - safeMovieIndex);
                  const isVisible = distance <= 2;

                  return (
                    <button
                      key={movie.id}
                      type="button"
                      onClick={(event) => {
                        if (draggedRef.current) {
                          event.preventDefault();
                          draggedRef.current = false;
                          return;
                        }
                        if (index !== safeMovieIndex) {
                          setMovieIndex(index);
                          if (!movie.demo) {
                            const realCampaign = campaigns.find((campaign) => campaign.id === movie.id);
                            if (realCampaign) selectCampaign(realCampaign as Campaign);
                          }
                        } else if (!movie.demo) {
                          const realCampaign = campaigns.find((campaign) => campaign.id === movie.id);
                          if (realCampaign) selectCampaign(realCampaign as Campaign);
                        }
                      }}
                      className={
                        'relative flex-shrink-0 text-left overflow-hidden rounded-[24px] ' +
                        'transition-[transform,opacity,filter,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ' +
                        (isCenter
                          ? 'w-[218px] h-[320px] z-20 shadow-[0_20px_52px_-24px_rgba(232,62,140,0.28)]'
                          : 'w-[218px] h-[320px] z-10 ' +
                            (isVisible ? 'opacity-55 saturate-[0.65] scale-[0.88]' : 'opacity-0 pointer-events-none scale-[0.78]'))
                      }
                      style={{ userSelect: 'none', WebkitUserDrag: 'none' }}
                    >
                      <MovieArtwork movie={movie} isCenter={isCenter} />
                      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/12 to-transparent pointer-events-none" />
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#100911] via-[#100911]/55 to-transparent pointer-events-none" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-md pointer-events-none">
                        <span className={'w-1.5 h-1.5 rounded-full ' + (movie.demo ? 'bg-[#A78BFA]' : 'bg-[#45D483]')} />
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
                  onClick={() => {
                    setMovieIndex(index);
                    if (!movie.demo) {
                      const realCampaign = campaigns.find((campaign) => campaign.id === movie.id);
                      if (realCampaign) selectCampaign(realCampaign as Campaign);
                    }
                  }}
                  className={
                    'h-1.5 rounded-full transition-all duration-300 ' +
                    (index === safeMovieIndex ? 'w-5 bg-pink-300' : 'w-1.5 bg-white/20')
                  }
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FEATURED HUNT */}
      {nextMission && (
        <section id="featured-hunt" className="rounded-[24px] overflow-hidden bg-gradient-to-br from-[#29101D] to-[#190D17] shadow-[0_18px_48px_-28px_rgba(139,92,246,0.5)] scroll-mt-4">
          <div className="relative h-52">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-600/20 via-violet-700/10 to-orange-500/10" />
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
            <div className="absolute inset-0 bg-gradient-to-t from-[#160C15] via-[#160C15]/25 to-transparent" />
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-md">
              <Flame className="w-3.5 h-3.5 text-[#FF8A5B]" />
              <span className="text-[10px] text-white/90 uppercase tracking-[0.18em] font-medium">Active Hunt</span>
            </div>
            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-[#FFC857] text-[#25110E] font-display text-base tabular-nums">
              {missionDone}/{nextMission.target_count}
            </div>
          </div>

          <div className="px-5 pb-5 -mt-5 relative">
            <h2 className="font-display text-[26px] text-text-white leading-tight mb-1 flex items-center gap-2">
              {nextMission.title} <Clapperboard className="w-5 h-5 text-pink-300" />
            </h2>
            <p className="text-sm text-text-muted line-clamp-2 mb-2">{nextMission.description}</p>
            <p className="text-xs text-text-subtle flex items-center gap-1 mb-4">
              <MapPin className="w-3.5 h-3.5" /> {locationLabel} · {activeCampaign.movie_title}
            </p>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#E83E8C] to-[#FF8A5B] rounded-full transition-all duration-500"
                  style={{ width: Math.min((missionDone / Math.max(nextMission.target_count, 1)) * 100, 100) + '%' }}
                />
              </div>
              <span className="text-xs text-text-primary font-medium tabular-nums">
                {missionDone} / {nextMission.target_count}
              </span>
            </div>

            <button
              onClick={() => onNavigate?.('scanner')}
              className="w-full py-3.5 bg-gradient-to-r from-[#E83E8C] to-[#FF6B4A] text-white rounded-[14px] font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 active:scale-[0.98] transition-transform"
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
                  className="flex-shrink-0 w-44 text-left bg-gradient-to-br from-[#25121D] to-[#1A0F17] rounded-[18px] p-4 shadow-[0_12px_30px_-24px_rgba(232,62,140,0.55)] active:scale-[0.97] transition-transform"
                >
                  <div className="w-10 h-10 rounded-[13px] bg-gradient-to-br from-cyan-300/20 to-violet-500/10 flex items-center justify-center mb-3">
                    <MapPinned className="w-4.5 h-4.5 text-cyan-300" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary truncate">{loc.name}</p>
                  <p className="text-[11px] text-text-muted truncate mb-3 flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" /> {loc.address}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-pink-500/12 text-[10px] font-semibold text-pink-300">
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
            className="w-full bg-gradient-to-br from-[#25121D] to-[#1A0F17] rounded-[18px] p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
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
            className="w-full text-left bg-gradient-to-br from-[#25121D] to-[#1A0F17] rounded-[18px] px-4 py-1.5"
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
                        ? 'bg-gradient-to-br from-pink-500/25 to-violet-500/10 shadow-[0_0_18px_rgba(232,62,140,0.22)]'
                        : 'bg-white/5')
                    }
                  >
                    {earned ? (
                      <Star className="w-6 h-6 text-pink-300" fill="currentColor" />
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
          <div className="bg-gradient-to-br from-[#25121D] to-[#1A0F17] rounded-[18px] px-4 py-1.5">
            {dashboard.scans.slice(0, 4).map((scan) => {
              const source = dashboard.interactionSources.find((s) => s.id === scan.interaction_source_id);
              return (
                <div key={scan.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-b-0">
                  <ScanLine className="w-4 h-4 text-pink-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{source?.name ?? 'QR Scan'}</p>
                    <p className="text-[11px] text-text-subtle">
                      {new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <span className="font-display text-base text-pink-300">+{scan.points_awarded}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <div className="flex items-baseline justify-center gap-0.5 pt-2">
        <span className="font-display text-xs text-white/20">HONEY</span>
        <span className="font-display text-xs text-pink-300/45">BADGER</span>
        <span className="text-[9px] text-white/20 uppercase tracking-[0.2em] ml-1">Media</span>
      </div>

      {/* LEADERBOARD SHEET */}
      {leaderboardOpen && (
        <div className="fixed inset-0 z-[60] max-w-md mx-auto" onClick={() => setLeaderboardOpen(false)}>
          <div className="absolute inset-0 bg-[#0C050B]/75 backdrop-blur-sm animate-fade-in" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#1A0C15] rounded-t-[24px] animate-slide-up max-h-[80%] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-3 pb-3 px-5">
              <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl text-text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#FFC857]" /> Leaderboard
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
      className="flex items-center gap-2 rounded-[15px] bg-white/5 px-2.5 py-2.5 active:scale-[0.97] transition-transform"
    >
      <div className="w-7 h-7 rounded-[9px] bg-gradient-to-br from-pink-500/22 to-violet-500/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-pink-200" />
      </div>
      <span className="text-left leading-none min-w-0">
        <span className="block font-display text-sm text-text-primary">{value}</span>
        <span className="block text-[9px] text-white/38 uppercase tracking-wide mt-0.5">{label}</span>
      </span>
    </button>
  );
}

function QuickAction({
  iconSrc,
  label,
  tone,
  onClick,
}: {
  iconSrc: string;
  label: string;
  tone: 'pink' | 'orange' | 'violet' | 'cyan' | 'green' | 'gold' | 'purple';
  onClick: () => void;
}) {
  const tones = {
    pink: 'from-pink-400/25 to-pink-600/5 shadow-pink-500/10',
    orange: 'from-orange-400/25 to-orange-600/5 shadow-orange-500/10',
    violet: 'from-violet-400/25 to-violet-600/5 shadow-violet-500/10',
    cyan: 'from-cyan-300/25 to-cyan-500/5 shadow-cyan-500/10',
    green: 'from-emerald-400/25 to-emerald-600/5 shadow-emerald-500/10',
    gold: 'from-amber-300/25 to-amber-500/5 shadow-amber-500/10',
    purple: 'from-fuchsia-400/25 to-violet-500/5 shadow-fuchsia-500/10',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] bg-gradient-to-b from-[#28131F] to-[#1B0E17] px-2.5 py-3.5 flex flex-col items-center gap-2.5 active:scale-[0.96] transition-transform shadow-[0_10px_24px_-18px_rgba(0,0,0,0.8)]"
    >
      <span className={'relative w-12 h-12 rounded-[16px] bg-gradient-to-br flex items-center justify-center shadow-lg ' + tones[tone]}>
        
        <img
          src={`${import.meta.env.BASE_URL}icon/${iconSrc}`}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="relative w-[52px] h-[52px] object-contain drop-shadow-[0_4px_5px_rgba(0,0,0,0.45)]"
          style={{ filter: 'url(#honeycomb-remove-white-icon-bg)' }}
        />
      </span>
      <span className="text-[11px] font-semibold text-white/80">{label}</span>
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
    <div className="absolute inset-0 bg-[#1A0D16] z-0">
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
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#100911]/95 via-[#100911]/5 to-transparent pointer-events-none" />
    </div>
  );
}

const collectionStyle: Record<CollectionItem['kind'], { icon: typeof Zap; tone: string }> = {
  card: { icon: Clapperboard, tone: 'from-pink-500/25 to-violet-500/5 text-pink-200' },
  ticket: { icon: Ticket, tone: 'from-rose-400/25 to-orange-400/5 text-rose-200' },
  merch: { icon: Gift, tone: 'from-cyan-400/25 to-blue-400/5 text-cyan-200' },
  badge: { icon: Star, tone: 'from-emerald-400/25 to-green-400/5 text-emerald-200' },
};

function CollectionTile({ item }: { item: CollectionItem }) {
  const { icon: Icon, tone } = collectionStyle[item.kind];
  return (
    <div className="flex-shrink-0 w-24 bg-gradient-to-br from-[#25121D] to-[#1A0F17] rounded-[16px] p-2.5">
      <div className={'h-16 rounded-[11px] bg-gradient-to-br flex items-center justify-center mb-2 ' + tone}>
        <Icon className="w-7 h-7" />
      </div>
      <p className="text-[11px] font-medium text-text-primary truncate">{item.label}</p>
      <p className="text-[9px] text-text-subtle uppercase tracking-wide truncate">{item.sub}</p>
    </div>
  );
}

function LeaderRow({ entry, isMe }: { entry: CampaignDashboard['leaderboard'][number]; isMe: boolean }) {
  const medal = ['text-[#FFC857]', 'text-zinc-300', 'text-amber-600'][entry.rank - 1];
  return (
    <div className={'flex items-center gap-3 py-2.5 border-b border-white/5 last:border-b-0 ' + (isMe ? '-mx-2 px-2 rounded-[10px] bg-pink-500/8' : '')}>
      <span className={'font-display text-base w-6 text-center ' + (medal ?? 'text-text-muted')}>
        {entry.rank <= 3 ? <Trophy className="w-4 h-4 inline" fill="currentColor" /> : entry.rank}
      </span>
      <span className="flex-1 min-w-0">
        <span className={'block text-sm truncate ' + (isMe ? 'text-pink-200 font-semibold' : 'text-text-primary')}>
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
