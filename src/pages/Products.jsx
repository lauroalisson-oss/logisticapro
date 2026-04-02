import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Package, Loader2, Search, Box, Droplets } from "lucide-react";

const emptyProduct = {
  name: "", internal_code: "", category: "", calc_type: "unit", unit_weight_kg: 0,
  height_cm: 0, width_cm: 0, length_cm: 0, volume_m3: 0, weight_per_m3: 0, sale_unit: "", notes: ""
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyProduct);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    const data = await base44.entities.Product.list();
    setProducts(data);
    setLoading(false);
  };

  const calcVolume = (f) => {
    if (f.calc_type === "unit" && f.height_cm && f.width_cm && f.length_cm) {
      return (f.height_cm * f.width_cm * f.length_cm) / 1_000_000;
    }
    return f.volume_m3 || 0;
  };

  const handleSave = async () => {
    const data = { ...form };
    if (data.calc_type === "unit") {
      data.volume_m3 = calcVolume(data);
    }
    if (editId) {
      await base44.entities.Product.update(editId, data);
    } else {
      await base44.entities.Product.create(data);
    }
    setDialogOpen(false);
    setForm(emptyProduct);
    setEditId(null);
    loadProducts();
  };

  const handleEdit = (p) => {
    setForm({ ...p });
    setEditId(p.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    await base44.entities.Product.delete(id);
    loadProducts();
  };

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.internal_code?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || p.calc_type === filterType;
    return matchSearch && matchType;
  });

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Produtos" subtitle={`${products.length} produtos cadastrados`}>
        <Button onClick={() => { setForm(emptyProduct); setEditId(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Produto
        </Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Tipos</SelectItem>
            <SelectItem value="unit">Unitário</SelectItem>
            <SelectItem value="bulk">Granel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(p => (
          <div key={p.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${p.calc_type === "bulk" ? "bg-chart-2/10" : "bg-primary/10"}`}>
                  {p.calc_type === "bulk" ? <Droplets className="w-5 h-5 text-chart-2" /> : <Box className="w-5 h-5 text-primary" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.internal_code || "Sem código"}</p>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                p.calc_type === "bulk" ? "bg-chart-2/10 text-chart-2" : "bg-primary/10 text-primary"
              }`}>
                {p.calc_type === "bulk" ? "Granel" : "Unitário"}
              </span>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground mb-4">
              {p.category && <p>Categoria: {p.category}</p>}
              <p>Peso: {p.unit_weight_kg} kg</p>
              {p.calc_type === "unit" && p.height_cm > 0 && (
                <p>Dim: {p.height_cm}×{p.width_cm}×{p.length_cm} cm | Vol: {calcVolume(p).toFixed(4)} m³</p>
              )}
              {p.calc_type === "bulk" && (
                <p>Vol: {p.volume_m3} m³ | Peso/m³: {p.weight_per_m3} kg</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleEdit(p)} className="flex-1">
                <Pencil className="w-3 h-3 mr-1" /> Editar
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDelete(p.id)} className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum produto encontrado</p>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Código Interno</Label><Input value={form.internal_code} onChange={(e) => setForm({ ...form, internal_code: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              <div>
                <Label>Tipo de Cálculo</Label>
                <Select value={form.calc_type} onValueChange={(v) => setForm({ ...form, calc_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unit">Unitário / Embalado</SelectItem>
                    <SelectItem value="bulk">Granel / Volumétrico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div><Label>Peso Unitário (kg)</Label><Input type="number" value={form.unit_weight_kg} onChange={(e) => setForm({ ...form, unit_weight_kg: parseFloat(e.target.value) || 0 })} /></div>

            {form.calc_type === "unit" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground uppercase">Dimensões do Produto</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Altura (cm)</Label><Input type="number" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Largura (cm)</Label><Input type="number" value={form.width_cm} onChange={(e) => setForm({ ...form, width_cm: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Comprimento (cm)</Label><Input type="number" value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                {form.height_cm > 0 && form.width_cm > 0 && form.length_cm > 0 && (
                  <p className="text-xs text-primary font-medium">Volume calculado: {calcVolume(form).toFixed(4)} m³</p>
                )}
              </div>
            )}

            {form.calc_type === "bulk" && (
              <div className="space-y-4 p-4 bg-chart-2/5 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground uppercase">Dados Volumétricos</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Unidade de Venda</Label><Input value={form.sale_unit} onChange={(e) => setForm({ ...form, sale_unit: e.target.value })} placeholder="ex: m³, ton" /></div>
                  <div><Label>Volume (m³)</Label><Input type="number" value={form.volume_m3} onChange={(e) => setForm({ ...form, volume_m3: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <div><Label>Peso por m³ (kg)</Label><Input type="number" value={form.weight_per_m3} onChange={(e) => setForm({ ...form, weight_per_m3: parseFloat(e.target.value) || 0 })} /></div>
              </div>
            )}

            <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <Button onClick={handleSave} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}