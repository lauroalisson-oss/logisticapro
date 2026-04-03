import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Loader2, Search, UserCircle, Plus, Key, Copy, CheckCircle2, X } from "lucide-react";

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function Drivers() {
  const [users, setUsers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [newPin, setNewPin] = useState(null);
  const [copiedPin, setCopiedPin] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [u, r] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Route.list(),
    ]);
    setUsers(u);
    setRoutes(r);
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!form.email) return;
    setSaving(true);
    const pin = generatePin();
    await base44.users.inviteUser(form.email, "driver");
    // Update user with PIN and phone after a brief delay (user is created by invite)
    setTimeout(async () => {
      const all = await base44.entities.User.list();
      const invited = all.find(u => u.email === form.email);
      if (invited) {
        await base44.entities.User.update(invited.id, { driver_pin: pin, phone: form.phone });
      }
      await loadData();
    }, 2000);
    setNewPin(pin);
    setSaving(false);
  };

  const regeneratePin = async (driver) => {
    const pin = generatePin();
    await base44.entities.User.update(driver.id, { driver_pin: pin });
    setNewPin(pin);
    await loadData();
  };

  const copyPin = (pin) => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const drivers = users.filter(u => u.role === "driver");
  const filtered = drivers.filter(d =>
    !search || d.full_name?.toLowerCase().includes(search.toLowerCase()) || d.email?.toLowerCase().includes(search.toLowerCase())
  );
  const getDriverRoutes = (email) => routes.filter(r => r.driver_email === email);
  const getActiveRoute = (email) => routes.find(r => r.driver_email === email && ["started", "in_progress"].includes(r.status));

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Motoristas" subtitle={`${drivers.length} motoristas`}>
        <Button onClick={() => { setShowForm(true); setNewPin(null); setForm({ email: "", full_name: "", phone: "" }); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Cadastrar Motorista
        </Button>
      </PageHeader>

      {/* Cadastro Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Cadastrar Motorista</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!newPin ? (
              <>
                <div className="space-y-3">
                  <div>
                    <Label>E-mail *</Label>
                    <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="motorista@empresa.com" type="email" />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  Um convite será enviado para o e-mail e um PIN de acesso será gerado automaticamente para o app do motorista.
                </p>
                <Button onClick={handleInvite} disabled={!form.email || saving} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                  {saving ? "Cadastrando..." : "Cadastrar e Gerar PIN"}
                </Button>
              </>
            ) : (
              <div className="space-y-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold">Motorista cadastrado!</p>
                  <p className="text-sm text-muted-foreground mt-1">Compartilhe o PIN abaixo com o motorista para acesso ao app.</p>
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">PIN de Acesso</p>
                  <p className="text-4xl font-mono font-bold tracking-widest text-primary">{newPin}</p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => copyPin(newPin)}>
                  {copiedPin ? <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copiedPin ? "Copiado!" : "Copiar PIN"}
                </Button>
                <Button className="w-full" onClick={() => { setShowForm(false); setNewPin(null); }}>Concluir</Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar motorista..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(d => {
          const driverRoutes = getDriverRoutes(d.email);
          const activeRoute = getActiveRoute(d.email);
          const completed = driverRoutes.filter(r => r.status === "completed").length;

          return (
            <div key={d.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCircle className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{d.full_name || d.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.email}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                {d.phone && <p>Tel: {d.phone}</p>}
                <p>Rotas concluídas: {completed} / {driverRoutes.length}</p>
              </div>

              {/* PIN display */}
              <div className="mt-3 flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">PIN</p>
                  <p className="font-mono font-bold text-sm tracking-widest">
                    {d.driver_pin ? d.driver_pin : <span className="text-muted-foreground italic text-xs">não gerado</span>}
                  </p>
                </div>
                <button onClick={() => { regeneratePin(d); }} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Key className="w-3 h-3" /> Gerar novo
                </button>
              </div>

              {activeRoute && (
                <div className="mt-2 p-2 bg-primary/5 rounded-lg">
                  <p className="text-xs font-medium text-primary">🚛 Rota ativa: {activeRoute.route_number}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum motorista cadastrado</p>
          <p className="text-xs mt-1">Clique em "Cadastrar Motorista" para adicionar</p>
        </div>
      )}

      {/* Regenerated PIN modal */}
      {newPin && !showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 space-y-4 text-center shadow-xl">
            <p className="font-bold">Novo PIN gerado</p>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <p className="text-4xl font-mono font-bold tracking-widest text-primary">{newPin}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => copyPin(newPin)}>
              {copiedPin ? "Copiado!" : <><Copy className="w-4 h-4 mr-2" />Copiar PIN</>}
            </Button>
            <Button className="w-full" onClick={() => setNewPin(null)}>Fechar</Button>
          </div>
        </div>
      )}
    </div>
  );
}