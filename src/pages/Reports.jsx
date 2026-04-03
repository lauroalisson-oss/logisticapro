import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import KPICard from "../components/shared/KPICard";
import { Input } from "@/components/ui/input";
import { Loader2, Truck, ShoppingCart, Route, CheckCircle2, UserCircle, AlertTriangle, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(213,94%,45%)", "hsl(160,84%,39%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)", "hsl(262,83%,58%)"];

export default function Reports() {
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loads, setLoads] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [o, v, r, l, a, u] = await Promise.all([
      base44.entities.Order.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.Load.list(),
      base44.entities.Alert.list(),
      base44.entities.User.list(),
    ]);
    setOrders(o);
    setVehicles(v);
    setRoutes(r);
    setLoads(l);
    setAlerts(a);
    setDrivers(u.filter(u => u.role === "driver"));
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  // Filter routes by date range
  const filteredRoutes = routes.filter(r => {
    const d = r.date || r.started_at?.slice(0, 10);
    if (!d) return true;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  // Driver stats
  const driverStats = drivers.map(driver => {
    const dRoutes = filteredRoutes.filter(r => r.driver_email === driver.email && r.status === "completed");
    const totalKm = dRoutes.reduce((sum, r) => {
      const dep = r.km_departure || 0;
      const arr = r.km_arrival || 0;
      return sum + (arr > dep ? arr - dep : 0);
    }, 0);
    const dAlerts = alerts.filter(a => {
      if (a.driver_email !== driver.email) return false;
      const d = (a.created_date || "").slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
    return { ...driver, completedRoutes: dRoutes.length, totalKm, incidents: dAlerts };
  }).filter(d => !selectedDriver || d.id === selectedDriver);

  // Charts data
  const ordersByStatus = [
    { name: "Pendentes", value: orders.filter(o => o.status === "pending").length },
    { name: "Em Trânsito", value: orders.filter(o => o.status === "in_transit").length },
    { name: "Entregues", value: orders.filter(o => o.status === "delivered").length },
    { name: "Ocorrências", value: orders.filter(o => o.status === "issue").length },
    { name: "Cancelados", value: orders.filter(o => o.status === "cancelled").length },
  ].filter(d => d.value > 0);

  const vehicleUsage = vehicles.map(v => {
    const vehicleLoads = loads.filter(l => l.vehicle_id === v.id);
    const avgWeight = vehicleLoads.length > 0
      ? vehicleLoads.reduce((sum, l) => sum + (l.weight_percent || 0), 0) / vehicleLoads.length
      : 0;
    return { name: v.nickname, ocupacao: Math.round(avgWeight) };
  });

  const completedRoutes = routes.filter(r => r.status === "completed").length;
  const totalDelivered = orders.filter(o => o.status === "delivered").length;
  const avgLoadWeight = loads.length > 0
    ? loads.reduce((sum, l) => sum + (l.weight_percent || 0), 0) / loads.length
    : 0;

  const productCounts = {};
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      const name = item.product_name || "Desconhecido";
      productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
    });
  });
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, quantidade: qty }));

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" subtitle="Análise de desempenho logístico" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Pedidos" value={orders.length} icon={ShoppingCart} color="primary" />
        <KPICard title="Entregas Feitas" value={totalDelivered} icon={CheckCircle2} color="accent" />
        <KPICard title="Rotas Concluídas" value={completedRoutes} icon={Route} color="purple" />
        <KPICard title="Ocupação Média" value={`${avgLoadWeight.toFixed(0)}%`} icon={Truck} color="warning" />
      </div>

      {/* ===== DRIVER REPORT ===== */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-primary" /> Relatório por Motorista
        </h3>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> De</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Até</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Motorista</label>
            <select
              value={selectedDriver}
              onChange={e => setSelectedDriver(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Todos</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
            </select>
          </div>
          {(dateFrom || dateTo || selectedDriver) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); setSelectedDriver(""); }} className="text-xs text-primary hover:underline pb-1">
              Limpar filtros
            </button>
          )}
        </div>

        {/* Driver cards */}
        <div className="space-y-4">
          {driverStats.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum motorista encontrado</p>
          )}
          {driverStats.map(driver => (
            <div key={driver.id} className="border border-border rounded-xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <UserCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{driver.full_name || driver.email}</p>
                  <p className="text-xs text-muted-foreground">{driver.email}</p>
                </div>
                {driver.license_category && (
                  <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded">
                    CNH {driver.license_category}
                  </span>
                )}
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Rotas Concluídas</p>
                  <p className="text-2xl font-bold text-primary">{driver.completedRoutes}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">KM Rodados</p>
                  <p className="text-2xl font-bold text-foreground">
                    {driver.totalKm > 0 ? driver.totalKm.toLocaleString("pt-BR") : "—"}
                  </p>
                </div>
                <div className={`rounded-lg p-3 text-center ${driver.incidents.length > 0 ? "bg-red-50 border border-red-200" : "bg-muted/40"}`}>
                  <p className="text-xs text-muted-foreground">Ocorrências</p>
                  <p className={`text-2xl font-bold ${driver.incidents.length > 0 ? "text-red-600" : "text-foreground"}`}>
                    {driver.incidents.length}
                  </p>
                </div>
              </div>

              {/* Incidents history */}
              {driver.incidents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Histórico de Ocorrências
                  </p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {driver.incidents.map(inc => (
                      <div key={inc.id} className="flex items-start justify-between gap-3 text-xs bg-muted/30 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <span className={`font-medium ${
                            inc.type === "issue" ? "text-red-600" : inc.type === "not_delivered" ? "text-orange-600" : "text-yellow-600"
                          }`}>
                            {inc.type === "issue" ? "Ocorrência" : inc.type === "not_delivered" ? "Não Entregue" : "Atraso"}
                          </span>
                          {" — "}{inc.client_name}
                          {inc.address && <span className="text-muted-foreground block truncate">{inc.address}</span>}
                          {inc.notes && <span className="text-muted-foreground italic">"{inc.notes}"</span>}
                        </div>
                        <div className="flex-shrink-0 text-right space-y-0.5">
                          <span className={`px-1.5 py-0.5 rounded font-medium block ${
                            inc.status === "resolved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}>
                            {inc.status === "resolved" ? "Resolvida" : "Pendente"}
                          </span>
                          <p className="text-muted-foreground">{new Date(inc.created_date).toLocaleDateString("pt-BR")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ===== CHARTS ===== */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4">Pedidos por Status</h3>
          {ordersByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={ordersByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {ordersByStatus.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4">Ocupação dos Veículos (%)</h3>
          {vehicleUsage.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={vehicleUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="ocupacao" fill="hsl(213,94%,45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Produtos Mais Transportados</h3>
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="quantidade" fill="hsl(160,84%,39%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>
          )}
        </div>
      </div>
    </div>
  );
}