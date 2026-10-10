import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Campaign, CampaignUser } from '@/types';
import { getCampaigns, ensureCampaignUser } from '@/lib/api';
import { useAuth } from './AuthContext';

interface CampaignContextValue {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  campaignUser: CampaignUser | null;
  loading: boolean;
  selectCampaign: (campaign: Campaign) => Promise<void>;
  refreshCampaignUser: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue>({
  campaigns: [],
  activeCampaign: null,
  campaignUser: null,
  loading: true,
  selectCampaign: async () => {},
  refreshCampaignUser: async () => {},
});

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [campaignUser, setCampaignUser] = useState<CampaignUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getCampaigns();
        setCampaigns(data);
        if (data.length > 0 && !activeCampaign) {
          setActiveCampaign(data[0]);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeCampaign && user) {
      (async () => {
        try {
          const cu = await ensureCampaignUser(activeCampaign.id, user.id);
          setCampaignUser(cu);
        } catch {
          setCampaignUser(null);
        }
      })();
    } else {
      setCampaignUser(null);
    }
  }, [activeCampaign, user]);

  // Keep context actions referentially stable. Consumers use these callbacks
  // in effects; recreating them on every provider render can retrigger effects
  // and create repeated Supabase requests.
  const selectCampaign = useCallback(async (campaign: Campaign) => {
    setActiveCampaign(campaign);
    if (user) {
      try {
        const cu = await ensureCampaignUser(campaign.id, user.id);
        setCampaignUser(cu);
      } catch {
        setCampaignUser(null);
      }
    } else {
      setCampaignUser(null);
    }
  }, [user]);

  const refreshCampaignUser = useCallback(async () => {
    if (activeCampaign && user) {
      try {
        const cu = await ensureCampaignUser(activeCampaign.id, user.id);
        setCampaignUser(cu);
      } catch {
        // Keep the last known campaign-user state if a refresh fails.
      }
    }
  }, [activeCampaign, user]);

  const contextValue = useMemo(
    () => ({ campaigns, activeCampaign, campaignUser, loading, selectCampaign, refreshCampaignUser }),
    [campaigns, activeCampaign, campaignUser, loading, selectCampaign, refreshCampaignUser],
  );

  return (
    <CampaignContext.Provider value={contextValue}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  return useContext(CampaignContext);
}
