import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Route, Loader2, MapPin, Eye, Trash2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [loads, setLoads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mapRoute, setMapRoute] = useState(null);
  const [selectedLoad, setSelectedLoad] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [r, l, o, u] = await Promise.all([
      base44.entities.Route.list(),
      base44.entities.Load.list(),
      base44.entities.Order.list(),
      base44.entities.User.list(),
    ]);
    setRoutes(r);
    setLoads(l);
    setOrders(o);
    setUsers(u);
    setLoading(false);
  };

  const readyLoads = loads.filter(l => ["assembling", "ready"].includes(l.status));
  const drivers = users.filter(u => u.role === "driver");

  const handleCreate = async () => {
    const load = loads.find(l => l.id === selectedLoad);
    const driver = users.find(u => u.id === selectedDriver);
    if (!load || !driver) return;

    const loadOrders = orders.filter(o => (load.order_ids || []).includes(o.id));
    const stops = loadOrders.map((o, idx) => ({
      order_id: o.id,
      order_number: o.order_number,
      client_name: o.client_name,
      address: o.address,
      latitude: o.latitude || -23.55 + (Math.random() - 0.5) * 0.1,
      longitude: o.longitude || -46.63 + (Math.random() - 0.5) * 0.1,
      sequence: idx + 1,
      status: "pending",
    }));

    const route = {
      route_number: `ROT-${Date.now().toString(36).toUpperCase()}`,
      load_id: load.id,
      load_number: load.load_number,
      vehicle_id: load.vehicle_id,
      vehicle_plate: load.vehicle_plate,
      driver_id: driver.id,
      driver_name: driver.full_name,
      driver_email: driver.email,
      stops,
      status: "planned",
      date: new Date().toISOString().split("T")[0],
    };

    await base44.entities.Route.create(route);
    await base44.entities.Load.update(load.id, { status: "ready" });

    setDialogOpen(false);
    setSelectedLoad("");
    setSelectedDriver("");
    loadData();
  };

  const handleDelete = async (id) => {
    await base44.entities.Route.delete(id);
    loadData();
  };

  const filtered = routes.filter(r => filterStatus === "all" || r.status === filterStatus);

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Rotas" subtitle={`${routes.length} rotas`}>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Rota
        </Button>
      </PageHeader>

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
          const totalStops = (r.stops || []).length;
          const deliveredStops = (r.stops || []).filter(s => s.status === "delivered").length;
          const progress = totalStops > 0 ? Math.round((deliveredStops / totalStops) * 100) : 0;

          return (
            <div key={r.id} className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{r.route_number}</p>
                  <p className="text-xs text-muted-foreground">{r.driver_name} • {r.vehicle_plate}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                <span>{totalStops} parada(s)</span>
                <span>{progress}% concluído</span>
                {r.total_distance_km && <span>{r.total_distance_km} km</span>}
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setMapRoute(r)}>
                  <Eye className="w-3 h-3 mr-1" /> Ver Mapa
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

      {/* New Route Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Rota</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Carga</Label>
              <Select value={selectedLoad} onValueChange={setSelectedLoad}>
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
            <div>
              <Label>Motorista</Label>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger><SelectValue placeholder="Selecione um motorista..." /></SelectTrigger>
                <SelectContent>
                  {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.email})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} className="w-full" disabled={!selectedLoad || !selectedDriver}>Criar Rota</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Map Dialog */}
      <Dialog open={!!mapRoute} onOpenChange={() => setMapRoute(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Mapa — {mapRoute?.route_number}</DialogTitle></DialogHeader>
          {mapRoute && (
            <div className="h-96 rounded-lg overflow-hidden">
              <MapContainer
                center={mapRoute.stops?.length > 0 ? [mapRoute.stops[0].latitude, mapRoute.stops[0].longitude] : [-23.55, -46.63]}
                zoom={12}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {(mapRoute.stops || []).map((stop, idx) => (
                  <Marker key={idx} position={[stop.latitude, stop.longitude]}>
                    <Popup>
                      <strong>#{stop.sequence} {stop.client_name}</strong><br />
                      {stop.address}<br />
                      <StatusBadge status={stop.status} />
                    </Popup>
                  </Marker>
                ))}
                {mapRoute.stops?.length > 1 && (
                  <Polyline
                    positions={mapRoute.stops.map(s => [s.latitude, s.longitude])}
                    color="hsl(213, 94%, 45%)"
                    weight={3}
                  />
                )}
              </MapContainer>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}