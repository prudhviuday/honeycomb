import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  Shirt,
  Ticket,
  UsersRound,
  X,
  Zap,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { useCampaign } from '@/application/state/CampaignContext';

const rewardIdeas = [
  {
    title: 'Free Movie Ticket',
    description: 'A ticket to a participating movie screening.',
    points: 1200,
    icon: Ticket,
    detail: 'Use your points as a goal toward a ticket for a participating movie screening.',
    hint: 'Keep scanning campaign QR codes and completing movie hunts to build your balance.',
  },
  {
    title: 'Movie T-shirt',
    description: 'Limited-edition campaign merchandise.',
    points: 800,
    icon: Shirt,
    detail: 'A limited-edition shirt inspired by a participating movie campaign.',
    hint: 'Look out for campaign activities and special bonus-point opportunities.',
  },
  {
    title: 'Movie Event Pass',
    description: 'Entry to a fan event or special screening.',
    points: 2000,
    icon: CalendarDays,
    detail: 'A possible goal for a fan event, promotional event or special screening.',
    hint: 'Join more hunts and check campaign announcements for event opportunities.',
  },
  {
    title: 'Meet the Movie Crew',
    description: 'A chance to meet cast or crew at a special event.',
    points: 3000,
    icon: UsersRound,
    detail: 'An aspirational goal for a special event with cast or crew, when offered by a campaign.',
    hint: 'Stay active across eligible campaign activities and watch for special events.',
  },
];

interface Props {
  onOpenRewards?: () => void;
}

export function RewardIdeas({ onOpenRewards }: Props) {
  const { campaignUser, activeCampaign } = useCampaign();
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const selectedReward = rewardIdeas.find((reward) => reward.title === selectedTitle) ?? null;
  const points = Math.max(0, campaignUser?.points ?? 0);
  const earned = selectedReward ? Math.min(points, selectedReward.points) : 0;
  const remaining = selectedReward ? Math.max(0, selectedReward.points - points) : 0;
  const progress = selectedReward ? Math.min(100, (points / selectedReward.points) * 100) : 0;
  const movieName = activeCampaign?.movie_title || activeCampaign?.title || 'this movie campaign';

  useEffect(() => {
    if (!selectedReward) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedTitle(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedReward]);

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
        {rewardIdeas.map(({ title, description, points: target, icon: Icon }) => (
          <button
            key={title}
            type="button"
            onClick={() => setSelectedTitle(title)}
            aria-label={`View ${title} reward goal details`}
            className="group flex-shrink-0 w-[174px] text-left rounded-[18px] p-4 bg-gradient-to-br from-bg-secondary to-[#111114] border border-white/[0.07] hover:border-gold/35 hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
          >
            <div className="w-10 h-10 rounded-[12px] bg-gold/10 border border-gold/10 flex items-center justify-center mb-3 group-hover:bg-gold/15 transition-colors">
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
              <span className="font-display text-base text-gold tabular-nums">~{target.toLocaleString()} pts</span>
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white/45 group-hover:text-gold transition-colors">
              View progress <ArrowUpRight className="w-3 h-3" />
            </span>
          </button>
        ))}
      </div>

      {selectedReward && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedTitle(null)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-detail-title"
            className="relative w-full max-w-md max-h-[min(84dvh,680px)] overflow-y-auto rounded-[28px] border border-white/10 bg-gradient-to-br from-[#22212a] via-[#15151d] to-[#101014] shadow-[0_28px_100px_rgba(0,0,0,0.7)] animate-scale-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-gold/[0.12] to-transparent pointer-events-none" />
            <div className="relative p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center shadow-[0_8px_28px_rgba(233,180,76,0.08)]">
                  <selectedReward.icon className="w-7 h-7 text-gold" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTitle(null)}
                  className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/70"
                  aria-label="Close reward details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-5">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-gold/10 border border-gold/15 text-[10px] font-semibold uppercase tracking-[0.13em] text-gold">
                  <Sparkles className="w-3 h-3" /> Example reward goal
                </span>
                <h3 id="reward-detail-title" className="mt-3 font-display text-[32px] sm:text-[36px] leading-tight text-white">
                  {selectedReward.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{selectedReward.detail}</p>
              </div>

              <div className="mt-6 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Your points</p>
                    <p className="mt-1 font-display text-[30px] leading-none text-white tabular-nums">{points.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Example target</p>
                    <p className="mt-1 font-display text-xl text-gold tabular-nums">{selectedReward.points.toLocaleString()} pts</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                  <span className="text-white/65">{Math.round(progress)}% of target</span>
                  <span className={remaining === 0 ? 'text-emerald-300 font-semibold' : 'text-white/75'}>
                    {remaining === 0 ? 'Target reached!' : `${remaining.toLocaleString()} pts to go`}
                  </span>
                </div>
                <div
                  className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.08]"
                  role="progressbar"
                  aria-label={`Progress toward ${selectedReward.title}`}
                  aria-valuemin={0}
                  aria-valuemax={selectedReward.points}
                  aria-valuenow={earned}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 via-gold to-yellow-200 transition-[width] duration-700 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-white/50">
                  <Zap className="w-3.5 h-3.5 text-gold flex-shrink-0" />
                  <span>Points shown are your balance for {movieName}; balances are tracked separately by campaign.</span>
                </div>
              </div>

              <div className="mt-4 flex gap-3 rounded-2xl bg-white/[0.035] border border-white/[0.06] p-3.5">
                <div className="mt-0.5 w-8 h-8 rounded-xl bg-white/[0.06] flex-shrink-0 flex items-center justify-center">
                  <Ticket className="w-4 h-4 text-white/70" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/90">How to work toward it</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">{selectedReward.hint}</p>
                </div>
              </div>

              <p className="mt-4 text-[10px] leading-relaxed text-white/40">
                This is an illustrative goal, not a live prize or redemption offer. Real rewards, availability and costs are set by each movie campaign.
              </p>

              {onOpenRewards && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTitle(null);
                    onOpenRewards();
                  }}
                  className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 px-4 bg-gold text-[#17120a] font-bold text-sm hover:brightness-105 transition"
                >
                  Explore campaign rewards <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
