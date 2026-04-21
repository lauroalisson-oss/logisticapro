import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useCompany } from "@/lib/CompanyContext";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Pencil, Trash2, ShoppingCart, Loader2, Search,
  PlusCircle, MinusCircle, MapPin, AlertCircle, CheckCircle2,
  AlertTriangle, Truck, Users
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function MapFly({ lat, lng }) {
  const map = useMap();
  useEffect(() => { if (lat && lng) map.setView([lat, lng], 15); }, [lat, lng]);
  return null;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendente" },
  { value: "routing", label: "Em Roteirização" },
  { value: "in_transit", label: "Em Trânsito" },
  { value: "delivered", label: "Entregue" },
  { value: "issue", label: "Ocorrência" },
  { value: "cancelled", label: "Cancelado" },
];

const emptyOrder = {
  order_number: "", client_name: "", client_phone: "", address: "",
  latitude: null, longitude: null, delivery_date: "", delivery_window: "full_day",
  priority: "normal", items: [], total_weight_kg: 0, total_volume_m3: 0,
  total_linear_m: 0, status: "pending", notes: "",
  vehicle_id: "", vehicle_plate: "", vehicle_nickname: "",
  driver_id: "", driver_name: "",
};

export default function Orders() {
  const { companyId } = useCompany();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyOrder);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState(null);
  const geocodeTimer = useRef(null);

  useEffect(() => { if (companyId) loadData(); }, [companyId]);

  const loadData = async () => {
    const [o, p, v, u] = await Promise.all([
      base44.entities.Order.filter({ company_id: companyId }),
      base44.entities.Product.filter({ company_id: companyId }),
      base44.entities.Vehicle.filter({ company_id: companyId }),
      base44.entities.User.filter({ company_id: companyId }),
    ]);
    setOrders(o);
    setProducts(p);
    setVehicles(v);
    setDrivers(u.filter(x => x.role === "driver" || x.is_driver || x.driver_pin));
    setLoading(false);
  };

  // ---- Geocoding ----
  const geocodeAddress = async (address) => {
    if (!address || address.length < 8) return;
    setGeocoding(true);
    setGeocodeStatus(null);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&accept-language=pt-BR`;
    const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
    const data = await res.json();
    if (data.length > 0) {
      const { lat, lon } = data[0];
      setForm(f => ({ ...f, latitude: parseFloat(lat), longitude: parseFloat(lon) }));
      setGeocodeStatus("ok");
    } else {
      setGeocodeStatus("error");
    }
    setGeocoding(false);
  };

  const handleAddressChange = (value) => {
    setForm(f => ({ ...f, address: value, latitude: null, longitude: null }));
    setGeocodeStatus(null);
    clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => geocodeAddress(value), 1200);
  };

  // ---- Capacity check ----
  const selectedVehicle = vehicles.find(v => v.id === form.vehicle_id);
  const capacityAlerts = [];
  if (selectedVehicle) {
    const wPct = selectedVehicle.max_weight_kg ? (form.total_weight_kg / selectedVehicle.max_weight_kg) * 100 : 0;
    const vPct = selectedVehicle.max_volume_m3 ? (form.total_volume_m3 / selectedVehicle.max_volume_m3) * 100 : 0;
    const lPct = selectedVehicle.max_linear_m ? (form.total_linear_m / selectedVehicle.max_linear_m) * 100 : 0;
    if (wPct > 100) capacityAlerts.push({ label: "Peso", pct: wPct, current: `${form.total_weight_kg.toFixed(1)} kg`, max: `${selectedVehicle.max_weight_kg} kg` });
    if (vPct > 100) capacityAlerts.push({ label: "Volume", pct: vPct, current: `${form.total_volume_m3.toFixed(3)} m³`, max: `${selectedVehicle.max_volume_m3} m³` });
    if (lPct > 100) capacityAlerts.push({ label: "Metro Linear", pct: lPct, current: `${form.total_linear_m.toFixed(2)} m`, max: `${selectedVehicle.max_linear_m} m` });
  }

  // Max allowed items composition
  const maxComposition = selectedVehicle && (form.items || []).length > 0
    ? (() => {
        const items = form.items.filter(i => i.product_name);
        if (!items.length) return null;
        let maxByWeight = selectedVehicle.max_weight_kg && form.total_weight_kg > 0
          ? Math.floor((selectedVehicle.max_weight_kg / form.total_weight_kg) * items.reduce((s, i) => s + (i.quantity || 0), 0))
          : Infinity;
        let maxByVolume = selectedVehicle.max_volume_m3 && form.total_volume_m3 > 0
          ? Math.floor((selectedVehicle.max_volume_m3 / form.total_volume_m3) * items.reduce((s, i) => s + (i.quantity || 0), 0))
          : Infinity;
        const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
        const limitQty = Math.min(maxByWeight, maxByVolume);
        if (limitQty < totalQty) {
          const factor = limitQty / totalQty;
          return items.map(i => ({ ...i, maxQty: Math.floor(i.quantity * factor) }));
        }
        return null;
      })()
    : null;

  // ---- Items ----
  const calcItemTotals = (items) => {
    let totalWeight = 0, totalVolume = 0, totalLinear = 0;
    items.forEach(item => {
      totalWeight += item.total_weight_kg || 0;
      totalVolume += item.total_volume_m3 || 0;
      totalLinear += item.linear_m || 0;
    });
    return { total_weight_kg: totalWeight, total_volume_m3: totalVolume, total_linear_m: totalLinear };
  };

  const addItem = () => setForm({ ...form, items: [...(form.items || []), { product_id: "", product_name: "", quantity: 1, unit_weight_kg: 0, unit_volume_m3: 0, calc_type: "unit", total_weight_kg: 0, total_volume_m3: 0, linear_m: 0 }] });

  const updateItem = (idx, field, value) => {
    const items = [...(form.items || [])];
    items[idx] = { ...items[idx], [field]: value };
    if (field === "product_id") {
      const product = products.find(p => p.id === value);
      if (product) {
        const vol = product.calc_type === "unit"
          ? (product.height_cm * product.width_cm * product.length_cm) / 1_000_000
          : product.volume_m3 || 0;
        items[idx] = {
          ...items[idx], product_name: product.name,
          unit_weight_kg: product.unit_weight_kg || 0, unit_volume_m3: vol, calc_type: product.calc_type,
          total_weight_kg: (product.unit_weight_kg || 0) * items[idx].quantity,
          total_volume_m3: vol * items[idx].quantity,
          linear_m: product.calc_type === "unit" ? ((product.length_cm || 0) / 100) * items[idx].quantity : 0,
        };
      }
    }
    if (field === "quantity") {
      const qty = parseFloat(value) || 0;
      items[idx].total_weight_kg = items[idx].unit_weight_kg * qty;
      items[idx].total_volume_m3 = items[idx].unit_volume_m3 * qty;
      if (items[idx].calc_type === "unit") {
        const product = products.find(p => p.id === items[idx].product_id);
        items[idx].linear_m = product ? ((product.length_cm || 0) / 100) * qty : 0;
      }
    }
    setForm({ ...form, items, ...calcItemTotals(items) });
  };

  const removeItem = (idx) => {
    const items = [...(form.items || [])];
    items.splice(idx, 1);
    setForm({ ...form, items, ...calcItemTotals(items) });
  };

  // ---- Vehicle / Driver selection ----
  const handleVehicleChange = (id) => {
    const v = vehicles.find(v => v.id === id);
    setForm(f => ({ ...f, vehicle_id: id, vehicle_plate: v?.plate || "", vehicle_nickname: v?.nickname || "" }));
  };

  const handleDriverChange = (id) => {
    const d = drivers.find(d => d.id === id);
    setForm(f => ({ ...f, driver_id: id, driver_name: d?.full_name || "" }));
  };

  // ---- Save ----
  const handleSave = async () => {
    const data = { ...form, company_id: companyId };
    if (!data.order_number) data.order_number = `PED-${Date.now().toString(36).toUpperCase()}`;
    if (editId) await base44.entities.Order.update(editId, data);
    else await base44.entities.Order.create(data);
    setDialogOpen(false);
    setForm(emptyOrder);
    setEditId(null);
    setGeocodeStatus(null);
    loadData();
  };

  const handleEdit = (o) => {
    setForm({ ...emptyOrder, ...o });
    setEditId(o.id);
    setGeocodeStatus(o.latitude ? "ok" : null);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    await base44.entities.Order.delete(id);
    loadData();
  };

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Pedidos" subtitle={`${orders.length} pedidos`}>
        <Button onClick={() => { setForm({ ...emptyOrder, order_number: `PED-${Date.now().toString(36).toUpperCase()}` }); setEditId(null); setGeocodeStatus(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Pedido
        </Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar pedido..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pedido</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Endereço</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Veículo / Motorista</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Peso</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{o.order_number}</td>
                  <td className="px-4 py-3">{o.client_name}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground max-w-[180px] truncate">
                    <span className="flex items-center gap-1">
                      {o.latitude ? <MapPin className="w-3 h-3 text-green-600 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0" />}
                      {o.address}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                    {o.vehicle_plate && <span className="block">🚛 {o.vehicle_nickname || o.vehicle_plate}</span>}
                    {o.driver_name && <span className="block">👤 {o.driver_name}</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">{(o.total_weight_kg || 0).toFixed(1)} kg</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(o.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum pedido encontrado</p>
          </div>
        )}
      </div>

      {/* Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Pedido" : "Novo Pedido"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Nº Pedido</Label><Input value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} /></div>
              <div><Label>Cliente</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Telefone</Label><Input value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} /></div>
              <div>
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status */}
            <div>
              <Label>Status do Pedido</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Vehicle & Driver */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Veículo</Label>
                <Select value={form.vehicle_id || ""} onValueChange={handleVehicleChange}>
                  <SelectTrigger><SelectValue placeholder="Selecionar veículo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Nenhum</SelectItem>
                    {vehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nickname} ({v.plate}) — {v.max_weight_kg} kg
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Motorista</Label>
                <Select value={form.driver_id || ""} onValueChange={handleDriverChange}>
                  <SelectTrigger><SelectValue placeholder="Selecionar motorista..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Nenhum</SelectItem>
                    {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name || d.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Capacity alerts */}
            {selectedVehicle && (form.items || []).length > 0 && (
              <div className={`rounded-xl border p-4 space-y-3 ${capacityAlerts.length > 0 ? "bg-red-50 border-red-300" : "bg-green-50 border-green-200"}`}>
                <p className={`text-sm font-semibold flex items-center gap-2 ${capacityAlerts.length > 0 ? "text-red-700" : "text-green-700"}`}>
                  {capacityAlerts.length > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {capacityAlerts.length > 0 ? "Capacidade excedida!" : "Dentro da capacidade do veículo"}
                </p>

                {/* Capacity bars */}
                <div className="space-y-2">
                  {selectedVehicle.max_weight_kg > 0 && (() => {
                    const pct = Math.min((form.total_weight_kg / selectedVehicle.max_weight_kg) * 100, 100);
                    const over = form.total_weight_kg > selectedVehicle.max_weight_kg;
                    return (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className={over ? "text-red-700 font-medium" : "text-muted-foreground"}>⚖️ Peso: {form.total_weight_kg.toFixed(1)} / {selectedVehicle.max_weight_kg} kg</span>
                          <span className={over ? "text-red-700 font-bold" : "text-muted-foreground"}>{((form.total_weight_kg / selectedVehicle.max_weight_kg) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white">
                          <div className={`h-full rounded-full transition-all ${over ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                  {selectedVehicle.max_volume_m3 > 0 && (() => {
                    const pct = Math.min((form.total_volume_m3 / selectedVehicle.max_volume_m3) * 100, 100);
                    const over = form.total_volume_m3 > selectedVehicle.max_volume_m3;
                    return (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className={over ? "text-red-700 font-medium" : "text-muted-foreground"}>📦 Volume: {form.total_volume_m3.toFixed(3)} / {selectedVehicle.max_volume_m3} m³</span>
                          <span className={over ? "text-red-700 font-bold" : "text-muted-foreground"}>{((form.total_volume_m3 / selectedVehicle.max_volume_m3) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white">
                          <div className={`h-full rounded-full transition-all ${over ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                  {selectedVehicle.max_linear_m > 0 && form.total_linear_m > 0 && (() => {
                    const pct = Math.min((form.total_linear_m / selectedVehicle.max_linear_m) * 100, 100);
                    const over = form.total_linear_m > selectedVehicle.max_linear_m;
                    return (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className={over ? "text-red-700 font-medium" : "text-muted-foreground"}>📏 Linear: {form.total_linear_m.toFixed(2)} / {selectedVehicle.max_linear_m} m</span>
                          <span className={over ? "text-red-700 font-bold" : "text-muted-foreground"}>{((form.total_linear_m / selectedVehicle.max_linear_m) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white">
                          <div className={`h-full rounded-full transition-all ${over ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Max composition suggestion */}
                {maxComposition && (
                  <div className="bg-white/80 rounded-lg p-3 space-y-1 border border-red-200">
                    <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Composição máxima para este veículo:</p>
                    {maxComposition.map((item, i) => (
                      <p key={i} className="text-xs text-red-600">• {item.product_name}: máx. <strong>{item.maxQty}</strong> un (atual: {item.quantity})</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Address */}
            <div className="space-y-2">
              <Label>Endereço Completo</Label>
              <div className="relative">
                <Input
                  value={form.address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="Rua, número, bairro, cidade, estado..."
                  className="pr-9"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {geocoding && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {!geocoding && geocodeStatus === "ok" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  {!geocoding && geocodeStatus === "error" && <AlertCircle className="w-4 h-4 text-orange-500" />}
                </div>
              </div>
              {geocodeStatus === "error" && (
                <p className="text-xs text-orange-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Endereço não encontrado. Seja mais específico (cidade e estado).</p>
              )}
              {geocodeStatus === "ok" && (
                <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Geolocalizado: {form.latitude?.toFixed(5)}, {form.longitude?.toFixed(5)}</p>
              )}
              {form.latitude && form.longitude && (
                <div className="h-44 rounded-lg overflow-hidden border border-border mt-2">
                  <MapContainer center={[form.latitude, form.longitude]} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[form.latitude, form.longitude]} />
                    <MapFly lat={form.latitude} lng={form.longitude} />
                  </MapContainer>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data de Entrega</Label><Input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} /></div>
              <div>
                <Label>Janela</Label>
                <Select value={form.delivery_window} onValueChange={(v) => setForm({ ...form, delivery_window: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Manhã</SelectItem>
                    <SelectItem value="afternoon">Tarde</SelectItem>
                    <SelectItem value="evening">Noite</SelectItem>
                    <SelectItem value="full_day">Dia Inteiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Itens do Pedido</Label>
                <Button variant="outline" size="sm" onClick={addItem}><PlusCircle className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
              </div>
              {(form.items || []).map((item, idx) => (
                <div key={idx} className="p-3 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Produto</Label>
                      <Select value={item.product_id} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">Qtd</Label>
                      <Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-destructive">
                      <MinusCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  {item.product_name && (
                    <p className="text-xs text-muted-foreground">
                      Peso: {(item.total_weight_kg || 0).toFixed(1)} kg | Vol: {(item.total_volume_m3 || 0).toFixed(4)} m³
                      {item.linear_m > 0 ? ` | Linear: ${item.linear_m.toFixed(2)} m` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {(form.items || []).length > 0 && (
              <div className="p-3 bg-primary/5 rounded-lg space-y-1">
                <p className="text-xs font-semibold text-primary">Resumo da Carga</p>
                <p className="text-sm">Peso: {(form.total_weight_kg || 0).toFixed(1)} kg | Volume: {(form.total_volume_m3 || 0).toFixed(4)} m³ | Linear: {(form.total_linear_m || 0).toFixed(2)} m</p>
              </div>
            )}

            <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

            {capacityAlerts.length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-300 rounded-lg text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>A carga excede a capacidade do veículo selecionado. Reduza os itens ou escolha outro veículo.</span>
              </div>
            )}

            <Button onClick={handleSave} className="w-full">Salvar Pedido</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}