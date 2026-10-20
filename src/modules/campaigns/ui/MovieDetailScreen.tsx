import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Coins,
  Copy,
  ExternalLink,
  MapPin,
  PlayCircle,
  QrCode,
  ScanLine,
  Share2,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import {
  getMoviePageData,
  getCampaignUser,
  ensureCampaignUser,
  type MoviePageData,
} from '@/modules/campaigns/api/campaignsApi';
import {
  getReferralCode,
  createReferralCode,
  getReferrals,
} from '@/modules/qr/api/qrApi';
import {
  buildPublicQrUrl,
  buildQrImageUrl,
} from '@/modules/qr/logic/qrLogic';
import { getOrCreateFriendInviteQr, recordQrLandingEvent } from '@/modules/qr/api/publicQrApi';
import { buildMapFeatures } from '@/modules/maps/logic/mapData';
import { MapLibreMap } from '@/modules/maps/ui/MapLibreMap';
import type { ReferralCode, Referral, Campaign, ActivityEvent, PointTransaction } from '@/types';
import { getActivityEvents, getPointTransactions } from '@/application/api/legacyApi';


/** Only trusted video platforms are embedded; unknown URLs remain ordinary external links. */
function buildTrailerEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const segments = url.pathname.split('/').filter(Boolean);
    let videoId = '';

    if (hostname === 'youtu.be') {
      videoId = segments[0] || '';
    } else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v') || '';
      } else if (['embed', 'shorts', 'live', 'v'].includes(segments[0] || '')) {
        videoId = segments[1] || '';
      }
      if (/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
        return 'https://www.youtube-nocookie.com/embed/' + videoId + '?rel=0';
      }
    } else if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com') {
      const index = segments[0] === 'video' ? 1 : 0;
      videoId = segments[index] || '';
      if (/^\d{5,15}$/.test(videoId)) return 'https://player.vimeo.com/video/' + videoId;
    }
  } catch {
    return null;
  }
  return null;
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isDirectVideoFile(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return isSafeHttpUrl(rawUrl) && /\.(mp4|webm|ogg)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

interface Props {
  campaignId: string;
  referralCode?: string;
  qrCode?: string;
  onBack: () => void;
}

export function MovieDetailScreen({ campaignId, referralCode, qrCode, onBack }: Props) {
  const { user } = useAuth();
  const { selectCampaign } = useCampaign();

  const [data, setData] = useState<MoviePageData | null>(null);
  const [selectedPosterUrl, setSelectedPosterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [referral, setReferral] = useState<ReferralCode | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [campaignPoints, setCampaignPoints] = useState(0);
  const [campaignPointsLoading, setCampaignPointsLoading] = useState(false);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [pointHistory, setPointHistory] = useState<PointTransaction[]>([]);

  const loadMovie = async () => {
    setLoading(true);
    setCampaignPoints(0);
    setCampaignPointsLoading(Boolean(user));

    try {
      const result = await getMoviePageData(campaignId);
      setData(result);
      setSelectedPosterUrl(
        result.campaign?.movie_poster_urls?.[0] || result.campaign?.hero_image_url || null,
      );
      // Render the movie page as soon as its core data arrives. Activity, membership,
      // referral and invite-QR requests below are optional enhancements and must not
      // keep the entire public landing page on a spinner.
      setLoading(false);

      if (user && result.campaign) {
        const [events, transactions] = await Promise.all([
          getActivityEvents(campaignId, user.id).catch(() => [] as ActivityEvent[]),
          getPointTransactions(campaignId, user.id).catch(() => [] as PointTransaction[]),
        ]);
        setActivityEvents(events);
        setPointHistory(transactions);

        const existingCampaignUser = await getCampaignUser(result.campaign.id, user.id);
        const campaignUser = existingCampaignUser
          ?? await ensureCampaignUser(result.campaign.id, user.id);
        setJoined(Boolean(campaignUser));
        setCampaignPoints(campaignUser.points ?? 0);
        setCampaignPointsLoading(false);

        // Count a QR-attributed campaign join as a conversion once for this visitor.
        if (!existingCampaignUser && qrCode) {
          try {
            await recordQrLandingEvent(qrCode, 'campaign_joined');
          } catch (eventError) {
            console.warn('[Honeycomb] QR conversion was not recorded:', eventError);
          }
        }

        await selectCampaign(result.campaign as Campaign);
        let code = await getReferralCode(result.campaign.id, user.id);

        if (!code) {
          try {
            code = await createReferralCode(
              result.campaign.id,
              user.id,
              user.user_metadata?.display_name || user.email?.split('@')[0] || 'USER',
            );
          } catch {
            // A unique constraint can win a concurrent create; fetch again.
            code = await getReferralCode(result.campaign.id, user.id);
          }
        }

        if (code) {
          setReferral(code);
          try {
            const inviteQrCode = await getOrCreateFriendInviteQr(result.campaign.id, code.code);
            setInviteUrl(buildPublicQrUrl(inviteQrCode));
          } catch (inviteError) {
            console.warn('[Honeycomb] Friend invitation QR could not be prepared:', inviteError);
            setInviteUrl('');
          }

          try {
            const existingReferrals = await getReferrals(result.campaign.id, user.id);
            setReferrals(existingReferrals);
          } catch {
            setReferrals([]);
          }
        }
      } else if (result.campaign) {
        setCampaignPoints(0);
        setCampaignPointsLoading(false);
        void selectCampaign(result.campaign as Campaign);
      }
    } catch {
      setData(null);
      setCampaignPointsLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMovie();
  }, [campaignId, user?.id, qrCode]);

  useEffect(() => {
    if (referralCode) {
      sessionStorage.setItem(
        'honeycomb_pending_referral',
        JSON.stringify({
          campaignId,
          referralCode,
        }),
      );
    }
  }, [campaignId, referralCode]);

  const campaign = data?.campaign ?? null;
  const locations = data?.locations ?? [];
  const sources = data?.interactionSources ?? [];
  const missions = data?.missions ?? [];

  const mapFeatures = useMemo(
    () => buildMapFeatures(locations, sources, []),
    [locations, sources],
  );

  const locationPoints = useMemo(
    () =>
      locations.map((location) => ({
        latitude: location.latitude,
        longitude: location.longitude,
        weight: 1,
      })),
    [locations],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg-primary">
        <div className="text-center">
          <p className="font-display text-2xl text-white">MOVIE NOT FOUND</p>
          <p className="text-xs text-text-muted mt-2">This campaign may no longer be available.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-6 px-5 py-3 rounded-xl bg-accent text-white text-sm font-semibold"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const movieTitle = campaign.movie_title || campaign.title || 'Movie';
  const moviePosters = Array.from(new Set(
    (campaign.movie_poster_urls?.length
      ? campaign.movie_poster_urls
      : campaign.hero_image_url ? [campaign.hero_image_url] : [])
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0),
  ));
  const heroPosterUrl = selectedPosterUrl && moviePosters.includes(selectedPosterUrl)
    ? selectedPosterUrl
    : moviePosters[0] || campaign.hero_image_url || '';
  const movieIsActive = campaign.movie_active !== false;
  const trailerUrl = String(campaign.trailer_url ?? '').trim();
  const safeTrailerUrl = isSafeHttpUrl(trailerUrl) ? trailerUrl : '';
  const trailerEmbedUrl = safeTrailerUrl ? buildTrailerEmbedUrl(safeTrailerUrl) : null;
  const trailerIsVideoFile = safeTrailerUrl ? isDirectVideoFile(safeTrailerUrl) : false;
  const completedReferrals = referrals.filter((item) =>
    item.status === 'completed' || item.status === 'rewarded',
  ).length;

  const firstMission = missions[0];
  const activeMissions = missions.filter((mission) => mission.is_active).slice(0, 3);

  const handleJoin = async () => {
    if (!user) {
      const url = new URL(window.location.origin + '/');
      url.searchParams.set('campaign', campaign.id);
      if (referralCode) url.searchParams.set('ref', referralCode);
      if (qrCode) {
        url.searchParams.set('qr', qrCode);
        try {
          await recordQrLandingEvent(qrCode, 'signup_started');
        } catch (eventError) {
          console.warn('[Honeycomb] QR signup intent was not recorded:', eventError);
        }
      }
      url.searchParams.set('auth', '1');
      window.location.assign(url.toString());
      return;
    }

    try {
      const membership = await ensureCampaignUser(campaign.id, user.id);
      setCampaignPoints(membership.points ?? 0);
      setCampaignPointsLoading(false);
      setJoined(true);
    } catch {
      // Keep the movie page usable even if campaign joining is unavailable.
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard may be unavailable in some browsers.
    }
  };

  const handleShare = async () => {
    if (!inviteUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: movieTitle + ' — Honeycomb',
          text: 'Join me in the ' + (campaign.title || movieTitle) + ' hunt.',
          url: inviteUrl,
        });
      } catch {
        // User cancelled share.
      }
      return;
    }

    await handleCopy();
  };

  const shareable = Boolean(user && inviteUrl && referral);

  return (
    <div className="min-h-screen w-full max-w-lg mx-auto bg-[#09090B] text-zinc-100 animate-fade-in pb-10 sm:border-x sm:border-white/[0.06] overflow-x-hidden">
      <header className="sticky top-0 z-40 px-4 py-3 bg-[#09090B]/75 backdrop-blur-2xl border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.09] flex items-center justify-center transition-colors"
            aria-label="Back to movies"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-[0.2em] text-accent">Movie Hunt</p>
            <p className="text-sm font-semibold text-white truncate">{movieTitle}</p>
          </div>
          {joined && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
              <Check className="w-3 h-3" />
              Joined
            </span>
          )}
        </div>
      </header>

      <div className="space-y-8">
        <section className="relative isolate overflow-hidden min-h-[440px] sm:min-h-[500px] rounded-b-[32px]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#25140D] via-[#121013] to-[#08080A]" />
          {heroPosterUrl ? (
            <img
              src={heroPosterUrl}
              alt={movieTitle}
              className="absolute inset-0 w-full h-full object-cover scale-[1.015] transition-transform duration-700"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-purple-900/20 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/35 to-black/5" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#09090B] to-transparent" />
          <div className="absolute top-5 right-5 w-32 h-32 rounded-full bg-orange-500/15 blur-3xl pointer-events-none" />
          <div className="absolute left-5 right-5 bottom-8 sm:left-7 sm:right-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className={'inline-flex items-center gap-2 px-2.5 py-1 rounded-full backdrop-blur-md border text-[9px] uppercase tracking-[0.12em] ' +
                (movieIsActive
                  ? 'bg-emerald-950/75 border-emerald-400/25 text-emerald-200'
                  : 'bg-rose-950/80 border-rose-400/30 text-rose-200')}>
                <span className={'w-1.5 h-1.5 rounded-full ' + (movieIsActive ? 'bg-emerald-400' : 'bg-rose-400')} />
                {movieIsActive ? 'Movie active' : 'Movie inactive'}
              </span>
              <span className={'inline-flex items-center gap-2 px-2.5 py-1 rounded-full backdrop-blur-md border text-[9px] uppercase tracking-[0.12em] ' +
                (campaign.active
                  ? 'bg-black/40 border-white/10 text-white/80'
                  : 'bg-white/5 border-white/10 text-white/55')}>
                <Sparkles className="w-3 h-3 text-gold" />
                {campaign.active ? 'Campaign active' : 'Campaign inactive'}
              </span>
            </div>
            <h1 className="font-display text-[clamp(2.6rem,10vw,4rem)] leading-[0.9] text-white mt-4 tracking-[-0.045em] drop-shadow-[0_3px_22px_rgba(0,0,0,0.6)]">
              {movieTitle}
            </h1>
            {campaign.title && campaign.title !== movieTitle && (
              <p className="text-sm text-white/75 mt-3 max-w-sm">{campaign.title}</p>
            )}
            {user && (
              <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-amber-200/20 bg-black/45 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_12px_30px_-18px_rgba(245,158,11,0.65)]">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-amber-200/20 bg-amber-300/10">
                  <Coins className="w-4 h-4 text-amber-200" />
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-amber-100/65 font-semibold">Your points in this movie</p>
                  <p className="text-xl leading-tight font-bold tracking-tight text-amber-100 tabular-nums">
                    {campaignPointsLoading ? '···' : campaignPoints.toLocaleString()}
                    <span className="text-[10px] font-semibold text-amber-100/60 ml-1.5">PTS</span>
                  </p>
                </div>
                <div className="ml-2 h-8 w-px bg-white/10" />
                <p className="max-w-[76px] text-[9px] leading-snug text-white/55">Earn more by exploring this hunt</p>
              </div>
            )}
          </div>
        </section>

        {moviePosters.length > 1 && (
          <section className="px-4 -mt-3">
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300 font-semibold">Movie artwork</p>
                <h2 className="font-display text-[21px] leading-none text-white mt-1 tracking-tight">Poster gallery</h2>
              </div>
              <span className="text-[10px] text-text-subtle">{moviePosters.length} posters</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Movie poster gallery">
              {moviePosters.map((posterUrl, index) => (
                <button
                  key={posterUrl}
                  type="button"
                  onClick={() => setSelectedPosterUrl(posterUrl)}
                  aria-label={'Show movie poster ' + (index + 1)}
                  aria-pressed={heroPosterUrl === posterUrl}
                  className={'shrink-0 overflow-hidden rounded-xl border transition-colors ' + (
                    heroPosterUrl === posterUrl ? 'border-accent ring-1 ring-accent/50' : 'border-white/10'
                  )}
                >
                  <img
                    src={posterUrl}
                    alt={movieTitle + ' poster ' + (index + 1)}
                    loading="lazy"
                    className="w-[88px] h-[132px] object-cover transition-transform duration-300 hover:scale-[1.03]"
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="px-4 pt-1 space-y-6">
          <section className="grid grid-cols-2 gap-3">
            <InfoTile
              icon={CalendarDays}
              label="Campaign"
              value={campaign.active ? 'Live now' : 'Paused'}
            />
            <InfoTile
              icon={MapPin}
              label="Locations"
              value={String(locations.length)}
            />
          </section>

          {safeTrailerUrl && (
            <section className="rounded-[26px] overflow-hidden bg-gradient-to-br from-white/[0.07] to-white/[0.025] border border-white/[0.09] shadow-[0_18px_50px_-30px_rgba(0,0,0,0.8)]">
              <div className="p-4 pb-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300 font-semibold">Official trailer</p>
                <h2 className="font-display text-[25px] leading-none text-white mt-1 tracking-tight">Watch the trailer</h2>
              </div>
              {trailerEmbedUrl ? (
                <div className="aspect-video bg-black">
                  <iframe
                    src={trailerEmbedUrl}
                    title={movieTitle + ' official trailer'}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : trailerIsVideoFile ? (
                <video
                  src={safeTrailerUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="block w-full aspect-video bg-black"
                  aria-label={movieTitle + ' official trailer'}
                />
              ) : (
                <div className="p-4 pt-0">
                  <a
                    href={safeTrailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-semibold text-white"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Open official trailer
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <p className="text-[10px] text-text-subtle mt-2">This trailer opens on its original video site.</p>
                </div>
              )}
            </section>
          )}

          {(campaign.description || campaign.starts_at || campaign.ends_at) && (
            <section>
              {campaign.description && (
                <p className="text-sm leading-6 text-text-muted">{campaign.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {campaign.starts_at && (
                  <span className="text-[10px] px-2.5 py-1.5 rounded-full bg-white/5 border border-white/8 text-text-subtle">
                    Starts {formatDate(campaign.starts_at)}
                  </span>
                )}
                {campaign.ends_at && (
                  <span className="text-[10px] px-2.5 py-1.5 rounded-full bg-white/5 border border-white/8 text-text-subtle">
                    Ends {formatDate(campaign.ends_at)}
                  </span>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-semibold">
                  Hunts
                </p>
                <h2 className="font-display text-[23px] leading-none text-white mt-1">
                  SMALL MOVIE MISSIONS
                </h2>
              </div>
              <span className="text-[10px] text-text-subtle">
                {missions.length} total
              </span>
            </div>

            {activeMissions.length > 0 ? (
              <div className="space-y-2.5">
                {activeMissions.map((mission) => (
                  <div
                    key={mission.id}
                    className="rounded-[18px] bg-bg-secondary border border-white/[0.06] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-[12px] bg-gold/10 flex items-center justify-center flex-shrink-0">
                        <Target className="w-4 h-4 text-gold" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{mission.title}</p>
                        <p className="text-xs text-text-muted mt-1 line-clamp-2">
                          {mission.description}
                        </p>
                      </div>
                      <span className="text-sm font-display text-gold flex-shrink-0">
                        +{mission.points_reward}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] bg-bg-secondary border border-white/[0.06] p-4">
                <p className="text-sm text-text-muted">Hunts will appear here when the campaign is activated.</p>
              </div>
            )}
          </section>

          {user && (
            <section className="rounded-[20px] bg-bg-secondary border border-white/[0.06] p-4">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-semibold">
                    Your activity
                  </p>
                  <h2 className="font-display text-[23px] leading-none text-white mt-1">
                    MOVIE HISTORY
                  </h2>
                </div>
                <span className="text-[10px] text-text-subtle">
                  {activityEvents.length} events
                </span>
              </div>

              {pointHistory.length > 0 ? (
                <div className="space-y-2">
                  {pointHistory.slice(0, 4).map((transaction) => (
                    <div key={transaction.id} className="flex items-start gap-3 rounded-[12px] bg-white/[0.03] border border-white/[0.04] px-3 py-3">
                      <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0">
                        <Zap className="w-3.5 h-3.5 text-gold" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-white font-medium">{transaction.reason || 'Movie activity'}</p>
                        <p className="text-[10px] text-text-subtle mt-1">{formatDate(transaction.created_at)}</p>
                      </div>
                      <span className="text-sm font-display text-gold flex-shrink-0">
                        {transaction.points >= 0 ? '+' : ''}{transaction.points}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-5 text-text-muted">
                  Your scans, points and hunt progress for this movie will appear here.
                </p>
              )}

              {activityEvents.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/[0.06]">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-text-subtle mb-2">Recent events</p>
                  <div className="space-y-2">
                    {activityEvents.slice(0, 5).map((event) => (
                      <div key={event.id} className="flex items-start justify-between gap-3">
                        <span className="text-xs text-text-muted">
                          {event.event_type.replace(/[_-]+/g, ' ')}
                        </span>
                        <span className="text-[10px] text-text-subtle whitespace-nowrap">
                          {formatDate(event.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-semibold">
                  Explore
                </p>
                <h2 className="font-display text-[28px] leading-none text-white mt-1">
                  CAMPAIGN MAP
                </h2>
              </div>
              <span className="text-[10px] text-text-subtle">
                {locations.length} spots
              </span>
            </div>

            <div className="relative h-[220px] overflow-hidden rounded-[18px] border border-white/[0.07] bg-black">
              <MapLibreMap
                features={mapFeatures}
                activityScans={[]}
                generalHeatmap={[]}
                campaignHeatmap={locationPoints}
                userLocation={null}
                onMarkerClick={() => {}}
                onMapClick={() => {}}
                fitFeatures
              />
              <div className="absolute left-3 right-3 bottom-3 z-10 flex items-center justify-between rounded-[14px] bg-black/55 backdrop-blur-md border border-white/10 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-gold" />
                  <span className="text-[10px] text-white/80">
                    {locations.length} campaign locations
                  </span>
                </div>
                <span className="text-[9px] uppercase tracking-wide text-white/45">
                  Explore the hunt
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[20px] overflow-hidden bg-gradient-to-br from-[#17151B] via-bg-secondary to-[#0D0D10] border border-accent/15">
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-semibold">
                    Bring your crew
                  </p>
                  <h2 className="font-display text-[24px] leading-none text-white mt-1">
                    INVITE 3 FRIENDS
                  </h2>
                  <p className="text-xs text-text-muted mt-2 leading-5">
                    One QR. Your friends scan it and land directly on this movie page.
                    Their campaign activity can qualify them as referrals.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-accent-bright" />
                </div>
              </div>

              {shareable ? (
                <div className="mt-5 flex flex-col items-center text-center gap-4">
                  <div className="w-[168px] h-[168px] rounded-[18px] bg-white p-2 shadow-[0_12px_40px_-18px_rgba(255,255,255,0.5)]">
                    <img
                      src={buildQrImageUrl(inviteUrl, 240)}
                      alt="Invite friends QR code"
                      className="w-full h-full object-contain"
                      loading="eager"
                    />
                  </div>

                  <div className="w-full max-w-[250px]">
                    <p className="font-display text-[28px] text-white leading-none">
                      {Math.min(completedReferrals, 3)} / 3
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      qualified friends
                    </p>
                    <div className="mt-4 space-y-2">
                      <button
                        type="button"
                        onClick={handleShare}
                        className="w-full py-3 rounded-xl bg-accent text-white text-xs font-semibold flex items-center justify-center gap-2"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Share invite
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/80 text-xs font-medium flex items-center justify-center gap-2"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy invite link
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-[18px] bg-white/5 border border-white/8 p-4 flex items-center gap-3">
                  <QrCode className="w-5 h-5 text-gold flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">Join the campaign first</p>
                    <p className="text-xs text-text-muted mt-1">
                      Sign in and join this hunt to generate your one personal invite QR.
                    </p>
                  </div>
                </div>
              )}

              {shareable && (
                <p className="mt-4 text-[10px] text-white/40 leading-4">
                  Your QR is specific to this movie campaign. The same QR can be scanned by multiple friends; TADA counts unique friends who become active participants.
                </p>
              )}
            </div>

            {user ? (
              <button
                type="button"
                onClick={handleJoin}
                disabled={joined}
                className="w-full border-t border-white/[0.07] py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-white/80 disabled:text-emerald-300"
              >
                {joined ? 'You are in this hunt' : 'Join this movie hunt'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                className="w-full border-t border-white/[0.07] py-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-white/80"
              >
                Sign in to join this hunt
              </button>
            )}
          </section>

          {referralCode && !user && (
            <div className="rounded-[16px] bg-gold/10 border border-gold/15 px-4 py-3 flex items-center gap-3">
              <Zap className="w-4 h-4 text-gold flex-shrink-0" />
              <p className="text-xs text-gold/90">
                You arrived through a friend's invite. Join this campaign to become a qualified referral.
              </p>
            </div>
          )}

          {firstMission && (
            <button
              type="button"
              onClick={handleJoin}
              className="w-full py-4 rounded-[14px] bg-white/5 border border-white/8 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <ScanLine className="w-4 h-4 text-gold" />
              {user ? 'Start the first hunt' : 'Join to start the hunt'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] bg-gradient-to-br from-white/[0.075] to-white/[0.025] border border-white/[0.08] p-4 shadow-[0_14px_36px_-28px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-gold" />
        <span className="text-[9px] uppercase tracking-[0.16em] text-text-subtle">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white mt-2">{value}</p>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
