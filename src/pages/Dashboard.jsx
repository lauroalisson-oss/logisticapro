import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import KPICard from "../components/shared/KPICard";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import {
  ShoppingCart, Truck, Route, AlertTriangle, MapPin,
  Clock, CheckCircle2, XCircle, Loader2
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const truckIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [o, v, r, l] = await Promise.all([
      base44.entities.Order.list(),
      base44.entities.Vehicle.list(),
      base44.entities.Route.list(),
      base44.entities.DriverLocation.filter({ is_active: true }),
    ]);
    setOrders(o);
    setVehicles(v);
    setRoutes(r);
    setLocations(l);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const orderStats = {
    pending: orders.filter(o => o.status === "pending").length,
    routing: orders.filter(o => o.status === "routing").length,
    in_transit: orders.filter(o => o.status === "in_transit").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    issue: orders.filter(o => o.status === "issue").length,
  };

  const vehicleStats = {
    available: vehicles.filter(v => v.status === "available").length,
    on_route: vehicles.filter(v => v.status === "on_route").length,
    maintenance: vehicles.filter(v => v.status === "maintenance").length,
    inactive: vehicles.filter(v => v.status === "inactive").length,
  };

  const activeRoutes = routes.filter(r => ["started", "in_progress"].includes(r.status));
  const recentOrders = [...orders].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Visão geral da operação logística" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard title="Pendentes" value={orderStats.pending} icon={Clock} color="warning" />
        <KPICard title="Em Trânsito" value={orderStats.in_transit} icon={Truck} color="purple" />
        <KPICard title="Entregues" value={orderStats.delivered} icon={CheckCircle2} color="accent" />
        <KPICard title="Ocorrências" value={orderStats.issue} icon={XCircle} color="destructive" />
        <KPICard title="Rotas Ativas" value={activeRoutes.length} icon={Route} color="primary" />
      </div>

      {/* Vehicles + Map */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Vehicle Summary */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" /> Frota
          </h3>
          <div className="space-y-3">
            {[
              { status: "available", count: vehicleStats.available },
              { status: "on_route", count: vehicleStats.on_route },
              { status: "maintenance", count: vehicleStats.maintenance },
              { status: "inactive", count: vehicleStats.inactive },
            ].map(item => (
              <div key={item.status} className="flex items-center justify-between">
                <StatusBadge status={item.status} />
                <span className="text-lg font-bold">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">Total: {vehicles.length} veículos</p>
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Rastreamento em Tempo Real
            </h3>
          </div>
          <div className="h-80">
            <MapContainer
              center={[-23.55, -46.63]}
              zoom={11}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {locations.map((loc) => (
                <Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={truckIcon}>
                  <Popup>
                    <strong>{loc.driver_name}</strong><br />
                    {loc.vehicle_plate}<br />
                    Progresso: {loc.route_progress || 0}%
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Recent Orders + Active Routes */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" /> Pedidos Recentes
          </h3>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum pedido</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">{order.client_name}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" /> Rotas Ativas
          </h3>
          {activeRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma rota ativa</p>
          ) : (
            <div className="space-y-3">
              {activeRoutes.map(route => (
                <div key={route.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{route.route_number}</p>
                    <p className="text-xs text-muted-foreground">{route.driver_name} • {route.vehicle_plate}</p>
                  </div>
                  <StatusBadge status={route.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {(orderStats.issue > 0 || vehicleStats.maintenance > 0) && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" /> Alertas
          </h3>
          <div className="space-y-2">
            {orderStats.issue > 0 && (
              <p className="text-sm text-destructive">{orderStats.issue} pedido(s) com ocorrência</p>
            )}
            {vehicleStats.maintenance > 0 && (
              <p className="text-sm text-destructive">{vehicleStats.maintenance} veículo(s) em manutenção</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}