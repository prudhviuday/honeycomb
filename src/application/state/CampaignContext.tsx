import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const [campaignUserKey, setCampaignUserKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Older requests must never overwrite the balance for a newer campaign/user.
  const campaignUserRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getCampaigns();
        if (cancelled) return;
        setCampaigns(data);
        setActiveCampaign((current) => current ?? data[0] ?? null);
      } catch {
        // Keep the app usable if campaign discovery temporarily fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadCampaignUser = useCallback(async (
    campaignId: string | null,
    userId: string | null,
    clearOnError = true,
  ) => {
    const requestId = ++campaignUserRequest.current;
    if (!campaignId || !userId) {
      setCampaignUser(null);
      setCampaignUserKey(null);
      return;
    }

    try {
      const cu = await ensureCampaignUser(campaignId, userId);
      if (requestId !== campaignUserRequest.current) return;
      setCampaignUser(cu);
      setCampaignUserKey(`${campaignId}:${userId}`);
    } catch {
      if (requestId !== campaignUserRequest.current) return;
      if (clearOnError) {
        setCampaignUser(null);
        setCampaignUserKey(null);
      }
      // A refresh failure should not replace a valid last-known balance with 0.
    }
  }, []);

  const campaignId = activeCampaign?.id ?? null;
  const userId = user?.id ?? null;
  const currentCampaignUserKey = campaignId && userId ? `${campaignId}:${userId}` : null;

  useEffect(() => {
    void loadCampaignUser(campaignId, userId, true);
  }, [campaignId, userId, loadCampaignUser]);

  // Only expose a balance that belongs to the currently selected campaign and
  // signed-in user. This prevents a previous campaign's points flashing on screen.
  const visibleCampaignUser =
    campaignUserKey === currentCampaignUserKey ? campaignUser : null;

  const selectCampaign = useCallback(async (campaign: Campaign) => {
    setActiveCampaign(campaign);
    if (user) {
      await loadCampaignUser(campaign.id, user.id, true);
    } else {
      setCampaignUser(null);
      setCampaignUserKey(null);
    }
  }, [user, loadCampaignUser]);

  const refreshCampaignUser = useCallback(async () => {
    await loadCampaignUser(activeCampaign?.id ?? null, user?.id ?? null, false);
  }, [activeCampaign?.id, user?.id, loadCampaignUser]);

  const contextValue = useMemo(
    () => ({
      campaigns,
      activeCampaign,
      campaignUser: visibleCampaignUser,
      loading,
      selectCampaign,
      refreshCampaignUser,
    }),
    [campaigns, activeCampaign, visibleCampaignUser, loading, selectCampaign, refreshCampaignUser],
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
