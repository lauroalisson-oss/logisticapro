import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { hasPagePermission } from "@/lib/permissions";

// Bloqueia uma rota para vendedores sem a permissão indicada, mandando de
// volta pro dashboard. Gestor e admin nunca são afetados.
export function RequirePermission({ perm, children }) {
  const { user } = useAuth();
  if (!hasPagePermission(user, perm)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

// Gestão de vendedores é exclusiva do gestor — não é uma permissão
// configurável, é restrição de papel (um vendedor nunca deveria conseguir
// ver ou editar outros vendedores, mesmo por engano de configuração).
export function RequireGestor({ children }) {
  const { user } = useAuth();
  if (user?.is_seller) return <Navigate to="/dashboard" replace />;
  return children;
}
