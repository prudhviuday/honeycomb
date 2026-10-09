import { AuthProvider } from '@/application/state/AuthContext';
import { CampaignProvider } from '@/application/state/CampaignContext';
import { LocationTracker } from '@/modules/maps/ui/LocationTracker';
import { AppShell } from './AppShell';
 
function App() {
  return (
    <AuthProvider>
      <CampaignProvider>
        <LocationTracker />
        <AppShell />
      </CampaignProvider>
    </AuthProvider>
  );
}

export default App;
