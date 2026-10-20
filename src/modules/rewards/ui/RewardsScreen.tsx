import { useCallback, useEffect, useState } from 'react';
import { Gift, Ticket, Shirt, Star, Check, Clock, Package } from 'lucide-react';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import { getRewards, getRewardEntries, getRewardClaims, claimReward } from '@/modules/rewards/api/rewardsApi';
import { calculateEntryTotal, canClaimReward } from '@/modules/rewards/logic/rewardLogic';
import { registerActivity } from '@/modules/analytics/api/analyticsApi';
import type { Reward, RewardEntry, RewardClaim } from '@/modules/rewards/types';
import { RewardIdeas } from './RewardIdeas';
import { PointsIcon } from '@/components/points/PointsIndicator';

export function RewardsScreen() {
  const { user } = useAuth();
  const { activeCampaign, campaignUser, refreshCampaignUser } = useCampaign();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [entries, setEntries] = useState<RewardEntry[]>([]);
  const [claims, setClaims] = useState<RewardClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<RewardClaim | null>(null);

  const loadData = useCallback(async () => {
    if (!activeCampaign || !user) {
      setRewards([]);
      setEntries([]);
      setClaims([]);
      setLoadError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [rwds, rEntries, rClaims] = await Promise.all([
        getRewards(activeCampaign.id),
        getRewardEntries(activeCampaign.id, user.id),
        getRewardClaims(activeCampaign.id, user.id),
      ]);
      setRewards(rwds);
      setEntries(rEntries);
      setClaims(rClaims);
    } catch (error) {
      console.warn('[Rewards] Could not load campaign rewards:', error);
      setRewards([]);
      setEntries([]);
      setClaims([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [activeCampaign, user]);

  useEffect(() => { void loadData(); }, [loadData, retryCount]);

  const handleClaim = async (reward: Reward) => {
    if (!activeCampaign || !user || !campaignUser) return;
    if (!canClaimReward(campaignUser.points, reward)) return;
    setClaiming(reward.id);
    try {
      const claim = await claimReward(activeCampaign.id, user.id, reward);
      setClaimResult(claim);
      void registerActivity({
        eventType: reward.reward_type === 'lucky_draw' ? 'lucky_draw_entered' : 'reward_claim_succeeded',
        campaignId: activeCampaign.id,
        entityType: 'reward',
        entityId: reward.id,
        sourceModule: 'rewards',
        metadata: {
          reward_type: reward.reward_type,
          points_required: reward.points_required,
          claim_status: claim.status,
        },
      });
      await refreshCampaignUser();
      await loadData();
    } catch (err) {
      void registerActivity({
        eventType: 'reward_claim_failed',
        campaignId: activeCampaign.id,
        entityType: 'reward',
        entityId: reward.id,
        sourceModule: 'rewards',
        metadata: { reward_type: reward.reward_type },
      });
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalEntries = calculateEntryTotal(entries);
  const points = campaignUser?.points ?? 0;

  return (
    <div className="px-5 pt-12 pb-8 animate-fade-in">
      {/* Title */}
      <p className="text-[10px] text-accent-bright uppercase tracking-[0.24em] font-semibold mb-1">Your haul</p>\n      <h1 className="font-display text-[36px] text-text-primary leading-none tracking-[-0.02em] mb-1">REWARDS</h1>
      <p className="text-xs text-text-muted mb-8">Points and prizes are specific to the selected movie campaign.</p>

      {/* Points bar — editorial, not a card */}
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#1C1710] via-bg-surface to-[#0D0D10] border border-gold/15 shadow-[0_18px_45px_-24px_rgba(233,180,76,0.22)] py-5 px-5 mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PointsIcon scope="campaign" size="md" />
            <p className="font-display text-4xl text-gold leading-none tabular-nums">{points.toLocaleString()}</p>
          </div>
          <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em] mt-2">Campaign Points</p>
        </div>
        <div className="h-10 w-px bg-white/10" />
        <div className="text-right">
          <p className="font-display text-4xl text-text-primary leading-none">{totalEntries}</p>
          <p className="text-[10px] text-text-subtle uppercase tracking-[0.15em] mt-2">Draw Entries</p>
        </div>
      </div>

      {/* My Claims */}
      {claims.length > 0 && (
        <div className="mb-8">
          <SectionHeader title="My Claims" count={claims.length} />
          <div className="space-y-px">
            {claims.map((claim) => {
              const reward = rewards.find(r => r.id === claim.reward_id);
              const Icon = getRewardIcon(reward?.title);
              const statusColor: Record<string, string> = {
                pending: 'text-gold',
                approved: 'text-sky-400',
                delivered: 'text-emerald-400',
                rejected: 'text-red-400/80',
              };
              return (
                <div key={claim.id} className="flex items-center gap-3 py-3 hairline-b last:border-b-0">
                  <div className="w-9 h-9 rounded-full bg-bg-surface hairline flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{reward?.title ?? 'Reward'}</p>
                    <p className="text-[11px] text-text-subtle font-mono">{claim.claim_code}</p>
                  </div>
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${statusColor[claim.status] ?? statusColor.pending}`}>
                    {claim.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Rewards */}
      <div>
        <SectionHeader title="Available to claim" count={rewards.length} />
        {rewards.length > 0 ? (
          <div className="space-y-4">
            {rewards.map((reward) => {
              const Icon = getRewardIcon(reward.title);
              const canAfford = points >= reward.points_required;
              const rewardClaims = claims.filter(c => c.reward_id === reward.id);
              const alreadyClaimed = rewardClaims.some(c => c.status !== 'rejected') && reward.reward_type === 'guaranteed';
              return (
                <div key={reward.id} className="relative overflow-hidden bg-gradient-to-br from-bg-surface to-[#0D0D10] border border-white/8 rounded-[20px] shadow-[0_14px_40px_-28px_rgba(0,0,0,0.95)]">
                  <div className="p-5">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0 border border-white/8 ${
                        canAfford ? 'bg-gold/10' : 'bg-bg-elevated'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          canAfford ? 'text-gold' : 'text-text-subtle'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-text-primary">{reward.title}</p>
                          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            reward.reward_type === 'lucky_draw'
                              ? 'bg-white/5 text-text-muted'
                              : 'bg-gold/10 text-gold'
                          }`}>
                            {reward.reward_type === 'lucky_draw' ? 'Draw' : 'Guaranteed'}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted">{reward.description}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`inline-flex items-center justify-end gap-1 font-display text-lg ${canAfford ? 'text-gold' : 'text-text-subtle'}`}><PointsIcon scope="campaign" size="xs" />{reward.points_required.toLocaleString()}</p>
                        <p className="text-[9px] text-text-subtle uppercase">pts</p>
                      </div>
                    </div>
                  </div>
                  <div className="hairline-t">
                    {alreadyClaimed ? (
                      <div className="flex items-center justify-center gap-2 py-3 text-emerald-400">
                        <Check className="w-4 h-4" />
                        <span className="text-xs font-medium">Claimed</span>
                      </div>
                    ) : canAfford ? (
                      <button
                        type="button"
                        onClick={() => handleClaim(reward)}
                        disabled={claiming === reward.id}
                        className="w-full py-3.5 bg-accent text-white font-semibold text-xs uppercase tracking-[0.08em] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {claiming === reward.id ? (
                          <><Clock className="w-3.5 h-3.5 animate-spin" /> Processing</>
                        ) : reward.reward_type === 'lucky_draw' ? 'Enter Draw' : 'Claim Reward'}
                      </button>
                    ) : (
                      <div className="py-3 text-center">
                        <span className="text-xs text-text-subtle">
                          Need {(reward.points_required - points).toLocaleString()} more campaign points
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[18px] bg-bg-secondary border border-white/[0.06] p-4">
            {loadError ? (
              <>
                <p className="text-sm font-semibold text-text-primary">Rewards could not be loaded</p>
                <p className="text-xs text-text-muted mt-1">The catalog may be temporarily unavailable. Try again.</p>
                <button
                  type="button"
                  onClick={() => setRetryCount((count) => count + 1)}
                  className="mt-3 px-4 py-2 rounded-full bg-accent text-white text-xs font-semibold"
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-text-primary">
                  {activeCampaign ? 'No claimable rewards set up yet' : 'Choose a movie campaign to see rewards'}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {activeCampaign
                    ? 'This campaign has no configured rewards yet. The ideas below show what points could work toward.'
                    : 'Select a live movie campaign from Home to see its reward catalog.'}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Reward ideas are a preview only, never claimable from these cards. */}
      <div className="mt-8">
        <RewardIdeas />
      </div>

      {/* Claim result */}
      {claimResult && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center max-w-lg mx-auto px-5" onClick={() => setClaimResult(null)}>
          <div className="w-full bg-bg-secondary hairline rounded-[12px] p-8 animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-gold/10 hairline flex items-center justify-center mx-auto mb-6">
              <Gift className="w-7 h-7 text-gold" />
            </div>
            <p className="text-[10px] text-text-subtle uppercase tracking-[0.25em] mb-2">Reward Claimed</p>
            <h2 className="font-display text-xl text-text-primary mb-4">Claim Processing</h2>
            <div className="bg-bg-surface rounded-[8px] p-4 mb-6">
              <p className="text-[10px] text-text-subtle uppercase tracking-wide mb-1">Claim Code</p>
              <p className="font-mono text-lg text-gold font-bold">{claimResult.claim_code}</p>
            </div>
            <button
              onClick={() => setClaimResult(null)}
              className="w-full py-3.5 bg-accent text-white font-semibold text-sm rounded-[10px] active:scale-[0.98] transition-transform"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-[11px] text-text-subtle uppercase tracking-[0.2em] font-medium">{title}</h3>
      {count !== undefined && <span className="text-[11px] text-text-subtle">{count}</span>}
    </div>
  );
}

function getRewardIcon(title: string | null | undefined) {
  const normalized = (title ?? '').toLowerCase();
  if (/shirt|tee/.test(normalized)) return Shirt;
  if (/ticket|event|backstage|vip|crew|pass/.test(normalized)) return Ticket;
  if (/poster/.test(normalized)) return Star;
  if (/combo/.test(normalized)) return Package;
  return Gift;
}
