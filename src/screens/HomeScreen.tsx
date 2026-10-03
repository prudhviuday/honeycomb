import { useEffect, useState } from 'react';
import { Target, Zap, MapPin, Trophy, Flame, ScanLine, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { getCampaignDashboard, type CampaignDashboard } from '@/lib/api';

export function HomeScreen() {
  const { user } = useAuth();
  const { activeCampaign, campaignUser, refreshCampaignUser } = useCampaign();
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

  useEffect(() => {
    refreshCampaignUser();
  }, [refreshCampaignUser]);

  if (loading || !dashboard || !activeCampaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const points = campaignUser?.points ?? 0;
  const scanCount = dashboard.scans.length;
  const completedMissions = dashboard.missionProgress.filter(m => m.completed).length;
  const totalMissions = dashboard.missions.length;
  const myRank = dashboard.myLeaderboardPosition?.rank ?? '—';

  const completedMissionIds = new Set(dashboard.missionProgress.filter(m => m.completed).map(m => m.mission_id));
  const nextMission = dashboard.missions.find(m => !completedMissionIds.has(m.id));
  const nextMissionProgress = nextMission
    ? dashboard.missionProgress.find(p => p.mission_id === nextMission.id)
    : null;

  return (
    <div className="px-5 pt-14 pb-8 animate-fade-in">
      {/* Brand header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-baseline gap-0.5">
          <span className="font-display text-base text-text-primary">HONEY</span>
          <span className="font-display text-base gold-text">BADGER</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-gold" fill="currentColor" />
          <span className="font-display text-lg text-gold">{points}</span>
          <span className="text-[10px] text-text-subtle uppercase tracking-wide">pts</span>
        </div>
      </div>

      {/* Campaign Hero — cinematic */}
      <div className="relative overflow-hidden mb-8 h-56 rounded-[12px]">
        <img
          src={activeCampaign.hero_image_url || 'https://images.pexels.com/photos/2873486/pexels-photo-2873486.jpeg'}
          alt={activeCampaign.movie_title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="text-[10px] text-gold font-medium mb-2 tracking-[0.25em] uppercase">Now Playing</p>
          <h2 className="font-display text-2xl text-text-white mb-2 leading-tight">{activeCampaign.movie_title}</h2>
          <p className="text-xs text-text-muted line-clamp-2 max-w-[85%]">{activeCampaign.description}</p>
        </div>
      </div>

      {/* Stats — editorial, not card-grid */}
      <div className="grid grid-cols-3 gap-0 mb-8 hairline-t hairline-b py-5">
        <StatBlock value={scanCount} label="Scans" />
        <div className="hairline-l hairline-r px-3">
          <StatBlock value={`${completedMissions}/${totalMissions}`} label="Missions" />
        </div>
        <StatBlock value={`#${myRank}`} label="Rank" />
      </div>

      {/* Next Mission */}
      {nextMission && (
        <div className="mb-8">
          <SectionHeader title="Next Mission" accent={`+${nextMission.points_reward}`} />
          <div className="bg-bg-surface hairline rounded-[10px] p-5">
            <div className="flex items-start gap-3 mb-4">
              <Flame className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{nextMission.title}</p>
                <p className="text-xs text-text-muted mt-0.5">{nextMission.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[3px] bg-white/8 overflow-hidden rounded-full">
                <div
                  className="h-full bg-gold rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(((nextMissionProgress?.progress ?? 0) / nextMission.target_count) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-text-muted font-medium tabular-nums">
                {nextMissionProgress?.progress ?? 0}/{nextMission.target_count}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="mb-8">
        <SectionHeader title="Recent Activity" />
        {dashboard.scans.length === 0 ? (
          <div className="bg-bg-surface hairline rounded-[10px] py-10 flex flex-col items-center">
            <MapPin className="w-7 h-7 text-text-subtle mb-3" />
            <p className="text-xs text-text-muted">No scans yet. Start exploring.</p>
          </div>
        ) : (
          <div className="space-y-px">
            {dashboard.scans.slice(0, 5).map((scan) => {
              const source = dashboard.interactionSources.find(s => s.id === scan.interaction_source_id);
              return (
                <div key={scan.id} className="flex items-center gap-3 py-3 hairline-b last:border-b-0">
                  <ScanLine className="w-4 h-4 text-gold flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{source?.name ?? 'QR Scan'}</p>
                    <p className="text-[11px] text-text-subtle">{new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <span className="font-display text-base text-gold">+{scan.points_awarded}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      {dashboard.leaderboard.length > 0 && (
        <div>
          <SectionHeader title="Leaderboard" />
          <div className="space-y-px">
            {dashboard.leaderboard.slice(0, 3).map((entry, i) => (
              <div key={entry.id} className="flex items-center gap-3 py-3 hairline-b last:border-b-0">
                <span className={`font-display text-lg w-7 ${i === 0 ? 'text-gold' : 'text-text-muted'}`}>{i + 1}</span>
                <span className="flex-1 text-sm text-text-primary truncate">{entry.display_name}</span>
                <span className="font-display text-base text-text-primary">{entry.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBlock({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-2xl text-text-primary leading-none">{value}</p>
      <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em] mt-1.5">{label}</p>
    </div>
  );
}

function SectionHeader({ title, accent }: { title: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[11px] text-text-subtle uppercase tracking-[0.2em] font-medium">{title}</h3>
      {accent && <span className="text-[11px] text-gold font-medium">{accent}</span>}
    </div>
  );
}
