import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import KPICard from "../components/shared/KPICard";
import { Loader2, BarChart3, Truck, Package, ShoppingCart, Route, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(213,94%,45%)", "hsl(160,84%,39%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)", "hsl(262,83%,58%)"];

export default function Reports() {
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [o, v, r, l] = await Promise.all([
      base44.entities.Order.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.Load.list(),
    ]);
    setOrders(o);
    setVehicles(v);
    setRoutes(r);
    setLoads(l);
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

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

  // Products most transported
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

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Orders by Status */}
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

        {/* Vehicle Usage */}
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

        {/* Top Products */}
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