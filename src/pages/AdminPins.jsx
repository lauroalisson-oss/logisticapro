import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, Copy, CheckCircle2, Loader2, Plus, Ban, AlertCircle, Clock, User, Building2 } from "lucide-react";
import { PIN_DURATIONS, generateAccessPin } from "@/lib/platformAdmin";

const STATUS_COLOR = {
  available: "bg-green-100 text-green-700 border-green-200",
  redeemed: "bg-blue-100 text-blue-700 border-blue-200",
  expired: "bg-gray-100 text-gray-600 border-gray-200",
};
const STATUS_LABEL = {
  available: "Disponível",
  redeemed: "Resgatado",
  expired: "Invalidado",
};

export default function AdminPins() {
  const { user } = useAuth();
  const [pins, setPins] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ duration_days: 30, label: "", assigned_company_email: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [lastGenerated, setLastGenerated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [p, c] = await Promise.all([
      base44.entities.AccessPin.list("-created_date"),
      base44.entities.Company.list(),
    ]);
    setPins(p);
    setCompanies(c);
    setLoading(false);
  };

  const companyByEmail = (email) =>
    companies.find(c => c.owner_email?.toLowerCase() === (email || "").toLowerCase());

  const handleGenerate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      // Retry a few times in the unlikely event of a collision.
      let pin;
      for (let i = 0; i < 5; i++) {
        const candidate = generateAccessPin(8);
        const existing = await base44.entities.AccessPin.filter({ pin: candidate });
        if (existing.length === 0) { pin = candidate; break; }
      }
      if (!pin) throw new Error("Não foi possível gerar um PIN único. Tente novamente.");

      const created = await base44.entities.AccessPin.create({
        pin,
        duration_days: Number(form.duration_days),
        label: form.label || "",
        assigned_company_email: form.assigned_company_email.trim().toLowerCase() || "",
        generated_by_email: user?.email || "",
        status: "available",
      });
      setLastGenerated(created);
      setForm({ duration_days: 30, label: "", assigned_company_email: "" });
      setShowForm(false);
      await loadData();
    } catch (err) {
      setFormError(err?.message || "Falha ao gerar PIN.");
    } finally {
      setSaving(false);
    }
  };

  const handleInvalidate = async (pin) => {
    if (!confirm(`Invalidar o PIN ${pin.pin}? Essa ação não pode ser desfeita.`)) return;
    try {
      await base44.entities.AccessPin.update(pin.id, { status: "expired" });
      await loadData();
    } catch (err) {
      alert(err?.message || "Falha ao invalidar PIN.");
    }
  };

  const copyPin = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(false), 2000);
  };

  const filtered = pins.filter(p => filter === "all" || p.status === filter);

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="PINs de Acesso" subtitle={`${pins.length} PIN(s) no sistema`}>
        <Button onClick={() => { setShowForm(true); setFormError(""); setLastGenerated(null); }}>
          <Plus className="w-4 h-4 mr-2" /> Gerar novo PIN
        </Button>
      </PageHeader>

      {lastGenerated && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-700" />
            <p className="font-semibold text-green-900">PIN gerado com sucesso</p>
          </div>
          <div className="bg-white border border-green-200 rounded-lg p-4 flex items-center justify-between gap-3">
            <p className="text-3xl font-mono font-bold tracking-widest text-primary">{lastGenerated.pin}</p>
            <Button variant="outline" size="sm" onClick={() => copyPin(lastGenerated.pin)}>
              {copied === lastGenerated.pin ? <><CheckCircle2 className="w-4 h-4 mr-1.5 text-green-600" /> Copiado</> : <><Copy className="w-4 h-4 mr-1.5" /> Copiar</>}
            </Button>
          </div>
          <p className="text-xs text-green-800">
            Válido por {lastGenerated.duration_days} dias após o resgate.
            {lastGenerated.assigned_company_email ? ` Só pode ser usado por ${lastGenerated.assigned_company_email}.` : " Qualquer empresa pode resgatá-lo."}
          </p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> Gerar novo PIN</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <Label>Duração *</Label>
                <select
                  value={form.duration_days}
                  onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {PIN_DURATIONS.map(d => (
                    <option key={d.days} value={d.days}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Descrição <span className="text-muted-foreground">(opcional)</span></Label>
                <Input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Ex: Cliente XYZ, renovação anual..."
                />
              </div>
              <div>
                <Label>Email autorizado <span className="text-muted-foreground">(opcional)</span></Label>
                <Input
                  type="email"
                  value={form.assigned_company_email}
                  onChange={e => setForm(f => ({ ...f, assigned_company_email: e.target.value }))}
                  placeholder="Deixe vazio para liberar a qualquer empresa"
                />
                <p className="text-xs text-muted-foreground mt-1">Se preenchido, só a empresa com esse email de dono conseguirá resgatar o PIN.</p>
              </div>

              {formError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                {saving ? "Gerando..." : "Gerar PIN"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
        {["all", "available", "redeemed", "expired"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {f === "all" ? "Todos" : STATUS_LABEL[f]} ({f === "all" ? pins.length : pins.filter(p => p.status === f).length})
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {filtered.map(p => {
          const assignedCompany = p.assigned_company_email ? companyByEmail(p.assigned_company_email) : null;
          const redeemedCompany = p.redeemed_by_company_id ? companies.find(c => c.id === p.redeemed_by_company_id) : null;
          return (
            <div key={p.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xl font-mono font-bold tracking-widest">{p.pin}</p>
                  {p.label && <p className="text-xs text-muted-foreground mt-0.5">{p.label}</p>}
                </div>
                <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded border ${STATUS_COLOR[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Duração: {p.duration_days} dias</p>
                {p.assigned_company_email && (
                  <p className="flex items-center gap-1.5"><User className="w-3 h-3" /> Reservado para: {p.assigned_company_email}
                    {assignedCompany && <span className="text-foreground font-medium">({assignedCompany.name})</span>}
                  </p>
                )}
                {p.status === "redeemed" && (
                  <>
                    <p className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Usado por: {redeemedCompany?.name || redeemedCompany?.owner_email || "—"}</p>
                    <p>Em: {p.redeemed_at ? new Date(p.redeemed_at).toLocaleString("pt-BR") : "—"}</p>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                {p.status === "available" && (
                  <>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => copyPin(p.pin)}>
                      {copied === p.pin ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Copiar</>}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleInvalidate(p)} className="text-destructive hover:bg-destructive/10">
                      <Ban className="w-3.5 h-3.5 mr-1" /> Invalidar
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum PIN nessa categoria</p>
        </div>
      )}
    </div>
  );
}
