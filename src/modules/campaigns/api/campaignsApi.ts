import {
  getCampaign,
  getCampaignUser,
  joinCampaign,
  ensureCampaignUser,
} from '@/application/api/legacyApi';
import { getLocations, getInteractionSources } from '@/modules/maps/api/mapsApi';
import { getMissions } from '@/application/api/legacyApi';

export {
  getCampaigns,
  getActiveCampaigns,
} from '@/application/api/legacyApi';

export { getCampaign, getCampaignUser, joinCampaign, ensureCampaignUser };

export interface MoviePageData {
  campaign: Awaited<ReturnType<typeof getCampaign>>;
  locations: Awaited<ReturnType<typeof getLocations>>;
  interactionSources: Awaited<ReturnType<typeof getInteractionSources>>;
  missions: Awaited<ReturnType<typeof getMissions>>;
}

export async function getMoviePageData(campaignId: string): Promise<MoviePageData> {
  const [campaign, locations, interactionSources, missions] = await Promise.all([
    getCampaign(campaignId),
    getLocations(campaignId),
    getInteractionSources(campaignId),
    getMissions(campaignId),
  ]);

  return { campaign, locations, interactionSources, missions };
}
