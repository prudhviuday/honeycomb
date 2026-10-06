import type { CampaignDashboard } from '@/application/api/legacyApi';

export function getHomePoints(dashboard: CampaignDashboard | null): number { return dashboard?.campaignUser?.points ?? 0; }
export function getCompletedMissionCount(dashboard: CampaignDashboard | null): number { return dashboard?.missionProgress.filter((item) => item.completed).length ?? 0; }
