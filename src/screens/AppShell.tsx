import { useState } from 'react';
import { Home, Map, ScanLine, Award, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthScreen } from './AuthScreen';
import { HomeScreen } from './HomeScreen';
import { MapScreen } from './MapScreen';
import { ScannerScreen } from './ScannerScreen';
import { RewardsScreen } from './RewardsScreen';
import { ProfileScreen } from './ProfileScreen';

export type Tab = 'home' | 'map' | 'scanner' | 'rewards' | 'profile';

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'map', label: 'Map', icon: Map },
  { id: 'scanner', label: 'Scan', icon: ScanLine },
  { id: 'rewards', label: 'Rewards', icon: Award },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

export function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('home');

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-7 h-7 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col max-w-md mx-auto relative">
      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'map' && <MapScreen />}
        {activeTab === 'scanner' && <ScannerScreen onScanComplete={() => setActiveTab('home')} />}
        {activeTab === 'rewards' && <RewardsScreen />}
        {activeTab === 'profile' && <ProfileScreen />}
      </div>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md glass-strong hairline-t z-50">
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
                  <div className="w-14 h-14 rounded-full bg-gold flex items-center justify-center shadow-xl shadow-gold/20 transition-transform active:scale-95">
                    <Icon className="w-6 h-6 text-bg-primary" strokeWidth={2.5} />
                  </div>
                  <span className="text-[9px] font-medium text-gold mt-1 tracking-wide uppercase">{tab.label}</span>
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
                  className={`w-[22px] h-[22px] transition-colors ${isActive ? 'text-text-primary' : 'text-text-subtle'}`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span className={`text-[9px] font-medium tracking-wide uppercase transition-colors ${isActive ? 'text-text-primary' : 'text-text-subtle'}`}>
                  {tab.label}
                </span>
                {isActive && <div className="w-1 h-1 rounded-full bg-gold -mt-0.5" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
