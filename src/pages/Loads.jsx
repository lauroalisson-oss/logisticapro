import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import CapacityBar from "../components/shared/CapacityBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, BoxSelect, Loader2, Trash2, Truck, AlertTriangle } from "lucide-react";

export default function Loads() {
  const [loads, setLoads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [l, o, v] = await Promise.all([
      base44.entities.Load.list(),
      base44.entities.Order.list(),
      base44.entities.Vehicle.list(),
    ]);
    setLoads(l);
    setOrders(o);
    setVehicles(v);
    setLoading(false);
  };

  const pendingOrders = orders.filter(o => o.status === "pending");
  const availableVehicles = vehicles.filter(v => v.status === "available");

  const calcLoadTotals = () => {
    const selected = pendingOrders.filter(o => selectedOrders.includes(o.id));
    return {
      weight: selected.reduce((sum, o) => sum + (o.total_weight_kg || 0), 0),
      volume: selected.reduce((sum, o) => sum + (o.total_volume_m3 || 0), 0),
      linear: selected.reduce((sum, o) => sum + (o.total_linear_m || 0), 0),
    };
  };

  const getVehicle = () => vehicles.find(v => v.id === selectedVehicle);

  const handleToggleOrder = (orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const getSuggestedVehicle = () => {
    const totals = calcLoadTotals();
    return availableVehicles
      .filter(v => v.max_weight_kg >= totals.weight && v.max_volume_m3 >= totals.volume)
      .sort((a, b) => a.max_weight_kg - b.max_weight_kg)[0];
  };

  const handleCreate = async () => {
    const vehicle = getVehicle();
    if (!vehicle || selectedOrders.length === 0) return;
    const totals = calcLoadTotals();

    const load = {
      load_number: `CRG-${Date.now().toString(36).toUpperCase()}`,
      vehicle_id: vehicle.id,
      vehicle_plate: vehicle.plate,
      vehicle_nickname: vehicle.nickname,
      driver_id: vehicle.driver_id || "",
      driver_name: vehicle.driver_name || "",
      order_ids: selectedOrders,
      total_weight_kg: totals.weight,
      total_volume_m3: totals.volume,
      total_linear_m: totals.linear,
      vehicle_max_weight: vehicle.max_weight_kg,
      vehicle_max_volume: vehicle.max_volume_m3,
      vehicle_max_linear: vehicle.max_linear_m || 0,
      weight_percent: vehicle.max_weight_kg > 0 ? (totals.weight / vehicle.max_weight_kg) * 100 : 0,
      volume_percent: vehicle.max_volume_m3 > 0 ? (totals.volume / vehicle.max_volume_m3) * 100 : 0,
      linear_percent: vehicle.max_linear_m > 0 ? (totals.linear / vehicle.max_linear_m) * 100 : 0,
      status: "assembling",
      date: new Date().toISOString().split("T")[0],
    };

    await base44.entities.Load.create(load);

    for (const oid of selectedOrders) {
      await base44.entities.Order.update(oid, { status: "routing" });
    }

    setDialogOpen(false);
    setSelectedOrders([]);
    setSelectedVehicle("");
    loadData();
  };

  const handleDelete = async (id) => {
    const load = loads.find(l => l.id === id);
    if (load?.order_ids) {
      for (const oid of load.order_ids) {
        await base44.entities.Order.update(oid, { status: "pending" });
      }
    }
    await base44.entities.Load.delete(id);
    loadData();
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const totals = calcLoadTotals();
  const vehicle = getVehicle();
  const isOverWeight = vehicle && totals.weight > vehicle.max_weight_kg;
  const isOverVolume = vehicle && totals.volume > vehicle.max_volume_m3;
  const isOverLinear = vehicle && vehicle.max_linear_m > 0 && totals.linear > vehicle.max_linear_m;
  const isOverLimit = isOverWeight || isOverVolume || isOverLinear;

  return (
    <div className="space-y-6">
      <PageHeader title="Cargas" subtitle={`${loads.length} cargas`}>
        <Button onClick={() => { setSelectedOrders([]); setSelectedVehicle(""); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Montar Carga
        </Button>
      </PageHeader>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loads.map(l => (
          <div key={l.id} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-sm">{l.load_number}</p>
                <p className="text-xs text-muted-foreground">{l.vehicle_nickname} ({l.vehicle_plate})</p>
              </div>
              <StatusBadge status={l.status} />
            </div>
            <div className="space-y-2 mb-4">
              <CapacityBar label="Peso" current={l.total_weight_kg || 0} max={l.vehicle_max_weight || 1} unit="kg" />
              <CapacityBar label="Volume" current={l.total_volume_m3 || 0} max={l.vehicle_max_volume || 1} unit="m³" />
              {l.vehicle_max_linear > 0 && (
                <CapacityBar label="Linear" current={l.total_linear_m || 0} max={l.vehicle_max_linear} unit="m" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">{(l.order_ids || []).length} pedido(s)</p>
            <Button variant="outline" size="sm" onClick={() => handleDelete(l.id)} className="text-destructive hover:bg-destructive/10 w-full">
              <Trash2 className="w-3 h-3 mr-1" /> Remover
            </Button>
          </div>
        ))}
      </div>

      {loads.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BoxSelect className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma carga montada</p>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Montar Nova Carga</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Selecione os Pedidos Pendentes</Label>
              {pendingOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-2">Nenhum pedido pendente</p>
              ) : (
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {pendingOrders.map(o => (
                    <label key={o.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                      <Checkbox checked={selectedOrders.includes(o.id)} onCheckedChange={() => handleToggleOrder(o.id)} />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{o.order_number}</span>
                        <span className="text-xs text-muted-foreground ml-2">{o.client_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {(o.total_weight_kg || 0).toFixed(1)}kg | {(o.total_volume_m3 || 0).toFixed(3)}m³
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Veículo</Label>
                {selectedOrders.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => {
                    const suggested = getSuggestedVehicle();
                    if (suggested) setSelectedVehicle(suggested.id);
                  }}>
                    Sugerir melhor veículo
                  </Button>
                )}
              </div>
              <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um veículo..." /></SelectTrigger>
                <SelectContent>
                  {availableVehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nickname} ({v.plate}) — {v.max_weight_kg}kg / {v.max_volume_m3}m³
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOrders.length > 0 && vehicle && (
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Simulação de Carga</p>
                <CapacityBar label="Peso" current={totals.weight} max={vehicle.max_weight_kg} unit="kg" />
                <CapacityBar label="Volume" current={totals.volume} max={vehicle.max_volume_m3} unit="m³" />
                {vehicle.max_linear_m > 0 && (
                  <CapacityBar label="Linear" current={totals.linear} max={vehicle.max_linear_m} unit="m" />
                )}
                {isOverLimit && (
                  <div className="flex items-center gap-2 text-destructive text-sm p-2 bg-destructive/10 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Carga excede a capacidade do veículo!</span>
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleCreate} className="w-full" disabled={selectedOrders.length === 0 || !selectedVehicle}>
              {isOverLimit ? "⚠ Criar Carga (Excedida)" : "Criar Carga"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}