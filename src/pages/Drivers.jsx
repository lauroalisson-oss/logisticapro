import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Loader2, Search, UserCircle } from "lucide-react";

export default function Drivers() {
  const [users, setUsers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [u, r] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Route.list(),
    ]);
    setUsers(u);
    setRoutes(r);
    setLoading(false);
  };

  const drivers = users.filter(u => u.role === "driver");
  const filtered = drivers.filter(d =>
    !search || d.full_name?.toLowerCase().includes(search.toLowerCase()) || d.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getDriverRoutes = (email) => routes.filter(r => r.driver_email === email);
  const getActiveRoute = (email) => routes.find(r => r.driver_email === email && ["started", "in_progress"].includes(r.status));

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Motoristas" subtitle={`${drivers.length} motoristas`} />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar motorista..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(d => {
          const driverRoutes = getDriverRoutes(d.email);
          const activeRoute = getActiveRoute(d.email);
          const completed = driverRoutes.filter(r => r.status === "completed").length;

          return (
            <div key={d.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{d.full_name}</p>
                  <p className="text-xs text-muted-foreground">{d.email}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                {d.phone && <p>Tel: {d.phone}</p>}
                <p>Rotas concluídas: {completed}</p>
                <p>Total de rotas: {driverRoutes.length}</p>
              </div>
              {activeRoute && (
                <div className="mt-3 p-2 bg-primary/5 rounded-lg">
                  <p className="text-xs font-medium text-primary">🚛 Rota ativa: {activeRoute.route_number}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum motorista encontrado</p>
          <p className="text-xs mt-1">Convide motoristas com o perfil "driver"</p>
        </div>
      )}
    </div>
  );
}