import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import { Loader2, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import moment from "moment";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function Tracking() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocations();
    const interval = setInterval(loadLocations, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLocations = async () => {
    const locs = await base44.entities.DriverLocation.filter({ is_active: true });
    setLocations(locs);
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Rastreamento em Tempo Real" subtitle={`${locations.length} motorista(s) ativo(s)`}>
        <Button variant="outline" onClick={loadLocations}>
          <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden">
          <div className="h-[500px]">
            <MapContainer
              center={locations.length > 0 ? [locations[0].latitude, locations[0].longitude] : [-23.55, -46.63]}
              zoom={11}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {locations.map((loc) => (
                <Marker key={loc.id} position={[loc.latitude, loc.longitude]}>
                  <Popup>
                    <div className="space-y-1">
                      <strong>{loc.driver_name}</strong><br />
                      <span className="text-xs">Veículo: {loc.vehicle_plate}</span><br />
                      <span className="text-xs">Progresso: {loc.route_progress || 0}%</span><br />
                      <span className="text-xs">Atualizado: {loc.last_update ? moment(loc.last_update).fromNow() : "—"}</span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* List */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Motoristas Ativos
          </h3>
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum motorista ativo</p>
          ) : (
            <div className="space-y-3">
              {locations.map(loc => (
                <div key={loc.id} className="p-3 border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{loc.driver_name}</p>
                    <span className="text-xs text-muted-foreground">{loc.vehicle_plate}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progresso: {loc.route_progress || 0}%</span>
                    <StatusBadge status={loc.route_status || "in_progress"} />
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${loc.route_progress || 0}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Última atualização: {loc.last_update ? moment(loc.last_update).fromNow() : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}