import { useEffect, useState } from "react";
import { AnalyticsScreen } from "@/modules/analytics/ui/AnalyticsScreen";
import { House, Map, ScanLine, Ticket, UserRound } from "lucide-react";
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
  const { selectCampaign } = useCampaign();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [movieRoute, setMovieRoute] = useState<MovieRoute>(() => readMovieRoute());

  useEffect(() => {
    const handlePopState = () => setMovieRoute(readMovieRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (tab: Tab) => {
    setActiveTab(tab);
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
      <main className="flex-1 overflow-y-auto no-scrollbar pb-28">
        {activeTab === "home" && <HomeScreen onNavigate={navigate} onOpenMovie={openMovie} />}
        {activeTab === "hunts" && <HuntsScreen onNavigate={navigate} />}
        {activeTab === "scanner" && (
          <ScannerScreen onScanComplete={() => setActiveTab("home")} />
        )}
        {activeTab === "map" && <MapScreen onNavigate={navigate} />}
        {activeTab === "rewards" && <RewardsScreen />}
        {activeTab === "profile" && (
          <>
            <button className="m-4 text-gold underline" onClick={() => setActiveTab("analytics")}>
              Producer analytics
            </button>
            <ProfileScreen />
          </>
        )}
        {activeTab === "analytics" && <AnalyticsScreen />}
      </main>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-5 pointer-events-none"
      >
        <div className="honey-nav-pill pointer-events-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isScanner = tab.id === "scanner";

            if (isScanner) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigate(tab.id)}
                  aria-label="Scan QR code"
                  aria-current={isActive ? "page" : undefined}
                  title="Scan"
                  className={"honey-nav-scan" + (isActive ? " honey-nav-scan-active" : "")}
                >
                  <Icon className="h-[24px] w-[24px]" strokeWidth={2.35} />
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
