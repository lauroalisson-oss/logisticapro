import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Loader2, Search, UserCircle, Plus, Key, Copy, CheckCircle2, X, AlertCircle, Clock, Trash2 } from "lucide-react";

function generatePin() {
  // Cryptographically secure 6-digit PIN. Uses rejection sampling over a
  // 0..9_999_999 window so the modulo bias common to Math.random() is avoided.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const max = 1_000_000;
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let n;
    do {
      crypto.getRandomValues(buf);
      n = buf[0];
    } while (n >= limit);
    return String(n % max).padStart(6, "0");
  }
  // Fallback for environments without WebCrypto.
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Pending invites live in localStorage because the base44 User record is
// only materialized after the invitee accepts the invite and logs in for
// the first time. Keeping the form data here lets us finish the
// registration (is_driver, role, CPF, CNH, ...) automatically on the next
// page load once the user shows up in User.list().
const PENDING_KEY = "logisticapro:pending_driver_invites";

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePending(map) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(map));
  } catch {
    // Storage full/disabled — non-fatal for this flow.
  }
}

function savePending(email, data) {
  const map = readPending();
  map[email.toLowerCase()] = { ...data, email, created_at: new Date().toISOString() };
  writePending(map);
}

function removePending(email) {
  const map = readPending();
  delete map[email.toLowerCase()];
  writePending(map);
}

function buildDriverPayload(form) {
  // Strips empty strings so we don't overwrite fields the base44 account
  // already carries (e.g. a full_name set by the invitee on first login).
  const payload = {
    is_driver: true,
    role: "driver",
  };
  if (form.full_name) payload.full_name = form.full_name;
  if (form.phone) payload.phone = form.phone;
  if (form.cpf) payload.cpf = form.cpf;
  if (form.license_number) payload.license_number = form.license_number;
  if (form.license_category) payload.license_category = form.license_category;
  if (form.license_points !== "" && form.license_points != null) {
    payload.license_points = Number(form.license_points);
  }
  return payload;
}

