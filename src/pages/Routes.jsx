import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useCompany } from "@/lib/CompanyContext";
import { safeParallel } from "@/lib/safeLoad";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Route, Loader2, Eye, Trash2, Map, Zap, AlertCircle, RefreshCcw, Sparkles } from "lucide-react";
import RouteMapView from "../components/routes/RouteMapView";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  getRouteGeometry,
  optimizeStopOrder,
  parseGeometry,
  serializeGeometry,
  formatDuration,
  getRouteDeparture,
  getDeliveryStops,
} from "@/lib/routing";
import L from "leaflet";
import { toast } from "sonner";

const departureIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:34px;height:34px;border-radius:8px;border:3px solid white;
    background:#0f172a;box-shadow:0 2px 10px rgba(0,0,0,0.4);
    display:flex;align-items:center;justify-content:center;font-size:16px;
  ">🏭</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export default function Routes() {
  const { companyId, company } = useCompany();
  const [routes, setRoutes] = useState([]);
  const [loads, setLoads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mapRoute, setMapRoute] = useState(null);
  const [mapGeometry, setMapGeometry] = useState(null);
  const [selectedLoad, setSelectedLoad] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("list");
  const [optimizeRoute, setOptimizeRoute] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [actionRouteId, setActionRouteId] = useState(null);

  useEffect(() => { if (companyId) loadData(); }, [companyId]);

  const loadData = async () => {
    const [r, l, o, u, invites] = await safeParallel([
      () => base44.entities.Route.filter({ company_id: companyId }),
      () => base44.entities.Load.filter({ company_id: companyId }),
      () => base44.entities.Order.filter({ company_id: companyId }),
      // Listar User direto exige permissão que usuários comuns não têm
      // (403) — a função backend roda com service role e valida a empresa.
      () => base44.functions.invoke('getCompanyDrivers', { company_id: companyId }).then(r => r.data?.users || []),
      () => base44.entities.DriverInvite.filter({ company_id: companyId }),
    ]);
    const userEmails = new Set((u || []).map(x => x.email));
    const inviteDrivers = (invites || []).map(i => ({
      id: i.id,
      email: i.email,
      full_name: i.full_name || i.email,
      _fromInvite: true,
    })).filter(i => !userEmails.has(i.email));
    setRoutes(r); setLoads(l); setOrders(o);
    setUsers([...(u || []), ...inviteDrivers]);
    setLoading(false);
  };

  const readyLoads = loads.filter(l => ["assembling", "ready"].includes(l.status));
  const drivers = users.filter(u => u.role === "driver" || u.is_driver || u.driver_pin || u._fromInvite);

  const handleCreate = async () => {
    const load = loads.find(l => l.id === selectedLoad);
    const driver = users.find(u => u.id === selectedDriver);
    if (!load || !driver) return;
    setCreating(true);
    setCreateError("");

    const loadOrders = orders.filter(o => (load.order_ids || []).includes(o.id));

    // Only include orders with real geocoordinates
    const withCoords = loadOrders.filter(o => o.latitude && o.longitude);
    const withoutCoords = loadOrders.filter(o => !o.latitude || !o.longitude);

    if (withoutCoords.length > 0) {
      setCreateError(`${withoutCoords.length} pedido(s) sem geolocalização: ${withoutCoords.map(o => o.order_number).join(", ")}. Edite-os e aguarde o pin aparecer no mapa.`);
      setCreating(false);
      return;
    }

    const rawStops = withCoords.map((o, idx) => ({
      order_id: o.id,
      order_number: o.order_number,
      client_name: o.client_name,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      sequence: idx + 1,
      status: "pending",
    }));

    // Departure point from company settings — used as routing anchor only,
    // never persisted inside stops[].
    const depLat = company?.departure_lat;
    const depLng = company?.departure_lng;
    const hasDeparture = depLat && depLng;
    const departure = hasDeparture
      ? {
          _isDeparture: true,
          latitude: depLat,
          longitude: depLng,
          address: company.departure_address || "Base",
        }
      : null;

    let finalStops = rawStops.map((s, i) => ({ ...s, sequence: i + 1 }));
    let totalDistanceKm = null;
    let totalDurationMin = null;
    let geometryCoords = null;
    let optimized = false;

    if (rawStops.length >= 1) {
      const allPoints = departure ? [departure, ...rawStops] : rawStops;
      if (allPoints.length >= 2) {
        const canOptimize = optimizeRoute && rawStops.length >= 2;
        const result = canOptimize
          ? await optimizeStopOrder(allPoints, { fixEnd: false })
          : await getRouteGeometry(allPoints);

        const orderedStops = canOptimize ? result.stops : allPoints;
        // Strip the departure marker before persisting; it's stored separately.
        const deliveriesOnly = orderedStops.filter((s) => !s._isDeparture);
        finalStops = deliveriesOnly.map((s, i) => {
          // eslint-disable-next-line no-unused-vars
          const { _isDeparture, ...rest } = s;
          return { ...rest, sequence: i + 1 };
        });
        totalDistanceKm = result.distance_km || null;
        totalDurationMin = result.duration_min || null;
        geometryCoords = result.coordinates || null;
        optimized = !!(canOptimize && result.optimized);
      }
    }

    const route = {
      company_id: companyId,
      route_number: `ROT-${Date.now().toString(36).toUpperCase()}`,
      load_id: load.id,
      load_number: load.load_number,
      vehicle_id: load.vehicle_id,
      vehicle_plate: load.vehicle_plate,
      driver_id: driver.id,
      driver_name: driver.full_name,
      driver_email: driver.email,
      stops: finalStops,
      departure_lat: departure?.latitude || null,
      departure_lng: departure?.longitude || null,
      departure_address: departure?.address || null,
      total_distance_km: totalDistanceKm,
      estimated_duration_min: totalDurationMin,
      estimated_time_min: totalDurationMin,
      route_geometry: serializeGeometry(geometryCoords),
      optimized,
      status: "planned",
      date: new Date().toISOString().split("T")[0],
    };

    await base44.entities.Route.create(route);
    await base44.entities.Load.update(load.id, { status: "ready" });

    setDialogOpen(false);
    setSelectedLoad("");
    setSelectedDriver("");
    setCreating(false);
    loadData();
  };

  const handleDelete = async (id) => {
    // Cascade the deletion so the load and its orders do not get stranded:
    // without this, the load stays "ready" forever and its orders stay in
    // "routing" — effectively orphaned.
    const route = routes.find(r => r.id === id);
    const load = route?.load_id ? loads.find(l => l.id === route.load_id) : null;
    try {
      if (load) {
        await base44.entities.Load.update(load.id, { status: "assembling" });
        for (const oid of (load.order_ids || [])) {
          await base44.entities.Order.update(oid, { status: "pending" });
        }
      }
      await base44.entities.Route.delete(id);
    } catch (err) {
      console.error("Falha ao excluir rota:", err);
      alert("Não foi possível excluir a rota. Tente novamente.");
      return;
    }
    if (mapRoute?.id === id) {
      setMapRoute(null);
      setMapGeometry(null);
    }
    loadData();
  };

  const openMapRoute = async (r) => {
    setMapRoute(r);
    const persisted = parseGeometry(r.route_geometry);
    if (persisted && persisted.length > 1) {
      setMapGeometry(persisted);
      return;
    }
    setMapGeometry(null);
    const departure = getRouteDeparture(r);
    const deliveries = getDeliveryStops(r)
      .filter(s => s.latitude && s.longitude)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const points = departure ? [departure, ...deliveries] : deliveries;
    if (points.length >= 2) {
      const result = await getRouteGeometry(points);
      setMapGeometry(result.coordinates || null);
    }
  };

  const recalcGeometry = async (r) => {
    setActionRouteId(r.id);
    try {
      const departure = getRouteDeparture(r);
      const deliveries = getDeliveryStops(r)
        .filter(s => s.latitude && s.longitude)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      const allPoints = departure
        ? [{ ...departure, _isDeparture: true }, ...deliveries]
        : deliveries;
      if (allPoints.length < 2) {
        toast.error("Rota precisa de pelo menos 2 pontos com geolocalização");
        return;
      }
      const result = await getRouteGeometry(allPoints);
      await base44.entities.Route.update(r.id, {
        route_geometry: serializeGeometry(result.coordinates),
        total_distance_km: result.distance_km,
        estimated_duration_min: result.duration_min,
        estimated_time_min: result.duration_min,
      });
      toast.success(
        result.fallback
          ? "Trajeto recalculado em modo simplificado (motor de rotas indisponível)"
          : `Trajeto atualizado — ${result.distance_km} km • ${formatDuration(result.duration_min)}`
      );
      if (mapRoute?.id === r.id) setMapGeometry(result.coordinates);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Falha ao recalcular trajeto");
    } finally {
      setActionRouteId(null);
    }
  };

  const optimizeOrder = async (r) => {
    setActionRouteId(r.id);
    try {
      const departure = getRouteDeparture(r);
      const deliveries = getDeliveryStops(r)
        .filter(s => s.latitude && s.longitude)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      if (deliveries.length < 2) {
        toast.error("É preciso ao menos 2 paradas de entrega para otimizar");
        return;
      }
      const allPoints = departure
        ? [{ ...departure, _isDeparture: true }, ...deliveries]
        : deliveries;
      const result = await optimizeStopOrder(allPoints, { fixEnd: false });
      const reordered = result.stops.filter((s) => !s._isDeparture);
      const newStops = reordered.map((s, i) => {
        // eslint-disable-next-line no-unused-vars
        const { _isDeparture, ...rest } = s;
        return { ...rest, sequence: i + 1 };
      });
      await base44.entities.Route.update(r.id, {
        stops: newStops,
        route_geometry: serializeGeometry(result.coordinates),
        total_distance_km: result.distance_km,
        estimated_duration_min: result.duration_min,
        estimated_time_min: result.duration_min,
        optimized: !!result.optimized,
      });
      toast.success(
        result.optimized
          ? `Ordem otimizada — ${result.distance_km} km • ${formatDuration(result.duration_min)}`
          : "Não foi possível otimizar agora; ordem mantida"
      );
      if (mapRoute?.id === r.id) setMapGeometry(result.coordinates);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Falha ao otimizar a ordem das paradas");
    } finally {
      setActionRouteId(null);
    }
  };

  const filtered = routes.filter(r => filterStatus === "all" || r.status === filterStatus);

  // Load stops without coords warning for selected load
  const selectedLoadData = loads.find(l => l.id === selectedLoad);
  const loadOrdersList = selectedLoadData ? orders.filter(o => (selectedLoadData.order_ids || []).includes(o.id)) : [];
  const missingGeoCount = loadOrdersList.filter(o => !o.latitude || !o.longitude).length;

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Rotas" subtitle={`${routes.length} rotas`}>
        <Button onClick={() => { setDialogOpen(true); setCreateError(""); }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Rota
        </Button>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
        <button onClick={() => setActiveTab("list")} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "list" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Route className="w-4 h-4" /> Lista
        </button>
        <button onClick={() => setActiveTab("map")} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "map" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Map className="w-4 h-4" /> Mapa ao Vivo
        </button>
      </div>

      {activeTab === "map" && <RouteMapView />}

      {activeTab === "list" && (
        <>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="planned">Planejada</SelectItem>
              <SelectItem value="started">Iniciada</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
            </SelectContent>
          </Select>

          <div className="grid lg:grid-cols-2 gap-4">
            {filtered.map(r => {
              const deliveries = getDeliveryStops(r);
              const totalStops = deliveries.length;
              const deliveredStops = deliveries.filter(s => s.status === "delivered").length;
              const progress = totalStops > 0 ? Math.round((deliveredStops / totalStops) * 100) : 0;
              const durationMin = r.estimated_duration_min ?? r.estimated_time_min;
              const isBusy = actionRouteId === r.id;
              return (
                <div key={r.id} className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-2">
                      <div>
                        <p className="font-semibold">{r.route_number}</p>
                        <p className="text-xs text-muted-foreground">{r.driver_name} • {r.vehicle_plate}</p>
                      </div>
                      {r.optimized && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
                          <Sparkles className="w-2.5 h-2.5" /> Otimizada
                        </span>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                    <span>{totalStops} parada(s)</span>
                    <span>{progress}% concluído</span>
                    {r.total_distance_km != null && <span>🛣️ {r.total_distance_km} km</span>}
                    {durationMin != null && <span>⏱️ {formatDuration(durationMin)}</span>}
                    {r.actual_distance_km != null && r.actual_distance_km > 0 && (
                      <span className="text-emerald-700 font-medium">📍 {r.actual_distance_km} km percorridos</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" className="flex-1 min-w-[110px]" onClick={() => openMapRoute(r)}>
                      <Eye className="w-3 h-3 mr-1" /> Ver Mapa
                    </Button>
                    <Button variant="outline" size="sm" disabled={isBusy} onClick={() => optimizeOrder(r)}>
                      {isBusy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                      Otimizar Ordem
                    </Button>
                    <Button variant="outline" size="sm" disabled={isBusy} onClick={() => recalcGeometry(r)}>
                      {isBusy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                      Recalcular Trajeto
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(r.id)} className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Route className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma rota encontrada</p>
            </div>
          )}
        </>
      )}

      {/* New Route Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Rota</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Carga</Label>
              <Select value={selectedLoad} onValueChange={v => {
                setSelectedLoad(v);
                setCreateError("");
                // Auto-fill driver from load
                const load = loads.find(l => l.id === v);
                if (load?.driver_id) setSelectedDriver(load.driver_id);
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione uma carga..." /></SelectTrigger>
                <SelectContent>
                  {readyLoads.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.load_number} — {l.vehicle_nickname} ({(l.order_ids || []).length} pedidos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Warn if orders missing geocoords */}
            {selectedLoad && missingGeoCount > 0 && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{missingGeoCount} pedido(s) desta carga não têm geolocalização. Edite-os em Pedidos para que o pino apareça no mapa e a rota seja calculada corretamente.</span>
              </div>
            )}
            {selectedLoad && missingGeoCount === 0 && loadOrdersList.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✅ Todos os {loadOrdersList.length} pedidos estão geolocalizados
              </div>
            )}

            <div>
              <Label>Motorista</Label>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger><SelectValue placeholder="Selecione um motorista..." /></SelectTrigger>
                <SelectContent>
                  {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.email})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {!company?.departure_lat && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Ponto de partida não configurado. Acesse <strong>Configurações</strong> para definir o endereço base da empresa. A rota será calculada apenas entre as paradas.</span>
              </div>
            )}
            {company?.departure_lat && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                📍 Saindo de: <strong>{company.departure_address || "Ponto configurado"}</strong>
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <input
                type="checkbox"
                id="optimize"
                checked={optimizeRoute}
                onChange={e => setOptimizeRoute(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="optimize" className="text-sm cursor-pointer flex-1">
                <span className="font-medium flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Otimizar Rota por Estradas Reais</span>
                <span className="block text-xs text-muted-foreground">Usa o motor OSRM para calcular a melhor sequência baseada em distâncias reais de estrada</span>
              </label>
            </div>

            {createError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <Button
              onClick={handleCreate}
              className="w-full"
              disabled={!selectedLoad || !selectedDriver || creating}
            >
              {creating ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Calculando rota real...</>
              ) : "Criar Rota"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Map Dialog */}
      <Dialog open={!!mapRoute} onOpenChange={() => { setMapRoute(null); setMapGeometry(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Mapa — {mapRoute?.route_number}</DialogTitle>
            {mapRoute?.total_distance_km != null && (
              <p className="text-xs text-muted-foreground">
                🛣️ {mapRoute.total_distance_km} km por estradas reais
                {(mapRoute.estimated_duration_min ?? mapRoute.estimated_time_min) != null &&
                  ` • ⏱️ ~${formatDuration(mapRoute.estimated_duration_min ?? mapRoute.estimated_time_min)}`}
                {mapRoute.actual_distance_km != null && mapRoute.actual_distance_km > 0 &&
                  ` • 📍 ${mapRoute.actual_distance_km} km percorridos`}
                {mapRoute.optimized && " • ✨ Otimizada"}
              </p>
            )}
          </DialogHeader>
          {mapRoute && (() => {
            const departure = getRouteDeparture(mapRoute);
            const sortedStops = getDeliveryStops(mapRoute)
              .filter(s => s.latitude && s.longitude)
              .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
            const center = departure
              ? [departure.latitude, departure.longitude]
              : sortedStops[0]
                ? [sortedStops[0].latitude, sortedStops[0].longitude]
                : [-23.55, -46.63];
            const fallbackPositions = [
              ...(departure ? [[departure.latitude, departure.longitude]] : []),
              ...sortedStops.map(s => [s.latitude, s.longitude]),
            ];
            return (
              <div className="h-96 rounded-lg overflow-hidden">
                <MapContainer
                  center={center}
                  zoom={10}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {departure && (
                    <Marker position={[departure.latitude, departure.longitude]} icon={departureIcon}>
                      <Popup>
                        <strong>🏭 Ponto de Partida</strong><br />
                        {departure.address}
                      </Popup>
                    </Marker>
                  )}
                  {sortedStops.map((stop, idx) => (
                    <Marker key={stop.order_id || idx} position={[stop.latitude, stop.longitude]}>
                      <Popup>
                        <strong>#{stop.sequence} {stop.client_name}</strong><br />
                        {stop.address}<br />
                        <StatusBadge status={stop.status} />
                      </Popup>
                    </Marker>
                  ))}
                  {mapGeometry && mapGeometry.length > 1 && (
                    <Polyline positions={mapGeometry} color="hsl(213, 94%, 45%)" weight={4} opacity={0.6} />
                  )}
                  {!mapGeometry && fallbackPositions.length > 1 && (
                    <Polyline
                      positions={fallbackPositions}
                      color="hsl(213, 94%, 45%)"
                      weight={3}
                      dashArray="6,6"
                      opacity={0.55}
                    />
                  )}
                  {(() => {
                    const driven = parseGeometry(mapRoute.driven_path);
                    return Array.isArray(driven) && driven.length > 1 ? (
                      <Polyline positions={driven} color="#059669" weight={5} opacity={0.9} dashArray="2 6" />
                    ) : null;
                  })()}
                </MapContainer>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}