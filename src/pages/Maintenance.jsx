import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Wrench, AlertTriangle, CheckCircle2, Clock, Trash2, Pencil, PlusCircle, MinusCircle } from "lucide-react";

const TYPE_LABELS = {
  oil_change: "Troca de Óleo", tire: "Pneu", brake: "Freio",
  filter: "Filtro", belt: "Correia", revision: "Revisão Geral", other: "Outro"
};
const TYPE_ICONS = { oil_change: "🛢️", tire: "🔄", brake: "🛑", filter: "🌀", belt: "⚙️", revision: "🔧", other: "🔩" };
const STATUS_STYLES = {
  scheduled: "bg-blue-50 border-blue-200 text-blue-700",
  done: "bg-green-50 border-green-200 text-green-700",
  overdue: "bg-red-50 border-red-200 text-red-700",
};
const STATUS_LABELS = { scheduled: "Agendada", done: "Realizada", overdue: "Vencida" };

const emptyForm = {
  vehicle_id: "", type: "revision", description: "", status: "scheduled",
  scheduled_date: "", done_date: "", km_at_service: "", next_km: "", next_date: "",
  parts: [], total_cost: "", notes: ""
};

export default function Maintenance() {
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [m, v] = await Promise.all([
      base44.entities.Maintenance.list("-scheduled_date"),
      base44.entities.Vehicle.list(),
    ]);
    // Auto-flag overdue
    const today = new Date().toISOString().split("T")[0];
    const updated = m.map(r => {
      if (r.status === "scheduled") {
        const dateOver = r.scheduled_date && r.scheduled_date < today;
        if (dateOver) return { ...r, status: "overdue" };
      }
      return r;
    });
    setRecords(updated);
    setVehicles(v);
    setLoading(false);
  };

  const addPart = () => setForm(f => ({ ...f, parts: [...(f.parts || []), { name: "", quantity: 1, unit_cost: "" }] }));
  const updatePart = (idx, field, value) => {
    const parts = [...(form.parts || [])];
    parts[idx] = { ...parts[idx], [field]: value };
    const total = parts.reduce((s, p) => s + (parseFloat(p.unit_cost) || 0) * (parseFloat(p.quantity) || 0), 0);
    setForm(f => ({ ...f, parts, total_cost: total.toFixed(2) }));
  };
  const removePart = (idx) => {
    const parts = [...(form.parts || [])];
    parts.splice(idx, 1);
    const total = parts.reduce((s, p) => s + (parseFloat(p.unit_cost) || 0) * (parseFloat(p.quantity) || 0), 0);
    setForm(f => ({ ...f, parts, total_cost: total.toFixed(2) }));
  };

  const handleSave = async () => {
    const v = vehicles.find(v => v.id === form.vehicle_id);
    const data = {
      ...form,
      vehicle_plate: v?.plate || "",
      vehicle_nickname: v?.nickname || "",
      km_at_service: form.km_at_service ? Number(form.km_at_service) : null,
      next_km: form.next_km ? Number(form.next_km) : null,
      total_cost: form.total_cost ? Number(form.total_cost) : null,
    };
    if (editId) await base44.entities.Maintenance.update(editId, data);
    else await base44.entities.Maintenance.create(data);
    setDialogOpen(false);
    setForm(emptyForm);
    setEditId(null);
    loadData();
  };

  const handleEdit = (r) => {
    setForm({ ...r, km_at_service: r.km_at_service ?? "", next_km: r.next_km ?? "", total_cost: r.total_cost ?? "" });
    setEditId(r.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    await base44.entities.Maintenance.delete(id);
    loadData();
  };

  const markDone = async (r) => {
    await base44.entities.Maintenance.update(r.id, { status: "done", done_date: new Date().toISOString().split("T")[0] });
    loadData();
  };

  const filtered = records.filter(r => {
    if (filterVehicle !== "all" && r.vehicle_id !== filterVehicle) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  // Alerts: overdue + upcoming (next 7 days) + next_km close
  const today = new Date().toISOString().split("T")[0];
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const alerts = records.filter(r => r.status !== "done" && (
    r.status === "overdue" ||
    (r.scheduled_date && r.scheduled_date <= in7 && r.scheduled_date >= today) ||
    (r.next_date && r.next_date <= in7)
  ));

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Manutenção Preventiva" subtitle={`${records.length} registros`}>
        <Button onClick={() => { setForm(emptyForm); setEditId(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Manutenção
        </Button>
      </PageHeader>

      {/* Alerts panel */}
      {alerts.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-orange-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {alerts.length} alerta(s) de manutenção
          </p>
          <div className="space-y-1.5">
            {alerts.map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs text-orange-800 bg-white/60 rounded-lg px-3 py-2">
                <span>
                  <span className="font-medium">{a.vehicle_nickname || a.vehicle_plate}</span>
                  {" — "}{TYPE_ICONS[a.type]} {TYPE_LABELS[a.type]}
                  {a.description && ` (${a.description})`}
                </span>
                <span className={`px-2 py-0.5 rounded-full font-medium border ${
                  a.status === "overdue" ? "bg-red-100 border-red-200 text-red-700" : "bg-yellow-100 border-yellow-200 text-yellow-700"
                }`}>
                  {a.status === "overdue" ? "⚠️ Vencida" : `📅 ${new Date(a.scheduled_date).toLocaleDateString("pt-BR")}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="all">Todos os Veículos</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.nickname} ({v.plate})</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="all">Todos os Status</option>
          <option value="scheduled">Agendada</option>
          <option value="done">Realizada</option>
          <option value="overdue">Vencida</option>
        </select>
      </div>

      {/* Records */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-xl">
          <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma manutenção encontrada</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(r => (
          <div key={r.id} className={`bg-card border rounded-xl p-4 space-y-3 ${r.status === "overdue" ? "border-red-300" : "border-border"}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl">{TYPE_ICONS[r.type]}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{TYPE_LABELS[r.type]}</p>
                  <p className="text-xs text-muted-foreground">{r.vehicle_nickname || r.vehicle_plate}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_STYLES[r.status]}`}>
                {STATUS_LABELS[r.status]}
              </span>
            </div>

            {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}

            {/* Dates / KM */}
            <div className="space-y-1 text-xs text-muted-foreground">
              {r.scheduled_date && (
                <p className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Agendado: {new Date(r.scheduled_date).toLocaleDateString("pt-BR")}</p>
              )}
              {r.done_date && (
                <p className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-600" /> Realizado: {new Date(r.done_date).toLocaleDateString("pt-BR")}</p>
              )}
              {r.km_at_service && <p>🔢 KM na manutenção: {r.km_at_service.toLocaleString("pt-BR")}</p>}
              {r.next_km && <p>⏭️ Próxima em: {r.next_km.toLocaleString("pt-BR")} km</p>}
              {r.next_date && <p>📅 Próxima data: {new Date(r.next_date).toLocaleDateString("pt-BR")}</p>}
            </div>

            {/* Parts */}
            {(r.parts || []).length > 0 && (
              <div className="text-xs bg-muted/30 rounded-lg p-2 space-y-0.5">
                <p className="font-medium text-foreground mb-1">Peças trocadas:</p>
                {r.parts.map((p, i) => (
                  <p key={i} className="text-muted-foreground">• {p.name} × {p.quantity}{p.unit_cost ? ` — R$ ${(p.unit_cost * p.quantity).toFixed(2)}` : ""}</p>
                ))}
                {r.total_cost > 0 && <p className="font-semibold text-foreground mt-1 pt-1 border-t border-border">Total: R$ {Number(r.total_cost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {r.status !== "done" && (
                <Button size="sm" variant="outline" className="flex-1 text-green-700 border-green-200 hover:bg-green-50" onClick={() => markDone(r)}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Marcar Feita
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => handleEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Manutenção" : "Nova Manutenção"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Veículo *</Label>
                <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">Selecione...</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.nickname} ({v.plate})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Troca de óleo 5W30, pneu traseiro direito..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Status</Label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="scheduled">Agendada</option>
                  <option value="done">Realizada</option>
                  <option value="overdue">Vencida</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Data Agendada</Label>
                <Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Data Realizada</Label>
                <Input type="date" value={form.done_date} onChange={e => setForm(f => ({ ...f, done_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>KM na Manutenção</Label>
                <Input type="number" placeholder="ex: 85000" value={form.km_at_service} onChange={e => setForm(f => ({ ...f, km_at_service: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Próxima Troca em KM</Label>
                <Input type="number" placeholder="ex: 95000" value={form.next_km} onChange={e => setForm(f => ({ ...f, next_km: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Próxima Troca em Data</Label>
                <Input type="date" value={form.next_date} onChange={e => setForm(f => ({ ...f, next_date: e.target.value }))} />
              </div>
            </div>

            {/* Parts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Peças Trocadas</Label>
                <Button variant="outline" size="sm" onClick={addPart}><PlusCircle className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
              </div>
              {(form.parts || []).map((p, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_36px] gap-2 items-end bg-muted/30 p-2 rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-xs">Peça</Label>
                    <Input placeholder="Nome da peça" value={p.name} onChange={e => updatePart(idx, "name", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qtd</Label>
                    <Input type="number" min="1" value={p.quantity} onChange={e => updatePart(idx, "quantity", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Custo Unit. (R$)</Label>
                    <Input type="number" placeholder="0.00" value={p.unit_cost} onChange={e => updatePart(idx, "unit_cost", e.target.value)} />
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removePart(idx)}><MinusCircle className="w-4 h-4" /></Button>
                </div>
              ))}
              {(form.parts || []).length > 0 && (
                <div className="text-right text-sm font-semibold">
                  Total: R$ {Number(form.total_cost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observações adicionais..." />
            </div>

            <Button onClick={handleSave} className="w-full" disabled={!form.vehicle_id}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}