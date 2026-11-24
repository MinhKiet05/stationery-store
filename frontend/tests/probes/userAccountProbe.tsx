import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import Header from '../../src/components/header/Header';
import DashboardHeader from '../../src/components/dashboard/DashboardHeader';
import { useCurrentUser } from '../../src/services/storeQueries';
import { useAdminSessionEvents } from '../../src/services/adminSession';
import { API_BASE } from '../../src/services/api';
import { queryClient, queryKeys, sessionScope } from '../../src/services/queryCache';
import '../../src/pages/dashboard/Dashboard.css';

function Probe() {
  useAdminSessionEvents();
  const identity = useCurrentUser();
  return <><Header /><div className="dashboard-shell">
    {identity.data && localStorage.getItem('accessToken') && <DashboardHeader admin={identity.data} toggle={() => {}} expanded={false} />}
  </div></>;
}

// Expose only to the isolated browser fixture, never imported into the production app.
Object.assign(window, {
  accountUpdateIdentity: (changes: object) => queryClient.setQueryData(queryKeys.private('currentUser', { base: API_BASE }),
    (previous: object) => ({ ...previous, ...changes })),
  accountUpdateProfile: (profile: object) => queryClient.setQueryData(queryKeys.private('profile'), profile),
  accountPrivateCount: () => { sessionScope(); return queryClient.getQueryCache().getAll().filter(q => q.queryKey[0] === 'session' && q.state.data !== undefined).length; },
});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><BrowserRouter><Probe /></BrowserRouter></QueryClientProvider>);
