import type { Campaign } from '@/shared/types';

export function isCampaignActive(campaign: Campaign, now = new Date()): boolean {
  if (!campaign.active) return false;
  const start = campaign.starts_at ? new Date(campaign.starts_at) : null;
  const end = campaign.ends_at ? new Date(campaign.ends_at) : null;
  if (start && !Number.isNaN(start.getTime()) && now < start) return false;
  if (end && !Number.isNaN(end.getTime()) && now > end) return false;
  return true;
}
