import type { ReactNode } from 'react';

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

function FanGlyph({ tierIndex }: { tierIndex: number }) {
  const glyphs: ReactNode[] = [
    <g key="new-fan">
      <circle cx="18" cy="18" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="18" r="2.3" fill="currentColor" />
      <path d="M18 5.5v3 M18 27.5v3 M5.5 18h3 M27.5 18h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </g>,
    <g key="fan">
      <path d="M8 13c3.5-4 6.5 4 10 0s6.5-4 10 0 M8 19c3.5-4 6.5 4 10 0s6.5-4 10 0 M8 25c3.5-4 6.5 4 10 0s6.5-4 10 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </g>,
    <g key="super-fan">
      <path d="M18 7v5 M18 24v5 M7 18h5 M24 18h5 M10.5 10.5l3.4 3.4 M22.1 22.1l3.4 3.4 M25.5 10.5l-3.4 3.4 M13.9 22.1l-3.4 3.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="18" cy="18" r="3.3" fill="currentColor" />
    </g>,
    <g key="movie-buff">
      <rect x="8" y="8" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 8v20 M23 8v20" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" />
      <path d="M15.5 14l6 4-6 4z" fill="currentColor" />
    </g>,
    <g key="cinephile">
      <circle cx="18" cy="18" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M18 8l4 6-4 4-4-4z M28 18l-6 4-4-4 4-4z M18 28l-4-6 4-4 4 4z M8 18l6-4 4 4-4 4z" fill="currentColor" fillOpacity=".72" />
    </g>,
    <g key="hype-star">
      <ellipse cx="18" cy="18" rx="11" ry="5" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(-34 18 18)" />
      <ellipse cx="18" cy="18" rx="11" ry="5" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(34 18 18)" />
      <circle cx="18" cy="18" r="3.1" fill="currentColor" />
      <circle cx="8.5" cy="13" r="1.6" fill="currentColor" />
    </g>,
    <g key="superstar">
      <path d="M18 6l3.3 8.2L30 18l-8.7 3.3L18 30l-3.3-8.7L6 18l8.7-3.8z" fill="currentColor" fillOpacity=".88" />
      <circle cx="27.5" cy="8.5" r="1.8" fill="currentColor" />
      <circle cx="8.5" cy="27.5" r="1.8" fill="currentColor" />
    </g>,
    <g key="legend">
      <path d="M18 6l4.3 8.2L30 18l-7.7 3.8L18 30l-4.3-8.2L6 18l7.7-3.8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 10l2.4 5.5L26 18l-5.6 2.4L18 26l-2.4-5.6L10 18l5.6-2.5z" fill="currentColor" fillOpacity=".75" />
      <circle cx="18" cy="18" r="2" fill="#fff" />
    </g>,
  ];

  return <>{glyphs[tierIndex] ?? glyphs[0]}</>;
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
        <svg viewBox="0 0 36 36" className="fan-tier-badge__art" aria-hidden="true">
          <path className="fan-tier-badge__facet" d="M18 2.5 29 7.2 33.5 18 29 28.8 18 33.5 7 28.8 2.5 18 7 7.2z" />
          <path d="M18 5.5 27 9.1 30.5 18 27 26.9 18 30.5 9 26.9 5.5 18 9 9.1z" fill="none" stroke="currentColor" strokeOpacity=".48" strokeWidth=".8" />
          <g className="fan-tier-badge__glyph">
            <FanGlyph tierIndex={tierIndex} />
          </g>
        </svg>
        <span className="fan-tier-badge__glint" aria-hidden="true" />
      </span>
      {showLabel && <span className={'fan-tier-badge__label fan-tier-badge__label--' + tier.key}>{tier.name}</span>}
    </span>
  );
}
