import { Flame, Zap } from 'lucide-react';

export type PointsScope = 'campaign' | 'overall';
export type PointsIconSize = 'xs' | 'sm' | 'md';

interface PointsIconProps {
  scope: PointsScope;
  size?: PointsIconSize;
  className?: string;
}

/** Consistent visual language: flame = one movie campaign, lightning = all campaigns. */
export function PointsIcon({ scope, size = 'sm', className = '' }: PointsIconProps) {
  const Icon = scope === 'campaign' ? Flame : Zap;
  const tone = scope === 'campaign'
    ? 'border-orange-300/20 bg-orange-400/12 text-orange-300'
    : 'border-amber-300/20 bg-amber-300/12 text-amber-200';
  const dimensions = {
    xs: { outer: 'h-4 w-4', icon: 'h-2.5 w-2.5' },
    sm: { outer: 'h-5 w-5', icon: 'h-3 w-3' },
    md: { outer: 'h-7 w-7', icon: 'h-4 w-4' },
  }[size];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ${tone} ${dimensions.outer} ${className}`}
    >
      <Icon className={dimensions.icon} strokeWidth={2.4} fill={scope === 'overall' ? 'currentColor' : 'none'} />
    </span>
  );
}

interface PointsBadgeProps extends PointsIconProps {
  points: number | null | undefined;
  loading?: boolean;
  ariaLabel?: string;
  valueClassName?: string;
}

/** Compact point count with its scope encoded by the circular icon. */
export function PointsBadge({
  scope,
  points,
  loading = false,
  size = 'sm',
  ariaLabel,
  className = '',
  valueClassName = '',
}: PointsBadgeProps) {
  const value = Math.max(0, Number(points ?? 0) || 0);
  const scopeLabel = scope === 'campaign' ? 'campaign points' : 'overall points';

  return (
    <span
      className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}
      aria-label={ariaLabel ?? `${loading ? 'Loading' : value.toLocaleString()} ${scopeLabel}`}
      title={`${scope === 'campaign' ? 'This movie campaign' : 'Across all movie campaigns'} · ${scopeLabel}`}
    >
      <PointsIcon scope={scope} size={size} />
      <span className={`font-semibold tabular-nums ${valueClassName}`}>
        {loading ? '···' : value.toLocaleString()}
      </span>
    </span>
  );
}
