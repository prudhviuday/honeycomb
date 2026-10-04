import { useEffect, useState } from 'react';
import { Target, Check, Zap, ChevronRight, Flame, Crown, MapPin, ScanLine, ShoppingBag, Waves } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { getCampaignDashboard, type CampaignDashboard } from '@/lib/api';
import type { Tab } from './AppShell';

interface Props {
  onNavigate?: (tab: Tab) => void;
}

const missionIcons: Record<string, typeof Target> = {
  ScanLine: ScanLine,
  MapPin: MapPin,
  ShoppingBag: ShoppingBag,
  Waves: Waves,
  Zap: Zap,
  Crown: Crown,
  Target: Target,
  Flame: Flame,
};

export function HuntsScreen({ onNavigate }: Props) {
  const { user } = useAuth();
  const { activeCampaign, campaignUser } = useCampaign();
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading || !dashboard || !activeCampaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const points = campaignUser?.points ?? 0;
  const completedMissions = dashboard.missionProgress.filter((m) => m.completed).length;
  const totalMissions = dashboard.missions.length;
  const totalXP = dashboard.missions.reduce((sum, m) => sum + m.points_reward, 0);
  const earnedXP = dashboard.missions
    .filter((m) => dashboard.missionProgress.find((p) => p.mission_id === m.id)?.completed)
    .reduce((sum, m) => sum + m.points_reward, 0);

  return (
    <div className="px-4 pt-12 pb-6 animate-fade-in">
      {/* Title */}
      <div className="flex items-end justify-between mb-6 px-1">
        <div>
          <div><p className="text-[10px] text-accent-bright uppercase tracking-[0.24em] font-semibold mb-1">Your missions</p><h1 className="font-display text-[34px] text-text-primary leading-none tracking-[-0.02em]">HUNTS</h1>
          <p className="text-[11px] text-text-muted mt-1.5">
            {completedMissions}/{totalMissions} completed · {earnedXP}/{totalXP} XP earned
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-bg-surface hairline rounded-full px-3 py-1.5">
          <Zap className="w-3.5 h-3.5 text-gold" fill="currentColor" />
          <span className="font-display text-base text-gold">{points}</span>
        </div>
      </div>

      {/* Progress overview bar */}
      <div className="px-1 mb-7">
        <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold via-gold-bright to-accent rounded-full transition-all duration-500"
            style={{ width: `${totalMissions > 0 ? (completedMissions / totalMissions) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Mission cards */}
      <div className="space-y-3">
        {dashboard.missions.map((mission) => {
          const progress = dashboard.missionProgress.find((p) => p.mission_id === mission.id);
          const isCompleted = progress?.completed ?? false;
          const currentProgress = progress?.progress ?? 0;
          const pct = Math.min((currentProgress / mission.target_count) * 100, 100);
          const Icon = missionIcons[mission.icon_name] ?? Target;

          return (
            <div
              key={mission.id}
              className={`rounded-[20px] overflow-hidden cursor-pointer active:scale-[0.985] transition-all duration-300 shadow-[0_12px_35px_-24px_rgba(0,0,0,0.9)] ${
                isCompleted ? 'bg-bg-surface/45 border border-emerald-400/10' : 'bg-gradient-to-br from-bg-surface to-[#10121B] border border-white/8'
              }`}
              onClick={() => !isCompleted && onNavigate?.('scanner')}
            >
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  {/* Icon */}
                  <div
                    className={`w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                      isCompleted ? 'bg-emerald-500/10' : 'bg-gold/10'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Icon className="w-5 h-5 text-gold" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm font-medium ${isCompleted ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                        {mission.title}
                      </p>
                    </div>
                    <p className="text-[11px] text-text-muted line-clamp-2">{mission.description}</p>
                  </div>

                  {/* XP */}
                  <div className="text-right flex-shrink-0">
                    <p className={`font-display text-base ${isCompleted ? 'text-text-muted' : 'text-gold'}`}>
                      +{mission.points_reward}
                    </p>
                    <p className="text-[9px] text-text-subtle uppercase">XP</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-white/6 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted ? 'bg-emerald-500' : 'bg-gold'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-muted font-medium tabular-nums">
                    {currentProgress}/{mission.target_count}
                  </span>
                  {!isCompleted && (
                    <ChevronRight className="w-4 h-4 text-text-subtle" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA — go scan */}
      {completedMissions < totalMissions && (
        <button
          onClick={() => onNavigate?.('scanner')}
          className="w-full mt-5 py-4 bg-gradient-to-r from-gold-bright to-gold text-bg-primary font-semibold text-sm rounded-[14px] shadow-[0_12px_30px_rgba(255,184,74,0.18)] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          <ScanLine className="w-4 h-4" />
          Start Scanning
        </button>
      )}

      {/* All completed */}
      {completedMissions === totalMissions && totalMissions > 0 && (
        <div className="mt-5 bg-bg-surface hairline rounded-[14px] p-5 text-center">
          <Crown className="w-8 h-8 text-gold mx-auto mb-3" />
          <p className="font-display text-lg text-text-primary">ALL HUNTS COMPLETE</p>
          <p className="text-xs text-text-muted mt-1">You've mastered every mission in this campaign.</p>
        </div>
      )}
    </div>
  );
}
