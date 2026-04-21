import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, Search, Key, Copy, CheckCircle2, Clock, AlertTriangle, Plus } from "lucide-react";
import { PIN_DURATIONS, generateAccessPin, daysRemaining } from "@/lib/platformAdmin";

const STATUS_META = {
  pending_pin: { label: "Aguardando PIN", color: "bg-amber-100 text-amber-800 border-amber-200" },
  active:      { label: "Ativa",         color: "bg-green-100 text-green-800 border-green-200" },
  expired:     { label: "Expirada",      color: "bg-red-100 text-red-800 border-red-200" },
  suspended:   { label: "Suspensa",      color: "bg-gray-200 text-gray-700 border-gray-300" },
};

function effectiveStatus(company) {
  if (!company?.status) return "pending_pin";
  if (company.status === "active") {
    const rem = daysRemaining(company.access_expires_at);
    if (rem === null || rem <= 0) return "expired";
  }
  return company.status;
}

export default function AdminCompanies() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [renewFor, setRenewFor] = useState(null);
  const [renewDuration, setRenewDuration] = useState(30);
  const [renewing, setRenewing] = useState(false);
  const [lastPin, setLastPin] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [c, p] = await Promise.all([
      base44.entities.Company.list("-created_date"),
      base44.entities.AccessPin.list("-created_date"),
    ]);
    setCompanies(c);
    setPins(p);
    setLoading(false);
  };

  const countPinsFor = (email) => {
    const e = (email || "").toLowerCase();
    return pins.filter(p =>
      p.status === "redeemed" &&
      ((p.redeemed_by_company_id && companies.find(c => c.id === p.redeemed_by_company_id)?.owner_email?.toLowerCase() === e) ||
       (p.assigned_company_email?.toLowerCase() === e))
    ).length;
  };

  const generateRenewal = async (company) => {
    setRenewing(true);
    setError("");
    try {
      let pin;
      for (let i = 0; i < 5; i++) {
        const candidate = generateAccessPin(8);
        const existing = await base44.entities.AccessPin.filter({ pin: candidate });
        if (existing.length === 0) { pin = candidate; break; }
      }
      if (!pin) throw new Error("Não foi possível gerar um PIN único.");

      const created = await base44.entities.AccessPin.create({
        pin,
        duration_days: Number(renewDuration),
        label: `Renovação: ${company.name}`,
        assigned_company_email: (company.owner_email || "").toLowerCase(),
        generated_by_email: user?.email || "",
        status: "available",
      });
      setLastPin(created);
      setRenewFor(null);
      await loadData();
    } catch (err) {
      setError(err?.message || "Falha ao gerar PIN de renovação.");
    } finally {
      setRenewing(false);
    }
  };

  const copy = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(false), 2000);
  };

  const filtered = companies.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.owner_email?.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj?.includes(search)
  );

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Empresas" subtitle={`${companies.length} empresa(s) cadastrada(s)`} />

      {lastPin && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-700" />
            <p className="font-semibold text-green-900">PIN de renovação gerado</p>
          </div>
          <div className="bg-white border border-green-200 rounded-lg p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-3xl font-mono font-bold tracking-widest text-primary">{lastPin.pin}</p>
              <p className="text-xs text-green-800 mt-1">
                {lastPin.duration_days} dias · reservado para {lastPin.assigned_company_email}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => copy(lastPin.pin)}>
              {copied === lastPin.pin ? <><CheckCircle2 className="w-4 h-4 mr-1.5 text-green-600" /> Copiado</> : <><Copy className="w-4 h-4 mr-1.5" /> Copiar</>}
            </Button>
          </div>
          <p className="text-xs text-green-800">Envie este PIN para a empresa. Após o resgate, o acesso é estendido automaticamente.</p>
          <button onClick={() => setLastPin(null)} className="text-xs text-green-700 hover:underline">Fechar</button>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou CNPJ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {filtered.map(c => {
          const status = effectiveStatus(c);
          const meta = STATUS_META[status];
          const rem = daysRemaining(c.access_expires_at);
          const remaining = rem === null ? null : Math.max(0, Math.ceil(rem));
          return (
            <div key={c.id} className="bg-card rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.owner_email}</p>
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded border flex-shrink-0 ${meta.color}`}>
                  {meta.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-[10px] uppercase tracking-wide">Plano</p>
                  <p className="font-semibold text-foreground capitalize">{c.plan || "starter"}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-[10px] uppercase tracking-wide">PINs usados</p>
                  <p className="font-semibold text-foreground">{countPinsFor(c.owner_email)}</p>
                </div>
              </div>

              {status === "active" && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${remaining <= 5 ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-muted/40 text-muted-foreground"}`}>
                  {remaining <= 5 ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  <span>
                    {remaining === 0 ? "Expira hoje" : `Expira em ${remaining} dia(s)`}
                    {c.access_expires_at && ` — ${new Date(c.access_expires_at).toLocaleDateString("pt-BR")}`}
                  </span>
                </div>
              )}
              {status === "expired" && c.access_expires_at && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800">
                  <AlertTriangle className="w-3.5 h-3.5" /> Expirou em {new Date(c.access_expires_at).toLocaleDateString("pt-BR")}
                </div>
              )}
              {c.last_pin_used && (
                <p className="text-[11px] text-muted-foreground">Último PIN: <span className="font-mono">{c.last_pin_used}</span></p>
              )}

              <Button
                variant={status === "active" && remaining > 5 ? "outline" : "default"}
                size="sm"
                className="w-full"
                onClick={() => { setRenewFor(c); setRenewDuration(30); setError(""); }}
              >
                <Key className="w-3.5 h-3.5 mr-1.5" />
                {status === "pending_pin" ? "Gerar PIN de ativação" :
                 status === "expired" ? "Gerar PIN de reativação" :
                 "Gerar PIN de renovação"}
              </Button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma empresa encontrada</p>
        </div>
      )}

      {/* Renewal modal */}
      {renewFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 space-y-5 shadow-xl">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2"><Plus className="w-5 h-5 text-primary" /> Novo PIN</h2>
              <p className="text-sm text-muted-foreground mt-1">para <strong>{renewFor.name}</strong> ({renewFor.owner_email})</p>
            </div>
            <div>
              <Label>Duração *</Label>
              <select
                value={renewDuration}
                onChange={e => setRenewDuration(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PIN_DURATIONS.map(d => (
                  <option key={d.days} value={d.days}>{d.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-2">
                Após o resgate, o prazo é somado aos dias restantes. Se já está expirado, conta a partir de agora.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRenewFor(null)} disabled={renewing}>Cancelar</Button>
              <Button className="flex-1" onClick={() => generateRenewal(renewFor)} disabled={renewing}>
                {renewing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                {renewing ? "Gerando..." : "Gerar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
