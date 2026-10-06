import type { Reward, RewardEntry } from '@/shared/types';

export function calculateEntryTotal(entries: RewardEntry[]): number {
  return entries.reduce((sum, entry) => sum + Number(entry.entries ?? 0), 0);
}

export function canClaimReward(points: number, reward: Reward): boolean {
  return points >= reward.points_required;
}

export function getRemainingPoints(points: number, reward: Reward): number {
  return Math.max(0, reward.points_required - points);
}
