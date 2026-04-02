import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function DriverMap() {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadRoute(); }, []);

  const loadRoute = async () => {
    const me = await base44.auth.me();
    const routes = await base44.entities.Route.filter({ driver_email: me.email });
    const active = routes.find(r => ["planned", "started", "in_progress"].includes(r.status));
    setRoute(active || null);
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!route || !route.stops?.length) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-muted-foreground">
        <p>Nenhuma rota para exibir no mapa</p>
      </div>
    );
  }

  const stops = route.stops.sort((a, b) => a.sequence - b.sequence);
  const center = [stops[0].latitude, stops[0].longitude];

  return (
    <div className="h-[calc(100vh-8rem)]">
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {stops.map((stop) => (
          <Marker key={stop.order_id} position={[stop.latitude, stop.longitude]}>
            <Popup>
              <strong>#{stop.sequence} {stop.client_name}</strong><br />
              {stop.address}<br />
              <span className="text-xs capitalize">{stop.status}</span>
            </Popup>
          </Marker>
        ))}
        {stops.length > 1 && (
          <Polyline positions={stops.map(s => [s.latitude, s.longitude])} color="hsl(213,94%,45%)" weight={3} dashArray="8" />
        )}
      </MapContainer>
    </div>
  );
}