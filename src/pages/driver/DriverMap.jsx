import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, MapPin } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { parseGeometry, formatDuration, haversineKm } from "@/lib/routing";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom blue dot icon for driver location
const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;background:#1d6ef5;border:3px solid white;border-radius:50%;box-shadow:0 0 0 3px rgba(29,110,245,0.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Component that re-centers the map when position changes
function CenterOnDriver({ position }) {
  const map = useMap();
  const centered = useRef(false);
  useEffect(() => {
    if (position && !centered.current) {
      map.setView(position, 14);
      centered.current = true;
    }
  }, [position, map]);
  return null;
}

export default function DriverMap() {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [driverPos, setDriverPos] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const watchIdRef = useRef(null);

  useEffect(() => {
    loadRoute();
    startGPS();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const loadRoute = async () => {
    const me = await base44.auth.me();
    const routes = await base44.entities.Route.filter({ driver_email: me.email });
    const active = routes.find(r => ["planned", "started", "in_progress"].includes(r.status));
    setRoute(active || null);
    setLoading(false);
  };

  const startGPS = () => {
    if (!navigator.geolocation) {
      setGpsError("GPS não disponível neste dispositivo.");
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverPos([pos.coords.latitude, pos.coords.longitude]);
        setGpsError("");
      },
      (err) => setGpsError(`GPS: ${err.message}`),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!route || !route.stops?.length) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-muted-foreground">
        <p>Nenhuma rota para exibir no mapa</p>
      </div>
    );
  }

  const stops = [...route.stops]
    .filter(s => s.latitude && s.longitude)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  // Default center: driver position, or first stop
  const defaultCenter = driverPos || (stops.length > 0 ? [stops[0].latitude, stops[0].longitude] : [-23.55, -46.63]);

  const geometry = parseGeometry(route.route_geometry);
  const hasRealGeometry = Array.isArray(geometry) && geometry.length > 1;

  // Next stop = first non-departure delivery stop still pending/en_route
  const nextStop = stops.find(s => !s._isDeparture && s.status !== "delivered" && s.status !== "not_delivered");

  // Distance to the next stop:
  //  - with GPS: straight-line haversine from current driver position
  //  - without GPS: leave blank (we don't have a fixed origin to measure from)
  const distanceToNextKm = nextStop && driverPos
    ? haversineKm(driverPos[0], driverPos[1], nextStop.latitude, nextStop.longitude)
    : null;

  // Remaining duration estimate: if we have a geometry-based total, scale it
  // by share of remaining stops; otherwise use the persisted total directly.
  const totalDurationMin = route.estimated_duration_min ?? route.estimated_time_min ?? null;
  const remainingDeliveries = stops.filter(s => !s._isDeparture && s.status !== "delivered" && s.status !== "not_delivered").length;
  const totalDeliveries = stops.filter(s => !s._isDeparture).length;
  const remainingMin = totalDurationMin && totalDeliveries
    ? Math.round((totalDurationMin * remainingDeliveries) / totalDeliveries)
    : totalDurationMin;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* GPS status bar */}
      <div className={`px-4 py-2 text-xs font-medium flex items-center gap-2 ${gpsError ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
        {gpsError ? (
          <span>⚠ {gpsError}</span>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            {driverPos ? "Sua localização ativa" : "Obtendo localização..."}
          </>
        )}
      </div>

      {/* Next stop banner */}
      {nextStop && (
        <div className="px-4 py-3 bg-primary/5 border-b border-primary/10">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Próxima parada</p>
              <p className="text-sm font-semibold truncate">#{nextStop.sequence} {nextStop.client_name}</p>
              <p className="text-xs text-muted-foreground truncate">{nextStop.address}</p>
              <div className="flex items-center gap-3 mt-1 text-xs">
                {distanceToNextKm != null && (
                  <span className="text-primary font-medium">🛣️ {distanceToNextKm.toFixed(1)} km</span>
                )}
                {remainingMin != null && (
                  <span className="text-muted-foreground">⏱️ ~{formatDuration(remainingMin)} restantes</span>
                )}
                {distanceToNextKm == null && remainingMin == null && route.total_distance_km != null && (
                  <span className="text-muted-foreground">🛣️ Rota: {route.total_distance_km} km</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1">
        <MapContainer center={defaultCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {/* Auto-center map on first GPS fix */}
          <CenterOnDriver position={driverPos} />

          {/* Driver current location */}
          {driverPos && (
            <>
              <Marker position={driverPos} icon={driverIcon}>
                <Popup><strong>📍 Você está aqui</strong></Popup>
              </Marker>
              <Circle
                center={driverPos}
                radius={40}
                pathOptions={{ color: "#1d6ef5", fillColor: "#1d6ef5", fillOpacity: 0.12, weight: 1 }}
              />
            </>
          )}

          {/* Route stops */}
          {stops.map((stop, idx) => (
            <Marker key={stop.order_id || idx} position={[stop.latitude, stop.longitude]}>
              <Popup>
                {stop._isDeparture ? (
                  <strong>🏭 Ponto de Partida</strong>
                ) : (
                  <>
                    <strong>#{stop.sequence} {stop.client_name}</strong><br />
                    {stop.address}<br />
                    <span className="text-xs capitalize">{stop.status}</span>
                  </>
                )}
              </Popup>
            </Marker>
          ))}

          {/* Route line — real road geometry when persisted, straight fallback otherwise */}
          {hasRealGeometry ? (
            <Polyline
              positions={geometry}
              color="hsl(213,94%,45%)"
              weight={4}
              opacity={0.85}
            />
          ) : (
            stops.length > 1 && (
              <Polyline
                positions={stops.map(s => [s.latitude, s.longitude])}
                color="hsl(213,94%,45%)"
                weight={3}
                dashArray="8"
              />
            )
          )}
        </MapContainer>
      </div>
    </div>
  );
}