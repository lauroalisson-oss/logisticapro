import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import StatusBadge from "../../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Navigation } from "lucide-react";

export default function DriverStops() {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [notes, setNotes] = useState("");

  useEffect(() => { loadRoute(); }, []);

  const loadRoute = async () => {
    const me = await base44.auth.me();
    const routes = await base44.entities.Route.filter({ driver_email: me.email });
    const active = routes.find(r => ["started", "in_progress"].includes(r.status));
    setRoute(active || null);
    setLoading(false);
  };

  const updateStopStatus = async (stopIdx, status) => {
    if (!route) return;
    const stops = [...(route.stops || [])];
    stops[stopIdx] = {
      ...stops[stopIdx],
      status,
      delivery_notes: notes || stops[stopIdx].delivery_notes,
      delivered_at: status === "delivered" ? new Date().toISOString() : stops[stopIdx].delivered_at,
    };
    await base44.entities.Route.update(route.id, { stops });
    setDialogOpen(false);
    setNotes("");
    setSelectedStop(null);
    loadRoute();
  };

  const openNavigate = (stop) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`;
    window.open(url, "_blank");
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center">
        <p className="text-muted-foreground">Nenhuma rota ativa</p>
      </div>
    );
  }

  const stops = (route.stops || []).sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-bold text-lg mb-2">Paradas — {route.route_number}</h2>

      {stops.map((stop, idx) => (
        <div key={stop.order_id} className={`p-4 rounded-xl border ${
          stop.status === "delivered" ? "bg-accent/5 border-accent/20" :
          stop.status === "not_delivered" || stop.status === "issue" ? "bg-destructive/5 border-destructive/20" :
          "bg-card border-border"
        }`}>
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                {stop.sequence}
              </span>
              <div>
                <p className="font-semibold text-sm">{stop.client_name}</p>
                <p className="text-xs text-muted-foreground">{stop.order_number}</p>
              </div>
            </div>
            <StatusBadge status={stop.status} />
          </div>

          <p className="text-xs text-muted-foreground mb-3">{stop.address}</p>

          {stop.status === "pending" || stop.status === "en_route" ? (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" variant="outline" onClick={() => openNavigate(stop)}>
                <Navigation className="w-3.5 h-3.5 mr-1" /> Navegar
              </Button>
              <Button size="sm" className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => updateStopStatus(idx, "delivered")}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Entregue
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSelectedStop(idx); setDialogOpen(true); }} className="text-destructive">
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : null}

          {stop.delivery_notes && (
            <p className="text-xs text-muted-foreground mt-2 italic">📝 {stop.delivery_notes}</p>
          )}
        </div>
      ))}

      {/* Issue Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Ocorrência</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Descreva a ocorrência..." /></div>
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" onClick={() => updateStopStatus(selectedStop, "not_delivered")}>
                Não Entregue
              </Button>
              <Button className="flex-1" variant="destructive" onClick={() => updateStopStatus(selectedStop, "issue")}>
                <AlertTriangle className="w-4 h-4 mr-1" /> Ocorrência
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}