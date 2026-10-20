import { Sparkles } from 'lucide-react';
import { FAN_TIERS, FanTierBadge, getFanTier } from '@/components/badges/FanTierBadge';

export function FanJourneyPanel({ points }: { points: number }) {
  const currentFanTier = getFanTier(points);
  const currentFanTierIndex = FAN_TIERS.findIndex((tier) => tier.key === currentFanTier.key);
  const nextFanTier = FAN_TIERS[currentFanTierIndex + 1];
  const pointsToNextFanTier = nextFanTier ? Math.max(0, nextFanTier.minPoints - points) : 0;
  const fanTierProgress = nextFanTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((points - currentFanTier.minPoints) / (nextFanTier.minPoints - currentFanTier.minPoints)) * 100,
        ),
      )
    : 100;

  return (
    <>
{/* FAN JOURNEY / TIER COLLECTION */}
      <section aria-labelledby="fan-journey-heading" className="fan-journey-panel relative overflow-hidden rounded-[22px] border border-white/[0.08]">
        <span className="fan-journey-orb fan-journey-orb--gold" aria-hidden="true" />
        <span className="fan-journey-orb fan-journey-orb--violet" aria-hidden="true" />
        <div className="relative z-10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-100/70">Your fan journey</p>
              <h2 id="fan-journey-heading" className="mt-1 font-display text-lg leading-tight text-white">Every hunt raises your rank</h2>
              <p className="mt-1 text-[11px] text-white/45">Collect all 8 fan insignias</p>
            </div>
            <span className="fan-journey-count shrink-0 rounded-full px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider">
              {String(currentFanTierIndex + 1).padStart(2, '0')} <span className="text-white/30">/</span> 08
            </span>
          </div>

          <div className="fan-journey-feature mt-4 flex items-center gap-3 rounded-[18px] border border-white/[0.08] p-3">
            <div className="fan-journey-feature-emblem flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-2xl">
              <FanTierBadge points={points} size="md" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="font-display text-base text-white">{currentFanTier.name}</h3>
                <span className="fan-journey-current-tag rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider">Current</span>
              </div>
              {nextFanTier ? (
                <p className="mt-1 text-[10px] leading-relaxed text-white/50">
                  Only <span className="font-bold text-amber-100">{pointsToNextFanTier.toLocaleString()} points</span> to unlock <span className="font-semibold text-white/80">{nextFanTier.name}</span>
                </p>
              ) : (
                <p className="mt-1 text-[10px] leading-relaxed text-amber-100/70">Highest tier unlocked. You’re a Honeycomb Legend.</p>
              )}
              <div className="fan-journey-progress mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="fan-journey-progress-fill h-full rounded-full transition-[width] duration-700" style={{ width: fanTierProgress + '%' }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] tabular-nums text-white/35">
                <span>{points.toLocaleString()} points</span>
                <span>{nextFanTier ? nextFanTier.minPoints.toLocaleString() + ' to next tier' : 'MAX RANK'}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">Insignia collection</span>
            <span className="text-[9px] font-semibold text-white/35">{currentFanTierIndex + 1} of 8 unlocked</span>
          </div>
          <div className="fan-journey-grid mt-2.5 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {FAN_TIERS.map((tier) => {
              const unlocked = points >= tier.minPoints;
              const current = tier.key === currentFanTier.key;
              const next = tier.key === nextFanTier?.key;
              return (
                <div
                  key={tier.key}
                  title={tier.name + (unlocked ? ' · Unlocked' : ' · Unlock at ' + tier.minPoints + ' points')}
                  aria-label={tier.name + (current ? ' · Current tier' : unlocked ? ' · Unlocked' : ' · Locked')}
                  className={[
                    'fan-journey-tier relative flex min-w-0 flex-col items-center justify-center rounded-xl border px-1 pb-2 pt-2.5 text-center',
                    unlocked ? 'fan-journey-tier--unlocked' : 'fan-journey-tier--locked',
                    current ? 'fan-journey-tier--current' : '',
                    next ? 'fan-journey-tier--next' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {next && <span className="fan-journey-next-label absolute -top-1.5 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider">Next</span>}
                  <FanTierBadge points={tier.minPoints} size="sm" />
                  <span className="mt-1.5 w-full truncate text-[9px] font-bold leading-tight">{tier.name}</span>
                  <span className="mt-1 text-[8px] tabular-nums">{unlocked ? (current ? 'YOU ARE HERE' : 'UNLOCKED') : tier.minPoints.toLocaleString() + ' PTS'}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[9px] text-white/35">
            <Sparkles className="h-3 w-3 text-amber-200/60" aria-hidden="true" />
            Keep scanning, completing hunts and earning points to rise through the ranks.
          </p>
        </div>
      </section>

      
    </>
  );
}
