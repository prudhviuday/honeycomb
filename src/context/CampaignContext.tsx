import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

  const selectCampaign = async (campaign: Campaign) => {
    setActiveCampaign(campaign);
    if (user) {
      try {
        const cu = await ensureCampaignUser(campaign.id, user.id);
        setCampaignUser(cu);
      } catch {
        setCampaignUser(null);
      }
    }
  };

  const refreshCampaignUser = async () => {
    if (activeCampaign && user) {
      try {
        const cu = await ensureCampaignUser(activeCampaign.id, user.id);
        setCampaignUser(cu);
      } catch {
        // ignore
      }
    }
  };

  return (
    <CampaignContext.Provider value={{ campaigns, activeCampaign, campaignUser, loading, selectCampaign, refreshCampaignUser }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  return useContext(CampaignContext);
}
