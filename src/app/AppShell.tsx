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
import { getCampaign } from "@/modules/campaigns/api/campaignsApi";
import { useCampaign } from "@/application/state/CampaignContext";
import { resolvePublicQr, recordQrLandingEvent } from "@/modules/qr/api/publicQrApi";
import type { Campaign } from "@/types";
import { registerActivity } from "@/modules/analytics/api/analyticsApi";

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
  qrCode?: string;
  qrPurpose?: string;
  qrResolved?: boolean;
  qrInvalid?: boolean;
}

function readMovieRoute(): MovieRoute {
  const params = new URLSearchParams(window.location.search);
  const match = window.location.pathname.match(/^\/q\/([^/]+)\/?$/i);
  const pathCode = match ? decodeURIComponent(match[1]) : undefined;
  return {
    campaignId: params.get("campaign"),
    referralCode: params.get("ref") || undefined,
    authMode: params.get("auth") === "1",
    qrCode: pathCode || params.get("qr") || undefined,
    qrResolved: !(pathCode || params.get("qr")),
  };
}

export function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const { selectCampaign } = useCampaign();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [visitedTabs, setVisitedTabs] = useState<Tab[]>(["home"]);
  const [movieRoute, setMovieRoute] = useState<MovieRoute>(() => readMovieRoute());
  const [qrResolving, setQrResolving] = useState(() => Boolean(readMovieRoute().qrCode && !readMovieRoute().qrResolved));
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
      const next = readMovieRoute();
      setMovieRoute(next);
      setQrResolving(Boolean(next.qrCode && !next.qrResolved));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const code = movieRoute.qrCode;
    if (!code || movieRoute.campaignId || movieRoute.qrResolved) return;

    let cancelled = false;
    setQrResolving(true);
    let resolutionTimeout: number | undefined;
    const resolution = Promise.race([
      resolvePublicQr(code),
      new Promise<never>((_, reject) => {
        resolutionTimeout = window.setTimeout(
          () => reject(new Error("QR resolution timed out")),
          12000,
        );
      }),
    ]);

    void resolution
      .then((resolved) => {
        if (cancelled) return;
        if (!resolved.success || !resolved.campaignId) {
          setMovieRoute((current) => ({ ...current, qrResolved: true, qrInvalid: true }));
          return;
        }
        setMovieRoute((current) => ({
          ...current,
          campaignId: resolved.campaignId!,
          referralCode: resolved.purpose === "friend_invite"
            ? resolved.referralCode || current.referralCode
            : current.referralCode,
          qrPurpose: resolved.purpose,
          qrResolved: true,
          qrInvalid: false,
        }));
        // Analytics must never hold the visitor on the full-screen loading spinner.
        // Record the page view in the background after routing to the campaign.
        void recordQrLandingEvent(code, "page_view").catch((eventError) => {
          console.warn("[Honeycomb] QR landing event was not recorded:", eventError);
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[Honeycomb] QR resolution failed:", error);
        setMovieRoute((current) => ({ ...current, qrResolved: true, qrInvalid: true }));
      })
      .finally(() => {
        if (resolutionTimeout !== undefined) window.clearTimeout(resolutionTimeout);
        if (!cancelled) setQrResolving(false);
      });

    return () => { cancelled = true; };
  }, [movieRoute.qrCode, movieRoute.campaignId, movieRoute.qrResolved]);

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
    if (user) {
      void registerActivity({
        eventType: "movie_campaign_opened",
        campaignId: campaign.id,
        entityType: "campaign",
        entityId: campaign.id,
        sourceModule: "campaigns",
        metadata: { referral_link_used: Boolean(referralCode) },
      });
    }
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
    setMovieRoute({ campaignId: null, referralCode: undefined, authMode: false, qrResolved: true });
  };

  const publicMovie = Boolean(movieRoute.campaignId && !user && !movieRoute.authMode);
  const showMovie = Boolean(movieRoute.campaignId && user);

  if (authLoading || qrResolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (movieRoute.qrInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg-primary text-text-primary">
        <div className="text-center max-w-sm">
          <p className="font-display text-2xl text-white">QR NOT AVAILABLE</p>
          <p className="text-sm text-text-muted mt-3">This movie promotion QR may be invalid, expired or temporarily unavailable.</p>
          <button type="button" onClick={closeMovie} className="mt-6 px-5 py-3 rounded-xl bg-accent text-white text-sm font-semibold">Explore Honeycomb</button>
        </div>
      </div>
    );
  }

  if (publicMovie) {
    return (
      <MovieDetailScreen
        campaignId={movieRoute.campaignId!}
        referralCode={movieRoute.referralCode}
        qrCode={movieRoute.qrCode}
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
        qrCode={movieRoute.qrCode}
        onBack={closeMovie}
      />
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col w-full max-w-lg mx-auto relative overflow-x-hidden sm:border-x sm:border-white/5 app-frame">
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
          <ScannerScreen
            onScanComplete={(campaignId) => {
              if (!campaignId) {
                navigate("home");
                return;
              }
              void getCampaign(campaignId)
                .then((campaign) => campaign ? openMovie(campaign) : navigate("home"))
                .catch(() => navigate("home"));
            }}
          />
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
            <ProfileScreen onNavigate={navigate} onOpenMovie={openMovie} />
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
