import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Copy,
  MapPin,
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
  ensureCampaignUser,
  type MoviePageData,
} from '@/modules/campaigns/api/campaignsApi';
import {
  getReferralCode,
  createReferralCode,
  getReferrals,
} from '@/modules/qr/api/qrApi';
import {
  buildMovieReferralUrl,
  buildQrImageUrl,
} from '@/modules/qr/logic/qrLogic';
import { buildMapFeatures } from '@/modules/maps/logic/mapData';
import { MapLibreMap } from '@/modules/maps/ui/MapLibreMap';
import type { ReferralCode, Referral, Campaign } from '@/types';

interface Props {
  campaignId: string;
  referralCode?: string;
  onBack: () => void;
}

export function MovieDetailScreen({ campaignId, referralCode, onBack }: Props) {
  const { user } = useAuth();
  const { selectCampaign } = useCampaign();

  const [data, setData] = useState<MoviePageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [referral, setReferral] = useState<ReferralCode | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);

  const loadMovie = async () => {
    setLoading(true);

    try {
      const result = await getMoviePageData(campaignId);
      setData(result);

      if (result.campaign) {
        void selectCampaign(result.campaign as Campaign);
      }

      if (user && result.campaign) {
        const campaignUser = await ensureCampaignUser(result.campaign.id, user.id);
        setJoined(Boolean(campaignUser));

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
          const url = buildMovieReferralUrl(result.campaign.id, code.code);
          setInviteUrl(url);

          try {
            const existingReferrals = await getReferrals(result.campaign.id, user.id);
            setReferrals(existingReferrals);
          } catch {
            setReferrals([]);
          }
        }
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMovie();
  }, [campaignId, user?.id]);

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
      url.searchParams.set('auth', '1');
      window.location.assign(url.toString());
      return;
    }

    try {
      await ensureCampaignUser(campaign.id, user.id);
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
    <div className="min-h-screen bg-bg-primary animate-fade-in pb-10">
      <header className="sticky top-0 z-40 px-4 py-3 bg-bg-primary/85 backdrop-blur-xl border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/8 flex items-center justify-center"
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

      <div className="space-y-6">
        <section className="relative overflow-hidden min-h-[360px]">
          <div className="absolute inset-0 bg-bg-elevated" />
          {campaign.hero_image_url ? (
            <img
              src={campaign.hero_image_url}
              alt={movieTitle}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-purple-900/20 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/20 to-transparent" />
          <div className="absolute left-5 right-5 bottom-7">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
              <Sparkles className="w-3 h-3 text-gold" />
              <span className="text-[9px] text-white/80 uppercase tracking-[0.16em]">
                {campaign.active ? 'Live campaign' : 'Campaign'}
              </span>
            </div>
            <h1 className="font-display text-[42px] leading-[0.9] text-white mt-3 tracking-[-0.02em]">
              {movieTitle}
            </h1>
            {campaign.title && campaign.title !== movieTitle && (
              <p className="text-sm text-white/70 mt-2">{campaign.title}</p>
            )}
          </div>
        </section>

        <div className="px-4 space-y-6">
          <section className="grid grid-cols-2 gap-2.5">
            <InfoTile
              icon={CalendarDays}
              label="Campaign"
              value={campaign.active ? 'Live now' : 'Coming soon'}
            />
            <InfoTile
              icon={MapPin}
              label="Locations"
              value={String(locations.length)}
            />
          </section>

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
                <h2 className="font-display text-[28px] leading-none text-white mt-1">
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

            <div className="relative h-[250px] overflow-hidden rounded-[22px] border border-white/[0.07] bg-black">
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

          <section className="rounded-[24px] overflow-hidden bg-gradient-to-br from-[#17151B] via-bg-secondary to-[#0D0D10] border border-accent/15">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-accent font-semibold">
                    Bring your crew
                  </p>
                  <h2 className="font-display text-[30px] leading-none text-white mt-1">
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
                <div className="mt-5 grid grid-cols-[auto_1fr] gap-5 items-center">
                  <div className="w-40 h-40 rounded-[18px] bg-white p-2 shadow-[0_12px_40px_-18px_rgba(255,255,255,0.5)]">
                    <img
                      src={buildQrImageUrl(inviteUrl, 240)}
                      alt="Invite friends QR code"
                      className="w-full h-full object-contain"
                      loading="eager"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="font-display text-3xl text-white leading-none">
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
    <div className="rounded-[16px] bg-bg-secondary border border-white/[0.06] p-4">
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
