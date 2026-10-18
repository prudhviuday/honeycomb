import { useEffect, useRef, useState } from "react";
import { AnalyticsScreen } from "@/modules/analytics/ui/AnalyticsScreen";
import { House, Map, ScanLine, Ticket, UserRound, X } from "lucide-react";
import { useAuth } from "@/application/state/AuthContext";
import { AuthScreen } from "@/modules/auth/ui/AuthScreen";
import { HomeScreen } from "@/modules/home/ui/HomeScreen";
import { MapScreen } from "@/modules/maps/ui/MapScreen";
import { ScannerScreen } from "@/modules/qr/ui/ScannerScreen";
import { RewardsScreen } from "@/modules/rewards/ui/RewardsScreen";
import { ProfileScreen } from "@/modules/profile/ui/ProfileScreen";
import { HuntsScreen } from "@/modules/hunts/ui/HuntsScreen";
import { MovieDetailScreen } from "@/modules/campaigns/ui/MovieDetailScreen";
import { useCampaign } from "@/application/state/CampaignContext";
import type { Campaign } from "@/types";
import { supabase } from "@/lib/supabase";

export type Tab =
  "home" | "hunts" | "scanner" | "map" | "rewards" | "profile" | "analytics";

const tabs: { id: Tab; label: string; icon: typeof House }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "hunts", label: "Hunts", icon: Ticket },
  { id: "scanner", label: "Scan", icon: ScanLine },
  { id: "map", label: "Map", icon: Map },
  { id: "profile", label: "Profile", icon: UserRound },
];

interface MovieRoute {
  campaignId: string | null;
  referralCode: string | undefined;
  authMode: boolean;
}

function readMovieRoute(): MovieRoute {
  const params = new URLSearchParams(window.location.search);
  return {
    campaignId: params.get("campaign"),
    referralCode: params.get("ref") || undefined,
    authMode: params.get("auth") === "1",
  };
}

