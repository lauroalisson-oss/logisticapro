import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import StatusBadge from "@/components/shared/StatusBadge";
import { RefreshCw, Truck, MapPin, Navigation, CheckCircle2, Clock, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";
import { parseGeometry, formatDuration, getRouteDeparture, getDeliveryStops, getRouteGeometry, serializeGeometry } from "@/lib/routing";
import { useCompany } from "@/lib/CompanyContext";

// Fix default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const stopStatusColor = {
  pending: "#f59e0b",
  en_route: "#3b82f6",
  delivered: "#10b981",
  not_delivered: "#ef4444",
  issue: "#ef4444",
};

const stopStatusIcon = (status) => L.divIcon({
  className: "",
  html: `<div style="
    width:28px;height:28px;border-radius:50%;border:3px solid white;
    background:${stopStatusColor[status] || "#64748b"};
    box-shadow:0 2px 8px rgba(0,0,0,0.35);
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:700;color:white;
  "></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const departureIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:32px;height:32px;border-radius:8px;border:3px solid white;
    background:#0f172a;box-shadow:0 2px 10px rgba(0,0,0,0.4);
    display:flex;align-items:center;justify-content:center;font-size:15px;
  ">🏭</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const vehicleIcon = (plate) => L.divIcon({
  className: "",
  html: `<div style="
    background:#1d6dc4;border:3px solid white;border-radius:8px;
    padding:3px 6px;color:white;font-size:10px;font-weight:700;
    box-shadow:0 2px 10px rgba(0,0,0,0.4);white-space:nowrap;
  ">🚚 ${plate || "?"}</div>`,
  iconSize: [80, 28],
  iconAnchor: [40, 14],
});

const ROUTE_COLORS = ["#1d6dc4", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [positions.join(",")]);
  return null;
}

