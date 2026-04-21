import { useState, useEffect } from "react";
import { useCompany } from "@/lib/CompanyContext";
import { base44 } from "@/api/base44Client";
import { safeParallel } from "@/lib/safeLoad";
import PageHeader from "../components/shared/PageHeader";
import KPICard from "../components/shared/KPICard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, ShoppingCart, Route, CheckCircle2, UserCircle, AlertTriangle, Calendar, Fuel, Plus, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(213,94%,45%)", "hsl(160,84%,39%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)", "hsl(262,83%,58%)"];
const FUEL_LABELS = { gasoline: "Gasolina", diesel: "Diesel", ethanol: "Etanol", gnv: "GNV" };

// Expected km/l by vehicle type (rough defaults)
const EXPECTED_KML = { van: 10, truck_small: 8, truck_medium: 6, truck_large: 4, motorcycle: 25, car: 12 };
const DEVIATION_THRESHOLD = 0.25; // 25% deviation triggers alert

export default function Reports() {
  const { companyId } = useCompany();
  const [tab, setTab] = useState("general");
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loads, setLoads] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [fuelRecords, setFuelRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Driver filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");

  // Fuel form
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({ vehicle_id: "", date: "", km: "", liters: "", value: "", fuel_type: "diesel", notes: "" });
  const [savingFuel, setSavingFuel] = useState(false);

  useEffect(() => { if (companyId) loadData(); }, [companyId]);

  const loadData = async () => {
    const [o, v, r, l, a, u, f] = await safeParallel([
      () => base44.entities.Order.filter({ company_id: companyId }),
      () => base44.entities.Vehicle.filter({ company_id: companyId }),
      () => base44.entities.Route.filter({ company_id: companyId }),
      () => base44.entities.Load.filter({ company_id: companyId }),
      () => base44.entities.Alert.filter({ company_id: companyId }),
      () => base44.entities.User.filter({ company_id: companyId }),
      () => base44.entities.FuelRecord.filter({ company_id: companyId }, "-date"),
    ]);
    setOrders(o); setVehicles(v); setRoutes(r); setLoads(l);
    setAlerts(a); setDrivers(u.filter(x => x.role === "driver" || x.is_driver || x.driver_pin));
    setFuelRecords(f);
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  // ---- Driver report logic ----
  const filteredRoutes = routes.filter(r => {
    const d = r.date || r.started_at?.slice(0, 10);
    if (!d) return true;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  const driverStats = drivers.map(driver => {
    const dRoutes = filteredRoutes.filter(r => r.driver_email === driver.email && r.status === "completed");
    // Prefer real odometer readings when available; fall back to the OSRM
    // planned distance so the "KM Rodados" column isn't stuck at 0 for the
    // current fleet that only captures departure/arrival photos.
    const totalKm = dRoutes.reduce((sum, r) => {
      const dep = r.km_departure || 0;
      const arr = r.km_arrival || 0;
      if (arr > dep) return sum + (arr - dep);
      return sum + (r.total_distance_km || 0);
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

  // ---- Fuel logic ----
  const vehicleConsumption = vehicles.map(vehicle => {
    const records = fuelRecords.filter(f => f.vehicle_id === vehicle.id).sort((a, b) => a.km - b.km);
    const segments = [];
    for (let i = 1; i < records.length; i++) {
      const kmDiff = records[i].km - records[i - 1].km;
      const liters = records[i].liters;
      if (kmDiff > 0 && liters > 0) segments.push(kmDiff / liters);
    }
    const avgKml = segments.length > 0 ? segments.reduce((s, v) => s + v, 0) / segments.length : null;
    const expected = EXPECTED_KML[vehicle.vehicle_type] || null;
    let alert = null;
    if (avgKml !== null && expected !== null) {
      const deviation = (avgKml - expected) / expected;
      if (deviation < -DEVIATION_THRESHOLD) alert = "low";
      else if (deviation > DEVIATION_THRESHOLD) alert = "high";
    }
    const totalSpent = records.reduce((s, f) => s + (f.value || 0), 0);
    const totalLiters = records.reduce((s, f) => s + (f.liters || 0), 0);
    return { vehicle, records, avgKml, expected, alert, totalSpent, totalLiters };
  }).filter(v => v.records.length > 0);

  const handleSaveFuel = async () => {
    setSavingFuel(true);
    const v = vehicles.find(v => v.id === fuelForm.vehicle_id);
    await base44.entities.FuelRecord.create({
      ...fuelForm,
      company_id: companyId,
      km: Number(fuelForm.km),
      liters: Number(fuelForm.liters),
      value: Number(fuelForm.value),
      vehicle_plate: v?.plate || "",
      vehicle_nickname: v?.nickname || "",
    });
    setFuelForm({ vehicle_id: "", date: "", km: "", liters: "", value: "", fuel_type: "diesel", notes: "" });
    setShowFuelForm(false);
    setSavingFuel(false);
    const f = await base44.entities.FuelRecord.list("-date");
    setFuelRecords(f);
  };

  // ---- General charts ----
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
      ? vehicleLoads.reduce((sum, l) => sum + (l.weight_percent || 0), 0) / vehicleLoads.length : 0;
    return { name: v.nickname, ocupacao: Math.round(avgWeight) };
  });

  const completedRoutes = routes.filter(r => r.status === "completed").length;
  const totalDelivered = orders.filter(o => o.status === "delivered").length;
  const avgLoadWeight = loads.length > 0 ? loads.reduce((sum, l) => sum + (l.weight_percent || 0), 0) / loads.length : 0;

  const productCounts = {};
  orders.forEach(o => (o.items || []).forEach(item => {
    const name = item.product_name || "Desconhecido";
    productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
  }));
  const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, quantidade: qty }));

  const tabs = [
    { id: "general", label: "Geral" },
    { id: "drivers", label: "Motoristas" },
    { id: "fuel", label: "Abastecimentos" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" subtitle="Análise de desempenho logístico" />

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== GENERAL TAB ===== */}
      {tab === "general" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Total Pedidos" value={orders.length} icon={ShoppingCart} color="primary" />
            <KPICard title="Entregas Feitas" value={totalDelivered} icon={CheckCircle2} color="accent" />
            <KPICard title="Rotas Concluídas" value={completedRoutes} icon={Route} color="purple" />
            <KPICard title="Ocupação Média" value={`${avgLoadWeight.toFixed(0)}%`} icon={Truck} color="warning" />
          </div>
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
              ) : <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>}
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
              ) : <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>}
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
              ) : <p className="text-sm text-muted-foreground text-center py-12">Sem dados</p>}
            </div>
          </div>
        </div>
      )}

      {/* ===== DRIVERS TAB ===== */}
      {tab === "drivers" && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
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
              <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">Todos</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
              </select>
            </div>
            {(dateFrom || dateTo || selectedDriver) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setSelectedDriver(""); }} className="text-xs text-primary hover:underline pb-1">Limpar filtros</button>
            )}
          </div>

          <div className="space-y-4">
            {driverStats.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum motorista encontrado</p>}
            {driverStats.map(driver => (
              <div key={driver.id} className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{driver.full_name || driver.email}</p>
                    <p className="text-xs text-muted-foreground">{driver.email}</p>
                  </div>
                  {driver.license_category && (
                    <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded">CNH {driver.license_category}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Rotas Concluídas</p>
                    <p className="text-2xl font-bold text-primary">{driver.completedRoutes}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">KM Rodados</p>
                    <p className="text-2xl font-bold text-foreground">{driver.totalKm > 0 ? Math.round(driver.totalKm).toLocaleString("pt-BR") : "—"}</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${driver.incidents.length > 0 ? "bg-red-50 border border-red-200" : "bg-muted/40"}`}>
                    <p className="text-xs text-muted-foreground">Ocorrências</p>
                    <p className={`text-2xl font-bold ${driver.incidents.length > 0 ? "text-red-600" : "text-foreground"}`}>{driver.incidents.length}</p>
                  </div>
                </div>
                {driver.incidents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Histórico de Ocorrências
                    </p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {driver.incidents.map(inc => (
                        <div key={inc.id} className="flex items-start justify-between gap-3 text-xs bg-muted/30 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <span className={`font-medium ${inc.type === "issue" ? "text-red-600" : inc.type === "not_delivered" ? "text-orange-600" : "text-yellow-600"}`}>
                              {inc.type === "issue" ? "Ocorrência" : inc.type === "not_delivered" ? "Não Entregue" : "Atraso"}
                            </span>
                            {" — "}{inc.client_name}
                            {inc.address && <span className="text-muted-foreground block truncate">{inc.address}</span>}
                            {inc.notes && <span className="text-muted-foreground italic">"{inc.notes}"</span>}
                          </div>
                          <div className="flex-shrink-0 text-right space-y-0.5">
                            <span className={`px-1.5 py-0.5 rounded font-medium block ${inc.status === "resolved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
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
      )}

      {/* ===== FUEL TAB ===== */}
      {tab === "fuel" && (
        <div className="space-y-5">
          {/* Register button */}
          <div className="flex justify-end">
            <Button onClick={() => setShowFuelForm(v => !v)} variant={showFuelForm ? "outline" : "default"} className="gap-2">
              {showFuelForm ? <><X className="w-4 h-4" /> Cancelar</> : <><Plus className="w-4 h-4" /> Registrar Abastecimento</>}
            </Button>
          </div>

          {/* Fuel form */}
          {showFuelForm && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Fuel className="w-4 h-4 text-primary" /> Novo Abastecimento</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Veículo *</label>
                  <select value={fuelForm.vehicle_id} onChange={e => setFuelForm(f => ({ ...f, vehicle_id: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="">Selecione...</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.nickname} ({v.plate})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Data *</label>
                  <Input type="date" value={fuelForm.date} onChange={e => setFuelForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Combustível</label>
                  <select value={fuelForm.fuel_type} onChange={e => setFuelForm(f => ({ ...f, fuel_type: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    {Object.entries(FUEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">KM no Momento *</label>
                  <Input type="number" placeholder="ex: 45230" value={fuelForm.km} onChange={e => setFuelForm(f => ({ ...f, km: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Litros Abastecidos *</label>
                  <Input type="number" placeholder="ex: 60" value={fuelForm.liters} onChange={e => setFuelForm(f => ({ ...f, liters: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Valor Total (R$) *</label>
                  <Input type="number" placeholder="ex: 360.00" value={fuelForm.value} onChange={e => setFuelForm(f => ({ ...f, value: e.target.value }))} />
                </div>
                <div className="space-y-1 col-span-2 md:col-span-3">
                  <label className="text-xs text-muted-foreground">Observações</label>
                  <Input placeholder="Posto, motorista, etc." value={fuelForm.notes} onChange={e => setFuelForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveFuel} disabled={savingFuel || !fuelForm.vehicle_id || !fuelForm.date || !fuelForm.km || !fuelForm.liters || !fuelForm.value}>
                  {savingFuel ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                </Button>
              </div>
            </div>
          )}

          {/* Per-vehicle consumption cards */}
          {vehicleConsumption.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12 bg-card border border-border rounded-xl">Nenhum abastecimento registrado ainda.</p>
          )}
          {vehicleConsumption.map(({ vehicle, records, avgKml, expected, alert, totalSpent, totalLiters }) => (
            <div key={vehicle.id} className={`bg-card border rounded-xl p-5 space-y-4 ${alert ? "border-red-300" : "border-border"}`}>
              {/* Vehicle header */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{vehicle.nickname}</p>
                  <p className="text-xs text-muted-foreground">{vehicle.plate}</p>
                </div>
                {alert === "low" && (
                  <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-1.5 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5" /> Consumo abaixo do esperado
                  </div>
                )}
                {alert === "high" && (
                  <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-medium px-3 py-1.5 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5" /> Consumo acima do esperado
                  </div>
                )}
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Consumo Médio</p>
                  <p className={`text-xl font-bold ${alert === "low" ? "text-red-600" : "text-foreground"}`}>
                    {avgKml !== null ? `${avgKml.toFixed(2)} km/l` : "—"}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Esperado</p>
                  <p className="text-xl font-bold text-muted-foreground">{expected ? `${expected} km/l` : "—"}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Litros</p>
                  <p className="text-xl font-bold text-foreground">{totalLiters.toLocaleString("pt-BR")} L</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Gasto</p>
                  <p className="text-xl font-bold text-foreground">R$ {totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Records table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left pb-2 pr-3">Data</th>
                      <th className="text-right pb-2 pr-3">KM</th>
                      <th className="text-right pb-2 pr-3">Litros</th>
                      <th className="text-right pb-2 pr-3">Valor</th>
                      <th className="text-right pb-2 pr-3">R$/L</th>
                      <th className="text-left pb-2">Combustível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(rec => (
                      <tr key={rec.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-2 pr-3">{new Date(rec.date).toLocaleDateString("pt-BR")}</td>
                        <td className="py-2 pr-3 text-right">{rec.km?.toLocaleString("pt-BR")}</td>
                        <td className="py-2 pr-3 text-right">{rec.liters?.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right">R$ {rec.value?.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right">{rec.liters > 0 ? `R$ ${(rec.value / rec.liters).toFixed(2)}` : "—"}</td>
                        <td className="py-2">{FUEL_LABELS[rec.fuel_type] || rec.fuel_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}