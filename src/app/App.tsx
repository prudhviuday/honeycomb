import { AuthProvider } from '@/application/state/AuthContext';
import { CampaignProvider } from '@/application/state/CampaignContext';
import { AppShell } from './AppShell';

function App() {
  return (
    <AuthProvider>
      <CampaignProvider>
        <AppShell />
      </CampaignProvider>
    </AuthProvider>
  );
}

export default App;