export function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const { campaigns, activeCampaign, loading: campaignsLoading, selectCampaign } = useCampaign();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [visitedTabs, setVisitedTabs] = useState<Tab[]>(["home"]);
  const [movieRoute, setMovieRoute] = useState<MovieRoute>(() => readMovieRoute());
  const [qrCode, setQrCode] = useState<string | null>(() => new URLSearchParams(window.location.search).get("qr"));
  const [qrCampaignId, setQrCampaignId] = useState<string | null>(null);
  const [qrResolving, setQrResolving] = useState(() => Boolean(new URLSearchParams(window.location.search).get("qr")));
  const [qrError, setQrError] = useState("");
  const [navCompact, setNavCompact] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Scroll may happen on <main>, an ancestor with overflow, or the document.
    // A capture-phase document listener sees scroll events from all of them.
    const previousPositions = new WeakMap<EventTarget, number>();

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!target || (typeof target !== "object" && typeof target !== "function")) return;

      const currentTop =
        target === document
          ? window.scrollY || document.documentElement.scrollTop
          : (target as HTMLElement).scrollTop ?? 0;
      const previousTop = previousPositions.get(target) ?? currentTop;
      const delta = currentTop - previousTop;
      previousPositions.set(target, currentTop);

      // Ignore tiny touch/trackpad jitter so the capsule doesn't flicker.
      if (Math.abs(delta) < 3) return;

      if (currentTop <= 12 || delta < 0) {
        setNavCompact(false);
      } else if (delta > 0 && currentTop > 24) {
        setNavCompact(true);
      }
    };

    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    // Also listen to window scroll for browser/document scrolling implementations.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setMovieRoute(readMovieRoute());
      setQrCode(new URLSearchParams(window.location.search).get("qr"));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!qrCode || !user || campaignsLoading) return;
    let cancelled = false;
    setQrResolving(true);
    setQrError("");

    void (async () => {
      const { data: campaignId, error } = await supabase.rpc("resolve_qr_campaign", { p_code: qrCode });
      if (cancelled) return;
      if (error || !campaignId) {
        setQrError("This QR link is invalid, inactive, or no longer available.");
        setQrResolving(false);
        return;
      }
      const campaign = campaigns.find((item) => item.id === campaignId);
      if (!campaign) {
        setQrError("The campaign for this QR is unavailable. Please contact the campaign team.");
        setQrResolving(false);
        return;
      }
      setQrCampaignId(campaignId);
      try {
        await selectCampaign(campaign);
        if (!cancelled) setQrResolving(false);
      } catch {
        if (!cancelled) {
          setQrError("Could not open this QR campaign. Please try again.");
          setQrResolving(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [qrCode, user?.id, campaignsLoading, campaigns, selectCampaign]);

  const clearQrRoute = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("qr");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    setQrCode(null);
    setQrCampaignId(null);
    setQrError("");
    setQrResolving(false);
  };

  const navigate = (tab: Tab) => {
    setVisitedTabs((visited) => visited.includes(tab) ? visited : [...visited, tab]);
    setActiveTab(tab);
    setNavCompact(false);
    if (movieRoute.campaignId) {
      window.history.pushState({}, "", "/");
      setMovieRoute({ campaignId: null, referralCode: undefined, authMode: false });
    }
  };

  const openMovie = (campaign: Campaign, referralCode?: string) => {
    void selectCampaign(campaign);
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("campaign", campaign.id);
    if (referralCode) url.searchParams.set("ref", referralCode);
    window.history.pushState({}, "", url.toString());
    setMovieRoute({
      campaignId: campaign.id,
      referralCode,
      authMode: false,
    });
  };

  const closeMovie = () => {
    window.history.pushState({}, "", "/");
    setMovieRoute({ campaignId: null, referralCode: undefined, authMode: false });
  };

  const publicMovie = Boolean(movieRoute.campaignId && !user && !movieRoute.authMode);
  const showMovie = Boolean(movieRoute.campaignId && user);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (publicMovie) {
    return (
      <MovieDetailScreen
        campaignId={movieRoute.campaignId!}
        referralCode={movieRoute.referralCode}
        onBack={closeMovie}
      />
    );
  }

  if (!user) return <AuthScreen />;

  if (qrCode) {
    if (qrError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg-primary px-6 text-center">
          <div className="text-lg font-semibold text-text-primary">QR link unavailable</div>
          <p className="max-w-sm text-sm leading-6 text-text-muted">{qrError}</p>
          <button type="button" onClick={() => { clearQrRoute(); navigate("home"); }} className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white">Go to Honeycomb</button>
        </div>
      );
    }
    if (qrResolving || !qrCampaignId || activeCampaign?.id !== qrCampaignId) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-bg-primary text-text-primary">
          <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted">Opening QR campaign…</p>
        </div>
      );
    }
    return <ScannerScreen initialCode={qrCode} onScanComplete={() => { clearQrRoute(); navigate("home"); }} />;
  }

  if (showMovie) {
    return (
      <MovieDetailScreen
        campaignId={movieRoute.campaignId!}
        referralCode={movieRoute.referralCode}
        onBack={closeMovie}
      />
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col w-full max-w-lg mx-auto relative overflow-x-hidden sm:border-x sm:border-white/5">
      <main ref={mainRef} className="flex-1 overflow-y-auto no-scrollbar pb-28">
        {/*
          Keep regular tabs mounted after their first visit. Several screens fetch
          data in effects and show a full-screen spinner while loading; conditional
          rendering here used to unmount them on every tab change and restart those
          requests. The hidden attribute preserves component state without exposing
          inactive content. The scanner is intentionally still conditional so its
          camera is stopped when the user leaves Scan.
        */}
        {visitedTabs.includes("home") && (
          <div hidden={activeTab !== "home"}>
            <HomeScreen onNavigate={navigate} onOpenMovie={openMovie} />
          </div>
        )}
        {visitedTabs.includes("hunts") && (
          <div hidden={activeTab !== "hunts"}>
            <HuntsScreen onNavigate={navigate} />
          </div>
        )}
        {activeTab === "scanner" && (
          <ScannerScreen onScanComplete={() => navigate("home")} />
        )}
        {visitedTabs.includes("map") && (
          <div hidden={activeTab !== "map"}>
            <MapScreen onNavigate={navigate} />
          </div>
        )}
        {visitedTabs.includes("rewards") && (
          <div hidden={activeTab !== "rewards"}>
            <RewardsScreen />
          </div>
        )}
        {visitedTabs.includes("profile") && (
          <div hidden={activeTab !== "profile"}>
            <button className="m-4 text-gold underline" onClick={() => navigate("analytics")}>
              Producer analytics
            </button>
            <ProfileScreen />
          </div>
        )}
        {visitedTabs.includes("analytics") && (
          <div hidden={activeTab !== "analytics"}>
            <AnalyticsScreen />
          </div>
        )}
      </main>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-5 pointer-events-none"
      >
        <div className={"honey-nav-pill pointer-events-auto" + (navCompact ? " honey-nav-pill-compact" : "")}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isScanner = tab.id === "scanner";
            const Icon = isScanner && isActive ? X : tab.icon;

            if (isScanner) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(isActive ? "home" : tab.id)}
                  aria-label={isActive ? "Cancel QR scanner and return Home" : "Scan QR code"}
                  aria-current={isActive ? "page" : undefined}
                  title={isActive ? "Cancel scan · Back to Home" : "Scan"}
                  className={
                    "honey-nav-scan" +
                    (isActive ? " honey-nav-scan-active honey-nav-scan-cancel" : "")
                  }
                >
                  {isActive ? (
                    <>
                      <Icon className="h-[19px] w-[19px]" strokeWidth={2.4} />
                      <span>Cancel</span>
                    </>
                  ) : (
                    <Icon className="h-[24px] w-[24px]" strokeWidth={2.35} />
                  )}
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                title={tab.label}
                className={"honey-nav-button" + (isActive ? " honey-nav-button-active" : "")}
              >
                <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.9} />
                <span className="honey-nav-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
