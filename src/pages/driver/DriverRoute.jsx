import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Loader2, Play, CheckCircle2, MapPin, Navigation } from "lucide-react";

export default function DriverRoute() {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const locationInterval = useRef(null);

  useEffect(() => {
    loadRoute();
    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, []);

  const loadRoute = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const routes = await base44.entities.Route.filter({ driver_email: me.email });
    const active = routes.find(r => ["planned", "started", "in_progress"].includes(r.status));
    setRoute(active || null);
    setLoading(false);
  };

  const startRoute = async () => {
    if (!route) return;
    await base44.entities.Route.update(route.id, { status: "in_progress", started_at: new Date().toISOString() });
    startLocationSharing();
    loadRoute();
  };

  const startLocationSharing = () => {
    if (!navigator.geolocation) return;
    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const totalStops = (route?.stops || []).length;
        const delivered = (route?.stops || []).filter(s => s.status === "delivered").length;
        const progress = totalStops > 0 ? Math.round((delivered / totalStops) * 100) : 0;

        const existing = await base44.entities.DriverLocation.filter({ driver_email: user.email });
        const data = {
          driver_email: user.email,
          driver_name: user.full_name,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          vehicle_plate: route?.vehicle_plate || "",
          route_id: route?.id || "",
          route_status: route?.status || "",
          route_progress: progress,
          last_update: new Date().toISOString(),
          is_active: true,
        };

        if (existing.length > 0) {
          await base44.entities.DriverLocation.update(existing[0].id, data);
        } else {
          await base44.entities.DriverLocation.create(data);
        }
      });
    };
    sendLocation();
    locationInterval.current = setInterval(sendLocation, 30000);
  };

  const completeRoute = async () => {
    if (!route) return;
    await base44.entities.Route.update(route.id, { status: "completed", completed_at: new Date().toISOString() });
    const existing = await base44.entities.DriverLocation.filter({ driver_email: user.email });
    if (existing.length > 0) {
      await base44.entities.DriverLocation.update(existing[0].id, { is_active: false });
    }
    if (locationInterval.current) clearInterval(locationInterval.current);
    loadRoute();
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center">
        <MapPin className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-1">Sem rota ativa</h2>
        <p className="text-sm text-muted-foreground">Nenhuma rota atribuída para você no momento.</p>
      </div>
    );
  }

  const totalStops = (route.stops || []).length;
  const delivered = (route.stops || []).filter(s => s.status === "delivered").length;
  const progress = totalStops > 0 ? Math.round((delivered / totalStops) * 100) : 0;

  return (
    <div className="p-4 space-y-4">
      {/* Route Header */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg">{route.route_number}</h2>
          <StatusBadge status={route.status} />
        </div>
        <p className="text-sm text-muted-foreground">Veículo: {route.vehicle_plate}</p>
        <p className="text-sm text-muted-foreground">{totalStops} parada(s) • {delivered} entregue(s)</p>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {route.status === "planned" && (
          <Button onClick={startRoute} className="flex-1 h-12">
            <Play className="w-5 h-5 mr-2" /> Iniciar Rota
          </Button>
        )}
        {["started", "in_progress"].includes(route.status) && delivered === totalStops && (
          <Button onClick={completeRoute} className="flex-1 h-12 bg-accent hover:bg-accent/90">
            <CheckCircle2 className="w-5 h-5 mr-2" /> Concluir Rota
          </Button>
        )}
      </div>

      {/* Stops Preview */}
      <div className="space-y-2">
        {(route.stops || []).sort((a, b) => a.sequence - b.sequence).map((stop) => (
          <div key={stop.order_id} className={`p-3 rounded-lg border ${
            stop.status === "delivered" ? "bg-accent/5 border-accent/20" : "bg-card border-border"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {stop.sequence}
                </span>
                <div>
                  <p className="text-sm font-medium">{stop.client_name}</p>
                  <p className="text-xs text-muted-foreground">{stop.address}</p>
                </div>
              </div>
              <StatusBadge status={stop.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}