export default function RouteMapView() {
  const { companyId } = useCompany();
  const [routes, setRoutes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  // Lazy geometries for routes that don't yet have route_geometry persisted.
  // Keyed by route id; populated on demand and written back to the entity.
  const [lazyGeometry, setLazyGeometry] = useState({});

  const loadData = async () => {
    if (!companyId) return;
    const [r, l] = await Promise.all([
      base44.entities.Route.filter({ company_id: companyId, status: ["started", "in_progress", "planned"] }),
      base44.entities.DriverLocation.filter({ company_id: companyId, is_active: true }),
    ]);
    // include planned too — filter active ones
    const active = r.filter(rt => ["started", "in_progress", "planned"].includes(rt.status));
    setRoutes(active);
    setLocations(l);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [companyId]);

  // For each route without a persisted geometry, fetch one and write it back
  // so the trajectory follows real roads instead of straight lines.
  useEffect(() => {
    let cancelled = false;
    routes.forEach(async (r) => {
      if (parseGeometry(r.route_geometry)) return;
      if (lazyGeometry[r.id]) return;
      const departure = getRouteDeparture(r);
      const deliveries = getDeliveryStops(r)
        .filter(s => s.latitude && s.longitude)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      const points = departure ? [departure, ...deliveries] : deliveries;
      if (points.length < 2) return;
      const result = await getRouteGeometry(points);
      if (cancelled || !result?.coordinates?.length) return;
      setLazyGeometry(prev => ({ ...prev, [r.id]: result.coordinates }));
      try {
        await base44.entities.Route.update(r.id, {
          route_geometry: serializeGeometry(result.coordinates),
          total_distance_km: result.distance_km || r.total_distance_km,
          estimated_duration_min: result.duration_min || r.estimated_duration_min,
          estimated_time_min: result.duration_min || r.estimated_time_min,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[RouteMapView] could not persist geometry:", err?.message || err);
      }
    });
    return () => { cancelled = true; };
  }, [routes]);

  const displayRoutes = selectedRoute ? routes.filter(r => r.id === selectedRoute) : routes;

  // Collect all positions for FitBounds (departure + deliveries + live drivers)
  const allPositions = displayRoutes.flatMap(r => {
    const dep = getRouteDeparture(r);
    const stops = getDeliveryStops(r).filter(s => s.latitude && s.longitude).map(s => [s.latitude, s.longitude]);
    return dep ? [[dep.latitude, dep.longitude], ...stops] : stops;
  }).concat(
    locations.filter(l => l.latitude && l.longitude).map(l => [l.latitude, l.longitude])
  );

  const defaultCenter = [-23.55, -46.63];

  const stopStats = (route) => {
    const stops = getDeliveryStops(route);
    return {
      total: stops.length,
      delivered: stops.filter(s => s.status === "delivered").length,
      pending: stops.filter(s => s.status === "pending").length,
      issue: stops.filter(s => s.status === "issue" || s.status === "not_delivered").length,
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* Sidebar panel */}
      <div className="lg:w-72 xl:w-80 flex-shrink-0 bg-card border rounded-xl overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-card z-10">
          <div>
            <h3 className="font-semibold text-sm">Rotas Ativas</h3>
            <p className="text-xs text-muted-foreground">{routes.length} rota(s) • atualizado {moment(lastRefresh).fromNow()}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={loadData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* All routes toggle */}
        <div className="p-2">
          <button
            onClick={() => setSelectedRoute(null)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              !selectedRoute ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            <span className="font-medium">Todas as rotas</span>
          </button>
        </div>

        <div className="px-2 pb-2 space-y-1">
          {routes.map((r, idx) => {
            const stats = stopStats(r);
            const progress = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
            const isSelected = selectedRoute === r.id;
            const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
            const driverLoc = locations.find(l => l.driver_email === r.driver_email);

            return (
              <button
                key={r.id}
                onClick={() => setSelectedRoute(isSelected ? null : r.id)}
                className={`w-full text-left px-3 py-3 rounded-lg border transition-all ${
                  isSelected ? "border-primary bg-primary/5" : "border-transparent hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="font-medium text-sm truncate">{r.route_number}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-muted-foreground ml-5 truncate">{r.driver_name} • {r.vehicle_plate}</p>

                <div className="ml-5 mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                  {r.total_distance_km != null && <span>🛣️ {r.total_distance_km} km</span>}
                  {(r.estimated_duration_min ?? r.estimated_time_min) != null && (
                    <span>⏱️ {formatDuration(r.estimated_duration_min ?? r.estimated_time_min)}</span>
                  )}
                  {r.actual_distance_km != null && r.actual_distance_km > 0 && (
                    <span className="text-emerald-700 font-medium">📍 {r.actual_distance_km} km percorridos</span>
                  )}
                  {r.optimized && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-px rounded-sm bg-primary/10 text-primary text-[10px] font-medium">
                      <Sparkles className="w-2.5 h-2.5" /> Otimizada
                    </span>
                  )}
                </div>

                <div className="ml-5 mt-2 flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-3 h-3" />{stats.delivered}
                  </span>
                  <span className="flex items-center gap-1 text-amber-500">
                    <Clock className="w-3 h-3" />{stats.pending}
                  </span>
                  {stats.issue > 0 && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="w-3 h-3" />{stats.issue}
                    </span>
                  )}
                  {driverLoc && (
                    <span className="flex items-center gap-1 text-primary ml-auto">
                      <Navigation className="w-3 h-3" /> ao vivo
                    </span>
                  )}
                </div>

                <div className="ml-5 mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: color }} />
                </div>
              </button>
            );
          })}

          {routes.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma rota ativa
            </div>
          )}
        </div>

        {/* Live vehicles */}
        {locations.length > 0 && (
          <div className="p-4 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" /> Veículos ao Vivo
            </h4>
            <div className="space-y-2">
              {locations.map(loc => (
                <div key={loc.id} className="flex items-center justify-between bg-secondary/40 px-3 py-1.5 rounded-lg">
                  <div>
                    <p className="text-xs font-medium">{loc.driver_name}</p>
                    <p className="text-[10px] text-muted-foreground">{loc.vehicle_plate}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{moment(loc.last_update).fromNow()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-xl overflow-hidden border">
        <MapContainer
          center={defaultCenter}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />

          {allPositions.length > 0 && <FitBounds positions={allPositions} />}

          {/* Route polylines + stop markers */}
          {displayRoutes.map((r, idx) => {
            const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
            const departure = getRouteDeparture(r);
            const validStops = getDeliveryStops(r).filter(s => s.latitude && s.longitude);
            const straightPositions = [
              ...(departure ? [[departure.latitude, departure.longitude]] : []),
              ...validStops.map(s => [s.latitude, s.longitude]),
            ];
            const geometry = parseGeometry(r.route_geometry) || lazyGeometry[r.id];
            const hasRealGeometry = Array.isArray(geometry) && geometry.length > 1;

            const driven = parseGeometry(r.driven_path);

            return (
              <div key={r.id}>
                {hasRealGeometry ? (
                  <Polyline positions={geometry} color={color} weight={4} opacity={0.6} />
                ) : (
                  straightPositions.length > 1 && (
                    <Polyline positions={straightPositions} color={color} weight={3} opacity={0.55} dashArray="8 4" />
                  )
                )}
                {Array.isArray(driven) && driven.length > 1 && (
                  <Polyline positions={driven} color="#059669" weight={5} opacity={0.9} dashArray="2 6" />
                )}
                {departure && (
                  <Marker
                    key={`${r.id}-dep`}
                    position={[departure.latitude, departure.longitude]}
                    icon={departureIcon}
                  >
                    <Popup>
                      <div className="min-w-[160px]">
                        <p className="font-semibold text-sm">🏭 Ponto de Partida</p>
                        <p className="text-xs text-gray-500">{departure.address}</p>
                        <p className="text-xs text-gray-400 mt-1">Rota: {r.route_number}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}
                {validStops.map((stop, si) => (
                  <Marker
                    key={`${r.id}-${si}`}
                    position={[stop.latitude, stop.longitude]}
                    icon={stopStatusIcon(stop.status)}
                  >
                    <Popup>
                      <div className="min-w-[180px] space-y-1">
                        <p className="font-semibold text-sm">#{stop.sequence} — {stop.client_name}</p>
                        <p className="text-xs text-gray-500">{stop.address}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs font-medium">Status:</span>
                          <span className="text-xs" style={{ color: stopStatusColor[stop.status] || "#64748b" }}>
                            {stop.status === "pending" ? "Pendente" :
                             stop.status === "delivered" ? "Entregue" :
                             stop.status === "en_route" ? "A caminho" :
                             stop.status === "not_delivered" ? "Não entregue" :
                             stop.status === "issue" ? "Ocorrência" : stop.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">Rota: {r.route_number}</p>
                        {stop.delivered_at && <p className="text-xs text-gray-400">Entregue: {moment(stop.delivered_at).format("DD/MM HH:mm")}</p>}
                        {stop.delivery_notes && <p className="text-xs italic text-gray-500">{stop.delivery_notes}</p>}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </div>
            );
          })}

          {/* Live vehicle markers */}
          {locations.map(loc => (
            loc.latitude && loc.longitude ? (
              <Marker
                key={`vehicle-${loc.id}`}
                position={[loc.latitude, loc.longitude]}
                icon={vehicleIcon(loc.vehicle_plate)}
                zIndexOffset={1000}
              >
                <Popup>
                  <div className="min-w-[160px] space-y-1">
                    <p className="font-semibold text-sm flex items-center gap-1.5">🚚 {loc.driver_name}</p>
                    <p className="text-xs text-gray-500">Veículo: {loc.vehicle_plate}</p>
                    <p className="text-xs text-gray-500">Progresso: {loc.route_progress || 0}%</p>
                    <p className="text-xs text-gray-400">Atualizado: {moment(loc.last_update).fromNow()}</p>
                  </div>
                </Popup>
                <Circle
                  center={[loc.latitude, loc.longitude]}
                  radius={120}
                  pathOptions={{ color: "#1d6dc4", fillColor: "#1d6dc4", fillOpacity: 0.1, weight: 1 }}
                />
              </Marker>
            ) : null
          ))}
        </MapContainer>
      </div>
    </div>
  );
}