export default function Drivers() {
  const [users, setUsers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", phone: "", cpf: "", license_number: "", license_category: "", license_points: "" });
  const [saving, setSaving] = useState(false);
  const [newPin, setNewPin] = useState(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteInfo, setInviteInfo] = useState("");
  const [pending, setPending] = useState({});
  const [justMaterialized, setJustMaterialized] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [u, r] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Route.list(),
    ]);
    // Try to finish any pending invite whose user now exists.
    const pendingMap = readPending();
    const pendingEmails = Object.keys(pendingMap);
    const materialized = [];
    if (pendingEmails.length > 0) {
      for (const email of pendingEmails) {
        const match = u.find(x => x.email?.toLowerCase() === email);
        if (!match) continue;
        try {
          await base44.entities.User.update(match.id, buildDriverPayload(pendingMap[email]));
          removePending(email);
          materialized.push(match.full_name || match.email);
        } catch (err) {
          console.error(`Falha ao aplicar convite pendente de ${email}:`, err);
        }
      }
    }
    // Refresh users if we changed anything so the card reflects new fields.
    const freshUsers = materialized.length > 0 ? await base44.entities.User.list() : u;
    setUsers(freshUsers);
    setRoutes(r);
    setPending(readPending());
    if (materialized.length > 0) setJustMaterialized(materialized);
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!form.email) return;
    setSaving(true);
    setInviteError("");
    setInviteInfo("");
    const emailKey = form.email.trim();
    try {
      // inviteUser só aceita os papéis de plataforma "user" e "admin".
      // O papel de aplicação ("driver") é gravado logo em seguida via
      // User.update, que o schema da entidade já aceita no enum de role.
      await base44.users.inviteUser(emailKey, "user");
      // The base44 User record is usually only created after the invitee
      // accepts the invite and logs in once. We poll briefly in case they
      // already existed; otherwise we stash the form data and finish the
      // registration on the next page load.
      let invited = null;
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const all = await base44.entities.User.list();
        invited = all.find(u => u.email?.toLowerCase() === emailKey.toLowerCase());
        if (invited) break;
      }
      if (invited) {
        const pin = generatePin();
        await base44.entities.User.update(invited.id, {
          ...buildDriverPayload(form),
          driver_pin: pin,
        });
        await loadData();
        setNewPin(pin);
      } else {
        // Deferred case: store the form, tell the admin what to do next.
        savePending(emailKey, form);
        setPending(readPending());
        setInviteInfo(`Convite enviado para ${emailKey}. O motorista precisa acessar o e-mail, criar senha e fazer o primeiro login. Depois disso ele aparece aqui automaticamente — clique em "Gerar novo" no card dele para criar o PIN.`);
      }
    } catch (err) {
      setInviteError(err?.message || "Falha ao cadastrar motorista.");
    } finally {
      setSaving(false);
    }
  };

  const cancelPending = (email) => {
    removePending(email);
    setPending(readPending());
  };

  const regeneratePin = async (driver) => {
    try {
      const pin = generatePin();
      await base44.entities.User.update(driver.id, { driver_pin: pin });
      setNewPin(pin);
      await loadData();
    } catch (err) {
      setInviteError(err?.message || "Falha ao regenerar PIN.");
    }
  };

  const copyPin = (pin) => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const drivers = users.filter(u => u.is_driver || u.driver_pin);
  const filtered = drivers.filter(d =>
    !search || d.full_name?.toLowerCase().includes(search.toLowerCase()) || d.email?.toLowerCase().includes(search.toLowerCase())
  );
  const getDriverRoutes = (email) => routes.filter(r => r.driver_email === email);
  const getActiveRoute = (email) => routes.find(r => r.driver_email === email && ["started", "in_progress"].includes(r.status));

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Motoristas" subtitle={`${drivers.length} motoristas`}>
        <Button onClick={() => { setShowForm(true); setNewPin(null); setInviteError(""); setInviteInfo(""); setForm({ email: "", full_name: "", phone: "", cpf: "", license_number: "", license_category: "", license_points: "" }); }}>
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

            {!newPin && !inviteInfo ? (
              <>
                <div className="space-y-3">
                  <div>
                    <Label>Nome Completo *</Label>
                    <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nome do motorista" />
                  </div>
                  <div>
                    <Label>E-mail *</Label>
                    <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="motorista@empresa.com" type="email" />
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nº Habilitação (CNH)</Label>
                      <Input value={form.license_number} onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} placeholder="00000000000" />
                    </div>
                    <div>
                      <Label>Pontos na Carteira</Label>
                      <Input type="number" min="0" max="40" value={form.license_points} onChange={e => setForm(f => ({ ...f, license_points: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <Label>Categoria CNH</Label>
                    <select
                      value={form.license_category}
                      onChange={e => setForm(f => ({ ...f, license_category: e.target.value }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Selecione...</option>
                      {["A","B","C","D","E","AB","AC","AD","AE","ACC"].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  Um convite será enviado para o e-mail. Se o motorista já for usuário do sistema, o PIN é gerado na hora; caso contrário, você gera o PIN depois que ele fizer o primeiro login.
                </p>
                {inviteError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{inviteError}</span>
                  </div>
                )}
                <Button onClick={handleInvite} disabled={!form.email || saving} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                  {saving ? "Enviando convite..." : "Cadastrar e Enviar Convite"}
                </Button>
              </>
            ) : newPin ? (
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
            ) : (
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto">
                  <Clock className="w-8 h-8 text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Convite enviado</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-2">
                  <p>{inviteInfo}</p>
                  <ol className="text-xs list-decimal pl-5 space-y-1 text-blue-800">
                    <li>Motorista recebe e-mail e cria a senha.</li>
                    <li>Ele faz o primeiro login no sistema.</li>
                    <li>Ao voltar aqui, os dados dele já estarão preenchidos.</li>
                    <li>Clique em <strong>Gerar novo</strong> no card para criar o PIN e entregar a ele.</li>
                  </ol>
                </div>
                <Button className="w-full" onClick={() => { setShowForm(false); setInviteInfo(""); }}>Entendi</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {justMaterialized.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Convite(s) concluído(s):</p>
            <p>{justMaterialized.join(", ")} fizeram o primeiro login e agora estão cadastrados como motorista. Gere o PIN no card correspondente.</p>
          </div>
          <button onClick={() => setJustMaterialized([])} className="text-green-700 hover:text-green-900"><X className="w-4 h-4" /></button>
        </div>
      )}

      {Object.keys(pending).length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Convites aguardando primeiro login ({Object.keys(pending).length})
          </p>
          <div className="space-y-1.5">
            {Object.values(pending).map(p => (
              <div key={p.email} className="flex items-center justify-between text-xs text-amber-900 bg-amber-100/60 rounded-md px-3 py-1.5">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{p.full_name || p.email}</span>
                  {p.full_name && <span className="text-amber-800/80 ml-2">({p.email})</span>}
                </div>
                <button
                  onClick={() => cancelPending(p.email)}
                  className="text-amber-800 hover:text-red-700 flex items-center gap-1"
                  title="Cancelar convite pendente"
                >
                  <Trash2 className="w-3 h-3" /> Cancelar
                </button>
              </div>
            ))}
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
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {d.phone && <p>📞 {d.phone}</p>}
                {d.cpf && <p>CPF: {d.cpf}</p>}
                {d.license_number && (
                  <p>CNH: {d.license_number} {d.license_category && <span className="ml-1 font-semibold text-foreground bg-primary/10 px-1.5 py-0.5 rounded">{d.license_category}</span>}</p>
                )}
                {d.license_points !== undefined && d.license_points !== null && d.license_points !== "" && (
                  <p className={d.license_points >= 20 ? "text-red-600 font-medium" : ""}>Pontos: {d.license_points} {d.license_points >= 20 ? "⚠️" : ""}</p>
                )}
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