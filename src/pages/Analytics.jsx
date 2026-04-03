import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, TrendingDown, Package, Truck, ShoppingCart, Users } from "lucide-react";
import { format, subDays, parseISO, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = ["#1d6dc4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const STATUS_LABELS = {
  pending: "Pendente",
  routing: "Roteirização",
  in_transit: "Em Trânsito",
  delivered: "Entregue",
  issue: "Ocorrência",
  cancelled: "Cancelado",
};

function KPI({ label, value, sub, icon: Icon, trend, color = "blue" }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="bg-card rounded-xl border p-5 flex items-start gap-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
            {trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loads, setLoads] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    Promise.all([
      base44.entities.Order.list("-created_date", 200),
      base44.entities.Vehicle.list(),
      base44.entities.Load.list("-created_date", 100),
      base44.entities.Route.list("-created_date", 100),
    ]).then(([o, v, l, r]) => {
      setOrders(o);
      setVehicles(v);
      setLoads(l);
      setRoutes(r);
      setLoading(false);
    });
  }, []);

  // ─── Derived Data ────────────────────────────────────────────────────────────
  const cutoff = subDays(new Date(), range);

  const filteredOrders = orders.filter(o =>
    o.created_date && isAfter(new Date(o.created_date), cutoff)
  );

  // Orders per day (area chart)
  const ordersPerDay = (() => {
    const map = {};
    for (let i = range - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "dd/MM");
      map[d] = { date: d, total: 0, entregues: 0 };
    }
    filteredOrders.forEach(o => {
      const d = format(new Date(o.created_date), "dd/MM");
      if (map[d]) {
        map[d].total++;
        if (o.status === "delivered") map[d].entregues++;
      }
    });
    return Object.values(map);
  })();

  // Status distribution (pie)
  const statusDist = Object.entries(
    filteredOrders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([status, value]) => ({ name: STATUS_LABELS[status] || status, value }));

  // Weight per load (bar)
  const weightData = loads.slice(0, 10).map(l => ({
    name: l.load_number || "?",
    peso: l.total_weight_kg || 0,
    volume: ((l.total_volume_m3 || 0) * 100).toFixed(0) * 1,
  }));

  // Vehicle status (pie)
  const vehicleStatus = Object.entries(
    vehicles.reduce((acc, v) => {
      const labels = { available: "Disponível", on_route: "Em Rota", maintenance: "Manutenção", inactive: "Inativo" };
      const k = labels[v.status] || v.status;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Route completion trend
  const routeCompletion = routes.slice(0, 12).reverse().map(r => ({
    name: r.route_number || "?",
    paradas: r.stops?.length || 0,
    entregues: r.stops?.filter(s => s.status === "delivered").length || 0,
  }));

  // KPI values
  const deliveredCount = filteredOrders.filter(o => o.status === "delivered").length;
  const deliveryRate = filteredOrders.length > 0
    ? Math.round((deliveredCount / filteredOrders.length) * 100)
    : 0;
  const activeVehicles = vehicles.filter(v => v.status === "on_route").length;
  const avgWeight = loads.length > 0
    ? Math.round(loads.reduce((a, l) => a + (l.total_weight_kg || 0), 0) / loads.length)
    : 0;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader title="Analytics" subtitle="Métricas e desempenho operacional">
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                range === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Pedidos (período)" value={filteredOrders.length} icon={ShoppingCart} color="blue"
          sub={`${deliveredCount} entregues`} trend="up" />
        <KPI label="Taxa de Entrega" value={`${deliveryRate}%`} icon={TrendingUp} color="green"
          sub="No período selecionado" trend={deliveryRate >= 80 ? "up" : "down"} />
        <KPI label="Veículos em Rota" value={activeVehicles} icon={Truck} color="amber"
          sub={`de ${vehicles.length} total`} />
        <KPI label="Peso Médio / Carga" value={`${avgWeight} kg`} icon={Package} color="purple"
          sub={`${loads.length} cargas registradas`} />
      </div>

      {/* Area + Pie row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border p-5">
          <h3 className="font-semibold mb-4">Pedidos ao Longo do Tempo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ordersPerDay}>
              <defs>
                <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1d6dc4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#1d6dc4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gEntregues" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.floor(range / 7)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="total" name="Total" stroke="#1d6dc4" fill="url(#gTotal)" strokeWidth={2} />
              <Area type="monotone" dataKey="entregues" name="Entregues" stroke="#10b981" fill="url(#gEntregues)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold mb-4">Status dos Pedidos</h3>
          {statusDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusDist} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {statusDist.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
          )}
        </div>
      </div>

      {/* Bar + Line row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold mb-4">Peso por Carga (últimas 10)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weightData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="peso" name="Peso (kg)" fill="#1d6dc4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold mb-4">Paradas vs Entregas por Rota</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={routeCompletion}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="paradas" name="Paradas" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="entregues" name="Entregues" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vehicle status */}
      <div className="bg-card rounded-xl border p-5">
        <h3 className="font-semibold mb-4">Status da Frota</h3>
        <div className="flex flex-wrap gap-3">
          {vehicleStatus.map((v, i) => (
            <div key={i} className="flex items-center gap-2 bg-secondary/50 px-4 py-2 rounded-full text-sm">
              <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="font-medium">{v.name}</span>
              <span className="text-muted-foreground">— {v.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={vehicleStatus} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
              <Tooltip />
              <Bar dataKey="value" name="Veículos" radius={[0, 4, 4, 0]}>
                {vehicleStatus.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}