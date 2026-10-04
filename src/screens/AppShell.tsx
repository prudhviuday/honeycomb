import { useState } from 'react';
import { Home, Map, ScanLine, Target, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthScreen } from './AuthScreen';
import { HomeScreen } from './HomeScreen';
import { MapScreen } from './MapScreen';
import { ScannerScreen } from './ScannerScreen';
import { RewardsScreen } from './RewardsScreen';
import { ProfileScreen } from './ProfileScreen';
import { HuntsScreen } from './HuntsScreen';

export type Tab = 'home' | 'hunts' | 'scanner' | 'map' | 'rewards' | 'profile';

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'hunts', label: 'Hunts', icon: Target },
  { id: 'scanner', label: 'Scan', icon: ScanLine },
  { id: 'map', label: 'Map', icon: Map },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

export function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('home');

  const navigate = (tab: Tab) => setActiveTab(tab);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col max-w-md mx-auto relative overflow-x-hidden">
      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        {activeTab === 'home' && <HomeScreen onNavigate={navigate} />}
        {activeTab === 'hunts' && <HuntsScreen onNavigate={navigate} />}
        {activeTab === 'scanner' && <ScannerScreen onScanComplete={() => setActiveTab('home')} />}
        {activeTab === 'map' && <MapScreen onNavigate={navigate} />}
        {activeTab === 'rewards' && <RewardsScreen />}
        {activeTab === 'profile' && <ProfileScreen />}
      </div>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#170B13]/92 backdrop-blur-2xl border-t border-white/7 z-50 shadow-[0_-18px_48px_rgba(0,0,0,0.38)]">
        <div className="flex items-center justify-around px-2 pt-2.5 pb-1 safe-area-inset">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isScanner = tab.id === 'scanner';

            if (isScanner) {
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex flex-col items-center -mt-7"
                >
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#F04F9B] to-[#FF6B4A] flex items-center justify-center shadow-xl shadow-pink-500/25 transition-transform active:scale-95 ring-4 ring-[#170B13]">
                    <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-[9px] font-semibold text-pink-300 mt-1 tracking-[0.14em] uppercase">{tab.label}</span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center gap-1 py-1 px-2 transition-all min-w-[52px]"
              >
                <Icon
                  className={'w-[22px] h-[22px] transition-colors ' + (isActive ? 'text-white' : 'text-white/28')}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span className={'text-[9px] font-medium tracking-wide transition-colors ' + (isActive ? 'text-white' : 'text-white/28')}>
                  {tab.label}
                </span>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-pink-400 -mt-0.5 shadow-[0_0_8px_rgba(232,62,140,0.7)]" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
