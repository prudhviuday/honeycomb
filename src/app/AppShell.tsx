import { AnalyticsScreen } from "@/modules/analytics/ui/AnalyticsScreen";
import { useState } from "react";
import { Home, Map, ScanLine, Target, User as UserIcon } from "lucide-react";
import { useAuth } from "@/application/state/AuthContext";
import { AuthScreen } from "@/modules/auth/ui/AuthScreen";
import { HomeScreen } from "@/modules/home/ui/HomeScreen";
import { MapScreen } from "@/modules/maps/ui/MapScreen";
import { ScannerScreen } from "@/modules/qr/ui/ScannerScreen";
import { RewardsScreen } from "@/modules/rewards/ui/RewardsScreen";
import { ProfileScreen } from "@/modules/profile/ui/ProfileScreen";
import { HuntsScreen } from "@/modules/hunts/ui/HuntsScreen";

export type Tab =
  "home" | "hunts" | "scanner" | "map" | "rewards" | "profile" | "analytics";

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "hunts", label: "Hunts", icon: Target },
  { id: "scanner", label: "Scan", icon: ScanLine },
  { id: "map", label: "Map", icon: Map },
  { id: "profile", label: "Profile", icon: UserIcon },
];

export function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const navigate = (tab: Tab) => setActiveTab(tab);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col w-full max-w-lg mx-auto relative overflow-x-hidden sm:border-x sm:border-white/5">
      <main className="flex-1 overflow-y-auto no-scrollbar pb-28">
        {activeTab === "home" && <HomeScreen onNavigate={navigate} />}
        {activeTab === "hunts" && <HuntsScreen onNavigate={navigate} />}
        {activeTab === "scanner" && (
          <ScannerScreen onScanComplete={() => setActiveTab("home")} />
        )}
        {activeTab === "map" && <MapScreen onNavigate={navigate} />}
        {activeTab === "rewards" && <RewardsScreen />}
        {activeTab === "profile" && (
          <>
            <button
              className="m-4 text-gold underline"
              onClick={() => setActiveTab("analytics")}
            >
              Producer analytics
            </button>
            <ProfileScreen />
          </>
        )}
        {activeTab === "analytics" && <AnalyticsScreen />}
      </main>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-6 bg-gradient-to-t from-bg-primary via-bg-primary/90 to-transparent pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center justify-between rounded-[22px] bg-[#141418] border border-white/[0.08] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] px-2 py-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isScanner = tab.id === "scanner";
            if (isScanner)
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-label="Scan QR code"
                  aria-current={isActive ? "page" : undefined}
                  className="flex-1 flex justify-center"
                >
                  <span className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-[0_8px_24px_-6px_rgba(229,9,20,0.65)] transition-transform active:scale-95 hover:bg-accent-bright">
                    <Icon
                      className="w-[22px] h-[22px] text-white"
                      strokeWidth={2.4}
                    />
                  </span>
                </button>
              );
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl transition-colors"
              >
                <Icon
                  className={
                    "w-[21px] h-[21px] transition-colors " +
                    (isActive ? "text-white" : "text-white/40")
                  }
                  strokeWidth={isActive ? 2.3 : 1.8}
                  fill={isActive && tab.id === "home" ? "currentColor" : "none"}
                  fillOpacity={0.12}
                />
                <span
                  className={
                    "text-[10px] font-semibold tracking-wide transition-colors " +
                    (isActive ? "text-white" : "text-white/40")
                  }
                >
                  {tab.label}
                </span>
                <span
                  aria-hidden="true"
                  className={
                    "h-[3px] rounded-full bg-accent transition-all " +
                    (isActive ? "w-4 opacity-100" : "w-0 opacity-0")
                  }
                />
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
