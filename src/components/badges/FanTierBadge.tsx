export type FanTier = {
  key: string;
  name: string;
  minPoints: number;
};

export const FAN_TIERS: FanTier[] = [
  { key: 'new-fan', name: 'New Fan', minPoints: 0 },
  { key: 'fan', name: 'Fan', minPoints: 100 },
  { key: 'super-fan', name: 'Super Fan', minPoints: 200 },
  { key: 'movie-buff', name: 'Movie Buff', minPoints: 300 },
  { key: 'cinephile', name: 'Cinephile', minPoints: 400 },
  { key: 'hype-star', name: 'Hype Star', minPoints: 500 },
  { key: 'superstar', name: 'Superstar', minPoints: 600 },
  { key: 'legend', name: 'Legend', minPoints: 700 },
];

export function getFanTier(points: number): FanTier {
  const safePoints = Math.max(0, Number(points) || 0);
  for (let index = FAN_TIERS.length - 1; index >= 0; index -= 1) {
    if (safePoints >= FAN_TIERS[index].minPoints) return FAN_TIERS[index];
  }
  return FAN_TIERS[0];
}

function FanInsignia({ tierIndex }: { tierIndex: number }) {
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (tierIndex) {
    case 0:
      // A quiet, compass-like spark: the first sign of a fan.
      return (
        <g {...line}>
          <circle cx="20" cy="20" r="11.4" strokeOpacity=".42" />
          <circle cx="20" cy="20" r="7.5" strokeOpacity=".8" />
          <path d="M20 9.5 22.8 17.2 30.5 20 22.8 22.8 20 30.5 17.2 22.8 9.5 20 17.2 17.2z" fill="currentColor" stroke="none" />
          <circle cx="20" cy="20" r="2" fill="currentColor" stroke="none" />
        </g>
      );
    case 1:
      // A traditional enamel shield, distinct from a generic round medal.
      return (
        <g {...line}>
          <path d="M20 7.5 30 11v8.2c0 6.1-4.2 10.2-10 13.2-5.8-3-10-7.1-10-13.2V11z" strokeOpacity=".65" />
          <path d="M13.5 17.5c2.2-2.4 4.3 2.4 6.5 0s4.3-2.4 6.5 0M13.5 22c2.2-2.4 4.3 2.4 6.5 0s4.3-2.4 6.5 0" />
          <path d="m16.5 26 2.4 2 4.8-5" strokeWidth="1.8" />
        </g>
      );
    case 2:
      // A many-pointed flare with a cut-glass center.
      return (
        <g {...line}>
          <path d="m20 5 3.5 8.2 8.5-2.7-2.7 8.5 8.2 3.5-8.2 3.5 2.7 8.5-8.5-2.7-3.5 8.2-3.5-8.2L8 34.5l2.7-8.5L2.5 22.5l8.2-3.5L8 10.5l8.5 2.7z" transform="translate(0 -2) scale(1 .94)" fill="currentColor" fillOpacity=".22" strokeWidth="1.1" />
          <path d="m20 11 3.1 6.1 6.7 1-4.9 4.7 1.2 6.6-6.1-3.1-6.1 3.1 1.2-6.6-4.9-4.7 6.7-1z" fill="currentColor" fillOpacity=".9" stroke="none" />
          <circle cx="20" cy="21" r="2" fill="currentColor" stroke="none" />
        </g>
      );
    case 3:
      // Film-strip frame with a luminous play window.
      return (
        <g {...line}>
          <path d="M10 7.5h20v25H10z" strokeOpacity=".8" />
          <path d="M10 13h20M10 27h20" strokeOpacity=".8" />
          <path d="M13 9.5v1M18 9.5v1M23 9.5v1M27 9.5v1M13 29v1M18 29v1M23 29v1M27 29v1" strokeWidth="2.2" />
          <path d="m17 16 9 4.5-9 4.5z" fill="currentColor" stroke="none" />
        </g>
      );
    case 4:
      // Camera-aperture iris, cut like a precision lens.
      return (
        <g {...line}>
          <circle cx="20" cy="20" r="13" strokeOpacity=".4" />
          <circle cx="20" cy="20" r="9.8" strokeOpacity=".8" />
          <path d="m20 10 5 5-1.1 7.2-7.8 2.8-4.9-5 1.1-7.2z" fill="currentColor" fillOpacity=".2" />
          <path d="m20 10 5 5-1.1 7.2-7.8 2.8-4.9-5 1.1-7.2z" transform="rotate(60 20 20)" />
          <path d="m20 10 5 5-1.1 7.2-7.8 2.8-4.9-5 1.1-7.2z" transform="rotate(120 20 20)" />
          <circle cx="20" cy="20" r="3.2" fill="currentColor" stroke="none" />
          <circle cx="20" cy="20" r="1.1" fill="#fff" stroke="none" />
        </g>
      );
    case 5:
      // An orbital comet with an inlaid star.
      return (
        <g {...line}>
          <ellipse cx="20" cy="20" rx="14" ry="6.3" transform="rotate(-35 20 20)" strokeOpacity=".55" />
          <path d="M8 27c3.2-6.2 8.2-12.2 16.5-16.2-4 8.3-10 13.3-16.5 16.2z" fill="currentColor" fillOpacity=".26" />
          <path d="m23 8 2.5 6.2 6.5 2.5-6.5 2.5-2.5 6.5-2.5-6.5-6.2-2.5 6.2-2.5z" fill="currentColor" stroke="none" />
          <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="32" cy="29" r="1" fill="currentColor" stroke="none" />
        </g>
      );
    case 6:
      // An eight-faceted star with a fine double-ring setting.
      return (
        <g {...line}>
          <circle cx="20" cy="20" r="14" strokeOpacity=".36" />
          <circle cx="20" cy="20" r="11" strokeOpacity=".7" />
          <path d="m20 7 3.3 8.4 8.7 4.6-8.7 3.3-3.3 8.7-3.3-8.7L8 20l8.7-4.6z" fill="currentColor" stroke="none" />
          <path d="m20 12 2.2 5.5 5.5 2.5-5.5 2.2-2.2 5.5-2.2-5.5-5.5-2.2 5.5-2.5z" fill="currentColor" stroke="none" />
        </g>
      );
    default:
      // The highest tier is a tall cut gemstone framed by laurel arcs.
      return (
        <g {...line}>
          <path d="M20 6.5 29 13l-2 13.2L20 33l-7-6.8L11 13z" fill="currentColor" fillOpacity=".16" />
          <path d="M20 6.5 29 13l-2 13.2L20 33l-7-6.8L11 13z" />
          <path d="m11 13 9 3.5 9-3.5M13 26.2l7-9.7 7 9.7M20 16.5V33" strokeOpacity=".9" />
          <path d="M8 11c-4 5-4 12 0 17M6 15l4 1M5.5 20l4 .2M6.5 25l3.5-1.3M32 11c4 5 4 12 0 17M34 15l-4 1M34.5 20l-4 .2M33.5 25 30 23.7" strokeWidth="1.2" strokeOpacity=".8" />
          <path d="m20 9 1.2 3.2 3.2 1.2-3.2 1.2-1.2 3.2-1.2-3.2-3.2-1.2 3.2-1.2z" fill="currentColor" stroke="none" />
        </g>
      );
  }
}

export function FanTierBadge({
  points,
  size = 'sm',
  showLabel = false,
  className = '',
}: {
  points: number;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}) {
  const tier = getFanTier(points);
  const tierIndex = FAN_TIERS.findIndex((item) => item.key === tier.key);

  return (
    <span
      className={['fan-tier-badge', 'fan-tier-badge--' + size, 'fan-tier-badge--tier-' + tier.key, className].filter(Boolean).join(' ')}
      title={tier.name + ' · ' + Math.max(0, Number(points) || 0).toLocaleString() + ' points'}
      aria-label={tier.name + ' fan tier'}
    >
      <span className={'fan-tier-badge__seal fan-tier-badge__seal--' + tier.key}>
        <span className="fan-tier-badge__edge" aria-hidden="true" />
        <svg viewBox="0 0 40 40" className="fan-tier-badge__art" aria-hidden="true">
          <FanInsignia tierIndex={tierIndex} />
        </svg>
        <span className="fan-tier-badge__glint" aria-hidden="true" />
      </span>
      {showLabel && <span className="fan-tier-badge__label">{tier.name}</span>}
    </span>
  );
}
