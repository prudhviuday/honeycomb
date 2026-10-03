import { AuthProvider } from '@/context/AuthContext';
import { CampaignProvider } from '@/context/CampaignContext';
import { AppShell } from '@/screens/AppShell';

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
