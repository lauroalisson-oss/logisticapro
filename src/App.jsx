import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import { CompanyProvider, useCompany } from './lib/CompanyContext';
import { isPlatformAdmin, companyHasActiveAccess } from './lib/platformAdmin';
import AppLayout from './components/layout/AppLayout';
import DriverLayout from './components/layout/DriverLayout';
import RoleRouter from './pages/RoleRouter';
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

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth || companyLoading) {
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

  const isDriver = isAuthenticated && (user?.is_driver || user?.driver_pin);
  const isAdmin = isAuthenticated && isPlatformAdmin(user);

  // Super-admin não precisa ter empresa e não passa pelo gate de PIN.
  // Rotas de plataforma (/admin/*) + visão read-through pro painel normal.
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

  // Usuário normal logado sem empresa (e não é motorista) — cadastro inicial.
  if (isAuthenticated && !company && !isDriver) {
    return <CompanySetup />;
  }

  // Empresa sem acesso ativo (aguardando PIN, expirada, suspensa): tela de lock.
  // Motoristas passam direto — eles são gated pelo próprio PIN deles.
  if (isAuthenticated && company && !isDriver && !companyHasActiveAccess(company)) {
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
      {/* Driver Layout */}
      <Route element={<DriverLayout />}>
        <Route path="/driver" element={<DriverRoute />} />
        <Route path="/driver/stops" element={<DriverStops />} />
        <Route path="/driver/map" element={<DriverMap />} />
        <Route path="/driver/profile" element={<DriverProfile />} />
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