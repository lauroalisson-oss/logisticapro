import { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import { CompanyProvider, useCompany } from './lib/CompanyContext';
import { isPlatformAdmin, companyHasActiveAccess } from './lib/platformAdmin';
import AppLayout from './components/layout/AppLayout';
import DriverLayout from './components/layout/DriverLayout';
import RoleRouter from './pages/RoleRouter';
import DriverActivation from './pages/DriverActivation';
import CompanySetup from './pages/CompanySetup';
import CompanyAccessLock from './pages/CompanyAccessLock';
import AdminCompanies from './pages/AdminCompanies';
import AdminPins from './pages/AdminPins';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import Loads from './pages/Loads';
import RoutesPage from './pages/Routes';
import Tracking from './pages/Tracking';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';
import MaintenancePage from './pages/Maintenance';
import DriverRoute from './pages/driver/DriverRoute';
import DriverStops from './pages/driver/DriverStops';
import DriverMap from './pages/driver/DriverMap';
import DriverProfile from './pages/driver/DriverProfile';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user, isAuthenticated } = useAuth();
  const { company, companyId, loading: companyLoading } = useCompany();
  const [pendingInvite, setPendingInvite] = useState(null); // null=unchecked, false=none, true=has invite
  const [inviteChecked, setInviteChecked] = useState(false);

  // For users with no company and not yet a driver, check if there's a pending driver invite
  useEffect(() => {
    const shouldCheck = isAuthenticated && user && !user.is_driver && !user.driver_pin && !companyLoading && !company;
    if (!shouldCheck) { setInviteChecked(true); return; }
    base44.functions.invoke('getDriverInvite', {})
      .then(res => { setPendingInvite(!!res.data?.invite); })
      .catch(() => { setPendingInvite(false); })
      .finally(() => setInviteChecked(true));
  }, [isAuthenticated, user, company, companyLoading]);

  // Show loading spinner while checking app public settings or auth
  const needsInviteCheck = isAuthenticated && user && !user.is_driver && !user.driver_pin && !company && !companyLoading;

  if (isLoadingPublicSettings || isLoadingAuth || companyLoading || (needsInviteCheck && !inviteChecked)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Motorista = tem is_driver OU driver_pin OU não tem company_id mas está convidado como "user"
  // O PIN de driver é a barreira de segurança deles — não precisam de empresa.
  const isDriver = isAuthenticated && (user?.is_driver || user?.driver_pin);
  const isAdmin = isAuthenticated && isPlatformAdmin(user);

  // Super-admin não precisa ter empresa e não passa pelo gate de PIN.
  if (isAdmin) {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/admin/companies" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/admin/companies" element={<AdminCompanies />} />
          <Route path="/admin/pins" element={<AdminPins />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin/companies" replace />} />
      </Routes>
    );
  }

  // Motoristas vão direto pro layout deles — bloqueados pelo PIN interno.
  if (isDriver) {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/driver" replace />} />
        <Route element={<DriverLayout />}>
          <Route path="/driver" element={<DriverRoute />} />
          <Route path="/driver/stops" element={<DriverStops />} />
          <Route path="/driver/map" element={<DriverMap />} />
          <Route path="/driver/profile" element={<DriverProfile />} />
        </Route>
        <Route path="*" element={<Navigate to="/driver" replace />} />
      </Routes>
    );
  }

  // Motorista convidado faz 1º login: ainda não tem is_driver, mas tem invite pendente no banco.
  if (isAuthenticated && !isDriver && !company && pendingInvite) {
    return <DriverActivation user={user} onActivated={() => window.location.reload()} />;
  }

  // Usuário normal logado sem empresa — cadastro inicial.
  if (isAuthenticated && !company) {
    return <CompanySetup />;
  }

  // Empresa sem acesso ativo (aguardando PIN, expirada, suspensa): tela de lock.
  if (isAuthenticated && company && !companyHasActiveAccess(company)) {
    return <CompanyAccessLock />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<RoleRouter />} />
      {/* Admin/Dispatcher Layout */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/products" element={<Products />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/loads" element={<Loads />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/tracking" element={<Tracking />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <CompanyProvider>
            <AuthenticatedApp />
          </CompanyProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App