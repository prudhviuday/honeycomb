import {
  CalendarDays,
  ChevronRight,
  Shirt,
  Ticket,
  UsersRound,
} from 'lucide-react';

const rewardIdeas = [
  {
    title: 'Free Movie Ticket',
    description: 'A ticket to a participating movie screening.',
    points: 1200,
    icon: Ticket,
  },
  {
    title: 'Movie T-shirt',
    description: 'Limited-edition campaign merchandise.',
    points: 800,
    icon: Shirt,
  },
  {
    title: 'Movie Event Pass',
    description: 'Entry to a fan event or special screening.',
    points: 2000,
    icon: CalendarDays,
  },
  {
    title: 'Meet the Movie Crew',
    description: 'A chance to meet cast or crew at a special event.',
    points: 3000,
    icon: UsersRound,
  },
];

interface Props {
  onOpenRewards?: () => void;
}

export function RewardIdeas({ onOpenRewards }: Props) {
  return (
    <section aria-labelledby="reward-ideas-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[10px] text-gold uppercase tracking-[0.22em] font-semibold mb-1">
            Example reward goals
          </p>
          <h2 id="reward-ideas-heading" className="text-[17px] font-bold text-text-white tracking-tight">
            What your points could unlock
          </h2>
        </div>
        {onOpenRewards && (
          <button
            type="button"
            onClick={onOpenRewards}
            className="flex-shrink-0 text-[11px] text-gold font-semibold flex items-center gap-1"
          >
            Rewards <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-text-subtle">
        Illustrative point targets only. Actual prizes, availability and redemption costs depend on each movie campaign.
      </p>

      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {rewardIdeas.map(({ title, description, points, icon: Icon }) => (
          <article
            key={title}
            className="flex-shrink-0 w-[174px] rounded-[18px] p-4 bg-gradient-to-br from-bg-secondary to-[#111114] border border-white/[0.07]"
          >
            <div className="w-10 h-10 rounded-[12px] bg-gold/10 border border-gold/10 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5 text-gold" aria-hidden="true" />
            </div>
            <span className="inline-flex rounded-full px-2 py-0.5 mb-2 bg-white/[0.06] text-[8px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Example
            </span>
            <h3 className="text-sm font-semibold text-text-primary leading-snug min-h-[2.5rem]">
              {title}
            </h3>
            <p className="text-[11px] text-text-muted leading-relaxed min-h-[2.8rem] mt-1">
              {description}
            </p>
            <div className="mt-3 pt-3 border-t border-white/[0.07] flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-wide text-text-subtle">Target</span>
              <span className="font-display text-base text-gold tabular-nums">~{points.toLocaleString()} pts</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
