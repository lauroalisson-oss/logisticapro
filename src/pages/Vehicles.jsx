import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Truck, Loader2, Search } from "lucide-react";

const vehicleTypes = {
  van: "Van", truck_small: "Caminhão Pequeno", truck_medium: "Caminhão Médio",
  truck_large: "Caminhão Grande", motorcycle: "Moto", car: "Carro"
};

const emptyVehicle = {
  plate: "", nickname: "", vehicle_type: "van", driver_id: "", driver_name: "",
  status: "available", max_weight_kg: 0, max_volume_m3: 0, max_linear_m: 0, notes: ""
};

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyVehicle);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => { loadVehicles(); }, []);

  const loadVehicles = async () => {
    const data = await base44.entities.Vehicle.list();
    setVehicles(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (editId) {
      await base44.entities.Vehicle.update(editId, form);
    } else {
      await base44.entities.Vehicle.create(form);
    }
    setDialogOpen(false);
    setForm(emptyVehicle);
    setEditId(null);
    loadVehicles();
  };

  const handleEdit = (v) => {
    setForm({ ...v });
    setEditId(v.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    await base44.entities.Vehicle.delete(id);
    loadVehicles();
  };

  const filtered = vehicles.filter(v => {
    const matchSearch = !search || v.plate?.toLowerCase().includes(search.toLowerCase()) ||
      v.nickname?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || v.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Veículos" subtitle={`${vehicles.length} veículos cadastrados`}>
        <Button onClick={() => { setForm(emptyVehicle); setEditId(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Veículo
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por placa ou nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="on_route">Em Rota</SelectItem>
            <SelectItem value="maintenance">Manutenção</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(v => (
          <div key={v.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{v.nickname}</p>
                  <p className="text-xs text-muted-foreground">{v.plate}</p>
                </div>
              </div>
              <StatusBadge status={v.status} />
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
              <p>Tipo: {vehicleTypes[v.vehicle_type] || v.vehicle_type}</p>
              {v.driver_name && <p>Motorista: {v.driver_name}</p>}
              <p>Peso: {v.max_weight_kg} kg | Vol: {v.max_volume_m3} m³ {v.max_linear_m ? `| Lin: ${v.max_linear_m} m` : ""}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleEdit(v)} className="flex-1">
                <Pencil className="w-3 h-3 mr-1" /> Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDelete(v.id)} className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum veículo encontrado</p>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Placa</Label><Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} /></div>
              <div><Label>Nome/Apelido</Label><Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(vehicleTypes).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Disponível</SelectItem>
                    <SelectItem value="on_route">Em Rota</SelectItem>
                    <SelectItem value="maintenance">Manutenção</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Motorista</Label><Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Peso Máx (kg)</Label><Input type="number" value={form.max_weight_kg} onChange={(e) => setForm({ ...form, max_weight_kg: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Volume Máx (m³)</Label><Input type="number" value={form.max_volume_m3} onChange={(e) => setForm({ ...form, max_volume_m3: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Linear Máx (m)</Label><Input type="number" value={form.max_linear_m} onChange={(e) => setForm({ ...form, max_linear_m: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <Button onClick={handleSave} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}