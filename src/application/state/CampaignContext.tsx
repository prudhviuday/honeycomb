import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Campaign, CampaignUser } from '@/types';
import { getCampaigns, ensureCampaignUser, getOverallPointsTotal } from '@/lib/api';
import { useAuth } from './AuthContext';

interface CampaignContextValue {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  campaignUser: CampaignUser | null;
  overallPoints: number;
  overallPointsLoading: boolean;
  loading: boolean;
  selectCampaign: (campaign: Campaign) => Promise<void>;
  refreshCampaignUser: () => Promise<void>;
  refreshOverallPoints: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue>({
  campaigns: [],
  activeCampaign: null,
  campaignUser: null,
  overallPoints: 0,
  overallPointsLoading: true,
  loading: true,
  selectCampaign: async () => {},
  refreshCampaignUser: async () => {},
  refreshOverallPoints: async () => {},
});

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [campaignUser, setCampaignUser] = useState<CampaignUser | null>(null);
  const [overallPoints, setOverallPoints] = useState(0);
  const [overallPointsLoading, setOverallPointsLoading] = useState(true);
  const [overallPointsUserId, setOverallPointsUserId] = useState<string | null>(null);
  const [campaignUserKey, setCampaignUserKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Older requests must never overwrite the balance for a newer campaign/user.
  const campaignUserRequest = useRef(0);
  const overallPointsRequest = useRef(0);
  const requestedCampaignUserKey = useRef<string | null>(null);
  const campaignUserKeyRef = useRef<string | null>(null);

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
      requestedCampaignUserKey.current = null;
      campaignUserKeyRef.current = null;
      setCampaignUser(null);
      setCampaignUserKey(null);
      return;
    }
    const requestKey = `${campaignId}:${userId}`;
    requestedCampaignUserKey.current = requestKey;

    try {
      const cu = await ensureCampaignUser(campaignId, userId);
      if (requestId !== campaignUserRequest.current) return;
      campaignUserKeyRef.current = requestKey;
      setCampaignUser(cu);
      setCampaignUserKey(requestKey);
    } catch {
      if (requestId !== campaignUserRequest.current) return;
      if (clearOnError) {
        campaignUserKeyRef.current = null;
        setCampaignUser(null);
        setCampaignUserKey(null);
      }
      // A refresh failure should not replace a valid last-known balance with 0.
    } finally {
      if (requestId === campaignUserRequest.current && requestedCampaignUserKey.current === requestKey) {
        requestedCampaignUserKey.current = null;
      }
    }
  }, []);

  const loadOverallPoints = useCallback(async (
    targetUserId: string | null,
    clearOnError = false,
  ) => {
    const requestId = ++overallPointsRequest.current;
    if (!targetUserId) {
      setOverallPoints(0);
      setOverallPointsUserId(null);
      setOverallPointsLoading(false);
      return;
    }

    setOverallPointsLoading(true);
    try {
      // This sums each joined campaign's current points_balance, so redeemed points
      // are already excluded and one balance per movie is counted exactly once.
      const total = await getOverallPointsTotal(targetUserId);
      if (requestId !== overallPointsRequest.current) return;
      setOverallPoints(Math.max(0, Number(total) || 0));
      setOverallPointsUserId(targetUserId);
    } catch (error) {
      if (requestId !== overallPointsRequest.current) return;
      console.warn('[Points] Could not refresh overall points:', error);
      if (clearOnError) {
        setOverallPoints(0);
        setOverallPointsUserId(targetUserId);
      }
      // On a routine refresh failure retain the last successful balance.
    } finally {
      if (requestId === overallPointsRequest.current) {
        setOverallPointsLoading(false);
      }
    }
  }, []);

  const campaignId = activeCampaign?.id ?? null;
  const userId = user?.id ?? null;
  const currentCampaignUserKey = campaignId && userId ? `${campaignId}:${userId}` : null;

  useEffect(() => {
    void loadOverallPoints(userId, true);
  }, [userId, loadOverallPoints]);

  useEffect(() => {
    if (!campaignId || !userId) {
      void loadCampaignUser(campaignId, userId, true);
      return;
    }
    const key = `${campaignId}:${userId}`;
    // selectCampaign already started the matching request; don't race it with
    // a second request from this effect.
    if (campaignUserKeyRef.current === key || requestedCampaignUserKey.current === key) return;
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
      requestedCampaignUserKey.current = null;
      campaignUserKeyRef.current = null;
      setCampaignUser(null);
      setCampaignUserKey(null);
    }
  }, [user, loadCampaignUser]);

  const refreshCampaignUser = useCallback(async () => {
    await Promise.all([
      loadCampaignUser(activeCampaign?.id ?? null, user?.id ?? null, false),
      loadOverallPoints(user?.id ?? null),
    ]);
  }, [activeCampaign?.id, user?.id, loadCampaignUser, loadOverallPoints]);

  const refreshOverallPoints = useCallback(async () => {
    await loadOverallPoints(user?.id ?? null);
  }, [user?.id, loadOverallPoints]);

  // Refresh both balances when returning from an external task or app switch;
  // some verified task completions can settle while the browser is unfocused.
  useEffect(() => {
    if (!userId || !campaignId) return;
    const refreshOnFocus = () => { void refreshCampaignUser(); };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [userId, campaignId, refreshCampaignUser]);

  const contextValue = useMemo(
    () => ({
      campaigns,
      activeCampaign,
      campaignUser: visibleCampaignUser,
      overallPoints: overallPointsUserId === userId ? overallPoints : 0,
      overallPointsLoading: Boolean(userId) && (overallPointsLoading || overallPointsUserId !== userId),
      loading,
      selectCampaign,
      refreshCampaignUser,
      refreshOverallPoints,
    }),
    [campaigns, activeCampaign, visibleCampaignUser, overallPoints, overallPointsLoading, overallPointsUserId, userId, loading, selectCampaign, refreshCampaignUser, refreshOverallPoints],
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
