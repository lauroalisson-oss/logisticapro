import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import StatusBadge from "../../components/shared/StatusBadge";
import OdometerCamera from "../../components/driver/OdometerCamera";
import DriverPinLogin from "./DriverPinLogin";
import { Button } from "@/components/ui/button";
import { Loader2, Play, CheckCircle2, MapPin, Navigation } from "lucide-react";

export default function DriverRoute() {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [pinVerified, setPinVerified] = useState(false);
  const [showKmDeparture, setShowKmDeparture] = useState(false);
  const [showKmArrival, setShowKmArrival] = useState(false);
  const [kmDeparturePhoto, setKmDeparturePhoto] = useState(null);
  const [kmArrivalPhoto, setKmArrivalPhoto] = useState(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsError, setGpsError] = useState("");
  // Refs mirror the latest route/user so the watch callback never reads stale state.
  const routeRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    const verified = sessionStorage.getItem("driver_pin_verified") === "1";
    setPinVerified(verified);
    if (verified) loadRoute();
    else setLoading(false);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  const handlePinSuccess = () => {
    setPinVerified(true);
    setLoading(true);
    loadRoute();
  };

  const loadRoute = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const routes = await base44.entities.Route.filter({ driver_email: me.email });
    const active = routes.find(r => ["planned", "started", "in_progress"].includes(r.status));
    setRoute(active || null);
    if (active?.km_departure_photo) setKmDeparturePhoto(active.km_departure_photo);
    if (active?.km_arrival_photo) setKmArrivalPhoto(active.km_arrival_photo);
    setLoading(false);
  };

  // Ref to store the watchPosition ID so we can clear it later
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        // Re-acquire wake lock if released (e.g. tab becomes visible again)
        document.addEventListener("visibilitychange", async () => {
          if (document.visibilityState === "visible" && wakeLockRef.current === null) {
            wakeLockRef.current = await navigator.wakeLock.request("screen").catch(() => null);
          }
        });
      }
    } catch (e) {
      console.warn("WakeLock não disponível:", e);
    }
  };

  const activateGPS = () => {
    if (!navigator.geolocation) {
      setGpsError("GPS não suportado neste dispositivo.");
      return;
    }
    setGpsActive(true);
    setGpsError("");

    // Keep screen on so GPS continues in background
    requestWakeLock();

    const handlePosition = async (pos) => {
      try {
        const r = routeRef.current;
        const u = userRef.current;
        if (!u?.email) return;
        const deliveryStops = (r?.stops || []).filter(s => !s._isDeparture);
        const delivered = deliveryStops.filter(s => s.status === "delivered").length;
        const progress = deliveryStops.length > 0 ? Math.round((delivered / deliveryStops.length) * 100) : 0;
        const existing = await base44.entities.DriverLocation.filter({ driver_email: u.email });
        const data = {
          company_id: u.company_id || "",
          driver_email: u.email,
          driver_name: u.full_name,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          vehicle_plate: r?.vehicle_plate || "",
          route_id: r?.id || "",
          route_status: r?.status || "",
          route_progress: progress,
          last_update: new Date().toISOString(),
          is_active: true,
        };
        if (existing.length > 0) {
          await base44.entities.DriverLocation.update(existing[0].id, data);
        } else {
          await base44.entities.DriverLocation.create(data);
        }
        setGpsError(""); // Clear any previous error on success
      } catch (err) {
        console.error("Falha ao enviar localização:", err);
      }
    };

    const handleError = (err) => {
      setGpsError(`Erro de GPS: ${err.message}. Verifique as permissões.`);
      // Don't stop watching — retry on next position event
    };

    // watchPosition continuously tracks location — works even when screen dims
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  };

  const handleStartRoute = async () => {
    if (!route) return;
    // Must take departure photo first
    setShowKmDeparture(true);
  };

  const confirmDeparture = async () => {
    if (!kmDeparturePhoto) return;
    await base44.entities.Route.update(route.id, {
      status: "in_progress",
      started_at: new Date().toISOString(),
      km_departure_photo: kmDeparturePhoto,
    });
    // Auto-activate GPS
    activateGPS();
    setShowKmDeparture(false);
    loadRoute();
  };

  const handleCompleteRoute = () => {
    setShowKmArrival(true);
  };

  const confirmArrival = async () => {
    if (!kmArrivalPhoto) return;
    await base44.entities.Route.update(route.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      km_arrival_photo: kmArrivalPhoto,
    });
    const existing = await base44.entities.DriverLocation.filter({ driver_email: user.email });
    if (existing.length > 0) {
      await base44.entities.DriverLocation.update(existing[0].id, { is_active: false });
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setGpsActive(false);
    setShowKmArrival(false);
    loadRoute();
  };

  if (!pinVerified) return <DriverPinLogin onSuccess={handlePinSuccess} />;
  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  // --- KM Departure Modal ---
  if (showKmDeparture) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 p-4 space-y-5 overflow-auto">
          <div className="pt-4">
            <h2 className="text-xl font-bold">Registro de Saída</h2>
            <p className="text-sm text-muted-foreground mt-1">Fotografe o hodômetro do veículo antes de iniciar a rota.</p>
          </div>
          <OdometerCamera
            label="Foto do Hodômetro — Saída"
            onCapture={setKmDeparturePhoto}
            existingUrl={kmDeparturePhoto}
          />
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            📍 O GPS será ativado automaticamente ao confirmar a saída.
          </div>
        </div>
        <div className="p-4 border-t border-border flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setShowKmDeparture(false)}>Cancelar</Button>
          <Button className="flex-1 h-12" disabled={!kmDeparturePhoto} onClick={confirmDeparture}>
            <Navigation className="w-5 h-5 mr-2" /> Iniciar Rota
          </Button>
        </div>
      </div>
    );
  }

  // --- KM Arrival Modal ---
  if (showKmArrival) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 p-4 space-y-5 overflow-auto">
          <div className="pt-4">
            <h2 className="text-xl font-bold">Registro de Chegada</h2>
            <p className="text-sm text-muted-foreground mt-1">Fotografe o hodômetro ao finalizar a rota.</p>
          </div>
          <OdometerCamera
            label="Foto do Hodômetro — Chegada"
            onCapture={setKmArrivalPhoto}
            existingUrl={kmArrivalPhoto}
          />
        </div>
        <div className="p-4 border-t border-border flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setShowKmArrival(false)}>Cancelar</Button>
          <Button className="flex-1 h-12 bg-accent hover:bg-accent/90" disabled={!kmArrivalPhoto} onClick={confirmArrival}>
            <CheckCircle2 className="w-5 h-5 mr-2" /> Concluir Rota
          </Button>
        </div>
      </div>
    );
  }

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

        {/* GPS indicator */}
        {gpsActive && !gpsError && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            GPS ativo — localização sendo compartilhada
          </div>
        )}
        {gpsError && (
          <div className="mt-2 text-xs text-destructive font-medium">
            ⚠ {gpsError}
          </div>
        )}

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

      {/* KM photos status */}
      {(route.km_departure_photo || route.km_arrival_photo) && (
        <div className="grid grid-cols-2 gap-3">
          {route.km_departure_photo && (
            <div className="rounded-xl overflow-hidden border border-border relative">
              <img src={route.km_departure_photo} alt="Saída" className="w-full h-24 object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 font-medium">📷 Saída</div>
            </div>
          )}
          {route.km_arrival_photo && (
            <div className="rounded-xl overflow-hidden border border-border relative">
              <img src={route.km_arrival_photo} alt="Chegada" className="w-full h-24 object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 font-medium">📷 Chegada</div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {route.status === "planned" && (
          <Button onClick={handleStartRoute} className="flex-1 h-12">
            <Play className="w-5 h-5 mr-2" /> Iniciar Rota
          </Button>
        )}
        {["started", "in_progress"].includes(route.status) && delivered === totalStops && totalStops > 0 && (
          <Button onClick={handleCompleteRoute} className="flex-1 h-12 bg-accent hover:bg-accent/90">
            <CheckCircle2 className="w-5 h-5 mr-2" /> Concluir Rota
          </Button>
        )}
      </div>

      {/* Stops Preview */}
      <div className="space-y-2">
        {[...(route.stops || [])].sort((a, b) => a.sequence - b.sequence).map((stop) => (
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