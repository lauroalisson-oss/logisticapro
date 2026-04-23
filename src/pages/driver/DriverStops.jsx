import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import StatusBadge from "../../components/shared/StatusBadge";
import DeliveryProof from "../../components/driver/DeliveryProof";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Navigation, Phone, Package, ChevronDown, ChevronUp } from "lucide-react";

export default function DriverStops() {
  const [route, setRoute] = useState(null);
  const [orders, setOrders] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedStops, setExpandedStops] = useState({});

  useEffect(() => { loadRoute(); }, []);

  const loadRoute = async () => {
    const me = await base44.auth.me();
    const routes = await base44.entities.Route.filter({ driver_email: me.email });
    const active = routes.find(r => ["started", "in_progress"].includes(r.status));
    setRoute(active || null);

    // Load order details for items/client info
    if (active?.stops?.length) {
      const orderIds = active.stops.map(s => s.order_id).filter(Boolean);
      const orderMap = {};
      await Promise.all(orderIds.map(async (id) => {
        try {
          const list = await base44.entities.Order.filter({ id });
          if (list[0]) orderMap[id] = list[0];
        } catch {}
      }));
      setOrders(orderMap);
    }
    setLoading(false);
  };

  const updateStopStatus = async (stopIdx, status, proof = null) => {
    if (!route) return;
    setSaving(true);
    const stops = [...(route.stops || [])];
    const targetStop = stops[stopIdx];
    stops[stopIdx] = {
      ...targetStop,
      status,
      delivery_notes: notes || targetStop.delivery_notes,
      delivered_at: status === "delivered" ? new Date().toISOString() : targetStop.delivered_at,
      proof_url: proof?.photoUrl || targetStop.proof_url,
      signature_url: proof?.signatureData || targetStop.signature_url,
    };
    try {
      await base44.entities.Route.update(route.id, { stops });
      if (targetStop?.order_id) {
        const orderStatus = status === "delivered" ? "delivered" : status === "not_delivered" ? "not_delivered" : status === "issue" ? "issue" : null;
        if (orderStatus) {
          await base44.entities.Order.update(targetStop.order_id, {
            status: orderStatus,
            delivered_at: status === "delivered" ? new Date().toISOString() : undefined,
            delivery_notes: notes || undefined,
          });
        }
      }
    } catch (err) {
      console.error("Falha ao atualizar parada:", err);
      alert("Erro ao salvar. Verifique sua conexão.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setDialogOpen(false);
    setProofOpen(false);
    setNotes("");
    setSelectedStop(null);
    loadRoute();
  };

  const openNavigate = (stop) => {
    const url = stop.latitude && stop.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`;
    window.open(url, "_blank");
  };

  const toggleExpand = (orderId) => {
    setExpandedStops(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center">
        <p className="text-muted-foreground">Nenhuma rota ativa</p>
      </div>
    );
  }

  const stops = [...(route.stops || [])].sort((a, b) => a.sequence - b.sequence);
  const delivered = stops.filter(s => s.status === "delivered").length;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-lg">Paradas — {route.route_number}</h2>
        <span className="text-sm text-muted-foreground">{delivered}/{stops.length} entregues</span>
      </div>

      {stops.map((stop, idx) => {
        const order = orders[stop.order_id];
        const isExpanded = expandedStops[stop.order_id];
        const isDone = ["delivered", "not_delivered", "issue"].includes(stop.status);

        return (
          <div key={stop.order_id || idx} className={`rounded-xl border overflow-hidden ${
            stop.status === "delivered" ? "bg-accent/5 border-accent/30" :
            stop.status === "not_delivered" || stop.status === "issue" ? "bg-destructive/5 border-destructive/20" :
            "bg-card border-border"
          }`}>
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                    stop.status === "delivered" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
                  }`}>
                    {stop.sequence}
                  </span>
                  <div>
                    <p className="font-semibold text-sm">{stop.client_name}</p>
                    <p className="text-xs text-muted-foreground">{stop.order_number}</p>
                  </div>
                </div>
                <StatusBadge status={stop.status} />
              </div>

              <p className="text-xs text-muted-foreground mb-3 pl-9">{stop.address}</p>

              {/* Client phone */}
              {order?.client_phone && (
                <a
                  href={`tel:${order.client_phone.replace(/\D/g, "")}`}
                  className="flex items-center gap-1.5 text-xs text-primary font-medium pl-9 mb-3 hover:underline w-fit"
                >
                  <Phone className="w-3.5 h-3.5" /> {order.client_phone}
                </a>
              )}

              {/* Items summary + expand */}
              {order?.items?.length > 0 && (
                <button
                  onClick={() => toggleExpand(stop.order_id)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground pl-9 mb-3 hover:text-foreground transition-colors"
                >
                  <Package className="w-3.5 h-3.5" />
                  {order.items.length} ite{order.items.length > 1 ? "ns" : "m"}
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Expanded items list */}
              {isExpanded && order?.items?.length > 0 && (
                <div className="ml-9 mb-3 space-y-1 bg-muted/30 rounded-lg p-2">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-foreground font-medium">{item.product_name}</span>
                      <span className="text-muted-foreground ml-2 flex-shrink-0">x{item.quantity}</span>
                    </div>
                  ))}
                  {order.notes && (
                    <p className="text-xs text-amber-700 mt-1 pt-1 border-t border-border">📝 {order.notes}</p>
                  )}
                </div>
              )}

              {/* Delivery proof thumbnails */}
              {(stop.proof_url || stop.signature_url) && (
                <div className="flex gap-2 ml-9 mb-3">
                  {stop.proof_url && (
                    <div className="relative rounded-lg overflow-hidden border border-border w-20 h-16">
                      <img src={stop.proof_url} alt="Foto" className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5">foto</div>
                    </div>
                  )}
                  {stop.signature_url && (
                    <div className="relative rounded-lg overflow-hidden border border-border w-20 h-16 bg-white">
                      <img src={stop.signature_url} alt="Assinatura" className="w-full h-full object-contain" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5">assinatura</div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {stop.delivery_notes && (
                <p className="text-xs text-muted-foreground ml-9 mb-3 italic">📝 {stop.delivery_notes}</p>
              )}

              {/* Actions */}
              {!isDone && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openNavigate(stop)}>
                    <Navigation className="w-3.5 h-3.5 mr-1" /> Navegar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                    onClick={() => { setSelectedStop(idx); setProofOpen(true); }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Entregar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => { setSelectedStop(idx); setDialogOpen(true); }}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Proof of Delivery Dialog */}
      <Dialog open={proofOpen} onOpenChange={setProofOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar Entrega</DialogTitle>
          </DialogHeader>
          {selectedStop !== null && stops[selectedStop] && (
            <div className="space-y-3">
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <p className="font-semibold">{stops[selectedStop].client_name}</p>
                <p className="text-xs text-muted-foreground">{stops[selectedStop].address}</p>
              </div>
              <div>
                <Label className="text-xs">Observações (opcional)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: entregue ao porteiro..." rows={2} className="text-sm" />
              </div>
              <DeliveryProof
                uploading={saving}
                onConfirm={(proof) => updateStopStatus(selectedStop, "delivered", proof)}
                onCancel={() => { setProofOpen(false); setNotes(""); }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Issue Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Ocorrência</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Descreva a ocorrência..." /></div>
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" disabled={saving} onClick={() => updateStopStatus(selectedStop, "not_delivered")}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Não Entregue"}
              </Button>
              <Button className="flex-1" variant="destructive" disabled={saving} onClick={() => updateStopStatus(selectedStop, "issue")}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><AlertTriangle className="w-4 h-4 mr-1" /> Ocorrência</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}