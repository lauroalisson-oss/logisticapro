import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useCompany } from "@/lib/CompanyContext";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Info, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import moment from "moment";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const stopIcon = (color) => L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:50%;border:2.5px solid white;background:${color};box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const DEVIATION_THRESHOLD_KM = 0.8; // km — distance from planned route to flag a GPS point as deviated

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Minimum distance from a point to any stop in the planned route
function minDistToRoute(lat, lon, stops) {
  let min = Infinity;
  for (const s of stops) {
    if (s.latitude && s.longitude) {
      const d = haversineKm(lat, lon, s.latitude, s.longitude);
      if (d < min) min = d;
    }
  }
  return min;
}

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
    }
  }, [JSON.stringify(positions)]);
  return null;
}

export default function RouteComparisonView() {
  const { companyId } = useCompany();
  const [routes, setRoutes] = useState([]);
  const [gpsHistory, setGpsHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));

  const loadData = async () => {
    setLoading(true);
    const [allRoutes, allLocations] = await Promise.all([
      base44.entities.Route.filter({ company_id: companyId }),
      base44.entities.DriverLocation.filter({ company_id: companyId }),
    ]);

    // Filter routes by selected date (use route.date or started_at)
    const filtered = allRoutes.filter(r => {
      const d = r.date || r.started_at?.slice(0, 10);
      return d === dateFilter && ["started", "in_progress", "completed"].includes(r.status);
    });

    setRoutes(filtered);
    setGpsHistory(allLocations);
    if (filtered.length > 0 && !selectedRoute) setSelectedRoute(filtered[0].id);
    setLoading(false);
  };

  useEffect(() => { if (companyId) loadData(); }, [companyId, dateFilter]);

  const route = routes.find(r => r.id === selectedRoute);

  // For the selected route, get the GPS location record of the driver
  const driverLoc = route ? gpsHistory.find(l => l.driver_email === route.driver_email) : null;

  // Planned stops with coordinates
  const plannedStops = (route?.stops || []).filter(s => s.latitude && s.longitude).sort((a, b) => a.sequence - b.sequence);
  const plannedPolyline = plannedStops.map(s => [s.latitude, s.longitude]);

  // Simulated "real GPS path" — use delivered stops re-ordered by delivered_at timestamp
  // This represents actual sequence the driver visited stops, which may differ from plan
  const deliveredStops = plannedStops
    .filter(s => s.delivered_at)
    .sort((a, b) => new Date(a.delivered_at) - new Date(b.delivered_at));
  const realPolyline = deliveredStops.map(s => [s.latitude, s.longitude]);

  // Add current driver position if available and route is active
  if (driverLoc?.latitude && route && ["started", "in_progress"].includes(route.status)) {
    realPolyline.push([driverLoc.latitude, driverLoc.longitude]);
  }

  // Detect divergences: delivered stops whose sequence differs from planned order
  const divergences = deliveredStops
    .map((stop, visitedIdx) => {
      const plannedIdx = plannedStops.findIndex(s => s.order_id === stop.order_id);
      const distToNearest = minDistToRoute(stop.latitude, stop.longitude, plannedStops);
      const sequenceDeviation = Math.abs(visitedIdx - plannedIdx);
      return {
        ...stop,
        plannedSeq: plannedIdx + 1,
        visitedSeq: visitedIdx + 1,
        sequenceDeviation,
        distToNearest,
        isDivergent: sequenceDeviation > 1 || distToNearest > DEVIATION_THRESHOLD_KM,
      };
    })
    .filter(s => s.isDivergent);

  const allPositions = [...plannedPolyline, ...realPolyline];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Data</label>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {routes.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Rota</label>
            <select
              value={selectedRoute || ""}
              onChange={e => setSelectedRoute(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {routes.map(r => (
                <option key={r.id} value={r.id}>{r.route_number} — {r.driver_name}</option>
              ))}
            </select>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={loadData} className="mb-0.5" title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      )}

      {!loading && routes.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
          <MapPin className="w-10 h-10 opacity-25" />
          <p className="text-sm">Nenhuma rota encontrada para esta data.</p>
        </div>
      )}

      {!loading && route && (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Map */}
          <div className="lg:col-span-2 rounded-xl overflow-hidden border h-[420px]">
            <MapContainer center={[-23.55, -46.63]} zoom={11} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              {allPositions.length > 0 && <FitBounds positions={allPositions} />}

              {/* Planned route — dashed blue */}
              {plannedPolyline.length > 1 && (
                <Polyline positions={plannedPolyline} color="#3b82f6" weight={3} dashArray="10 6" opacity={0.7} />
              )}

              {/* Real GPS path — solid orange */}
              {realPolyline.length > 1 && (
                <Polyline positions={realPolyline} color="#f97316" weight={3} opacity={0.85} />
              )}

              {/* Planned stop markers */}
              {plannedStops.map((stop, i) => (
                <Marker key={`p-${i}`} position={[stop.latitude, stop.longitude]} icon={stopIcon("#3b82f6")}>
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[160px]">
                      <p className="font-semibold">#{stop.sequence} {stop.client_name}</p>
                      <p className="text-gray-500">{stop.address}</p>
                      <p>Status: <span className="font-medium">{stop.status}</span></p>
                      {stop.delivered_at && <p>Entregue: {moment(stop.delivered_at).format("HH:mm")}</p>}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Divergence highlights */}
              {divergences.map((stop, i) => (
                <Circle
                  key={`div-${i}`}
                  center={[stop.latitude, stop.longitude]}
                  radius={400}
                  pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.15, weight: 2 }}
                />
              ))}

              {/* Live driver position */}
              {driverLoc?.latitude && (
                <Marker
                  position={[driverLoc.latitude, driverLoc.longitude]}
                  icon={L.divIcon({
                    className: "",
                    html: `<div style="background:#1d6dc4;border:3px solid white;border-radius:8px;padding:3px 6px;color:white;font-size:10px;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,0.4);">🚚 ${route.vehicle_plate || "?"}</div>`,
                    iconSize: [80, 28],
                    iconAnchor: [40, 14],
                  })}
                  zIndexOffset={1000}
                >
                  <Popup>
                    <p className="text-xs font-semibold">{route.driver_name}</p>
                    <p className="text-xs text-gray-500">Posição ao vivo</p>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          {/* Analysis panel */}
          <div className="space-y-3">
            {/* Route summary */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{route.route_number}</p>
                  <p className="text-xs text-muted-foreground">{route.driver_name} • {route.vehicle_plate}</p>
                </div>
                <StatusBadge status={route.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                  <p className="text-xs text-blue-600">Paradas planejadas</p>
                  <p className="text-2xl font-bold text-blue-700">{plannedStops.length}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                  <p className="text-xs text-orange-600">Entregues (GPS)</p>
                  <p className="text-2xl font-bold text-orange-700">{deliveredStops.length}</p>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Legenda</p>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 border-t-2 border-dashed border-blue-500 flex-shrink-0" />
                <span>Rota planejada</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 border-t-2 border-orange-500 flex-shrink-0" />
                <span>Trajeto real (GPS)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 rounded-full bg-red-500/20 border-2 border-red-500 flex-shrink-0" />
                <span>Ponto de divergência</span>
              </div>
            </div>

            {/* Divergences list */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Divergências ({divergences.length})
              </p>
              {divergences.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-green-600 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Sem divergências detectadas
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {divergences.map((s, i) => (
                    <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs space-y-0.5">
                      <p className="font-semibold text-red-700">{s.client_name}</p>
                      <p className="text-muted-foreground truncate">{s.address}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-blue-600">Seq. planejada: <strong>#{s.plannedSeq}</strong></span>
                        <span className="text-orange-600">Visitada: <strong>#{s.visitedSeq}</strong></span>
                      </div>
                      {s.sequenceDeviation > 1 && (
                        <p className="text-red-600 flex items-center gap-1">
                          <Info className="w-3 h-3" /> Ordem alterada ({s.sequenceDeviation} posição{s.sequenceDeviation > 1 ? "ões" : ""})
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}