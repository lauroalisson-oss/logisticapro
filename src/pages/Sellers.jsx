import { useState, useEffect } from "react";
import { useCompany } from "@/lib/CompanyContext";
import { base44 } from "@/api/base44Client";
import { maskPhone } from "@/lib/masks";
import { safeParallel } from "@/lib/safeLoad";
import { PERMISSION_PAGES, DEFAULT_SELLER_PERMISSIONS } from "@/lib/permissions";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCog, Loader2, Search, UserCircle, Plus, X, AlertCircle, Clock, Trash2, Pencil, ShieldOff } from "lucide-react";

function permissionSummary(permissions) {
  const allowed = PERMISSION_PAGES.filter(p => permissions?.[p.key]).map(p => p.label);
  if (allowed.length === 0) return "Nenhum acesso além do Dashboard";
  return allowed.join(", ");
}

export default function Sellers() {
  const { companyId } = useCompany();
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", phone: "", permissions: { ...DEFAULT_SELLER_PERMISSIONS } });
  const [saving, setSaving] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteInfo, setInviteInfo] = useState("");

  const [editingSeller, setEditingSeller] = useState(null);
  const [editPermissions, setEditPermissions] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [revoking, setRevoking] = useState(null);
  const [revokeSaving, setRevokeSaving] = useState(false);

  useEffect(() => { if (companyId) loadData(); }, [companyId]);

  const fetchUsers = async () => {
    const res = await base44.functions.invoke("getCompanyDrivers", { company_id: companyId });
    return res.data?.users || [];
  };

  const loadData = async () => {
    const [u, inv] = await safeParallel([
      () => fetchUsers(),
      () => base44.entities.SellerInvite.filter({ company_id: companyId, status: "pending" }),
    ]);
    setUsers(u);
    setPending(inv || []);
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!form.email) return;
    setSaving(true);
    setInviteError("");
    setInviteInfo("");
    const emailKey = form.email.trim().toLowerCase();
    try {
      // 1. Convite validado e criado no servidor (inviteSeller): força
      // company_id do solicitante e recusa se quem convida não for gestor.
      const res = await base44.functions.invoke("inviteSeller", {
        email: emailKey,
        full_name: form.full_name,
        phone: form.phone,
        permissions: form.permissions,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || "Falha ao cadastrar vendedor.");

      // 2. Envia o e-mail de convite (mesmo fluxo usado para motoristas).
      await base44.users.inviteUser(emailKey, "user");

      await loadData();
      setInviteInfo(`Convite enviado para ${emailKey}. Quando o vendedor fizer o primeiro login, a conta será ativada automaticamente com as permissões escolhidas.`);
    } catch (err) {
      setInviteError(err?.response?.data?.error || err?.message || "Falha ao cadastrar vendedor.");
    } finally {
      setSaving(false);
    }
  };

  const cancelInvite = async (invite) => {
    await base44.entities.SellerInvite.delete(invite.id);
    setPending(prev => prev.filter(p => p.id !== invite.id));
  };

  const resetForm = () => {
    setShowForm(false);
    setInviteError("");
    setInviteInfo("");
    setForm({ email: "", full_name: "", phone: "", permissions: { ...DEFAULT_SELLER_PERMISSIONS } });
  };

  const openEdit = (seller) => {
    setEditingSeller(seller);
    setEditPermissions({ ...DEFAULT_SELLER_PERMISSIONS, ...(seller.permissions || {}) });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editingSeller) return;
    setEditSaving(true);
    setEditError("");
    try {
      const res = await base44.functions.invoke("updateSellerAccess", {
        seller_id: editingSeller.id,
        permissions: editPermissions,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || "Falha ao salvar permissões.");
      setUsers(prev => prev.map(u => u.id === editingSeller.id ? { ...u, permissions: editPermissions } : u));
      setEditingSeller(null);
    } catch (err) {
      setEditError(err?.response?.data?.error || err?.message || "Falha ao salvar permissões.");
    } finally {
      setEditSaving(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revoking) return;
    setRevokeSaving(true);
    try {
      const res = await base44.functions.invoke("updateSellerAccess", {
        seller_id: revoking.id,
        revoke: true,
      });
      if (!res.data?.ok) throw new Error(res.data?.error || "Falha ao revogar acesso.");
      setUsers(prev => prev.filter(u => u.id !== revoking.id));
      setRevoking(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Falha ao revogar acesso:", err);
    } finally {
      setRevokeSaving(false);
    }
  };

  const sellers = users.filter(u => u.is_seller);
  const filtered = sellers.filter(s =>
    !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Vendedores" subtitle={`${sellers.length} vendedores`}>
        <Button onClick={() => { setShowForm(true); setInviteError(""); setInviteInfo(""); setForm({ email: "", full_name: "", phone: "", permissions: { ...DEFAULT_SELLER_PERMISSIONS } }); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Cadastrar Vendedor
        </Button>
      </PageHeader>

      {/* Cadastro Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6 space-y-5 shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Cadastrar Vendedor</h2>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!inviteInfo ? (
              <>
                <div className="space-y-3">
                  <div>
                    <Label>Nome Completo</Label>
                    <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nome do vendedor" />
                  </div>
                  <div>
                    <Label>E-mail *</Label>
                    <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="vendedor@empresa.com" type="email" />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))} placeholder="(11) 9 9999-9999" maxLength={16} />
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">O que este vendedor pode acessar</Label>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted/40 rounded-lg p-3">
                    {PERMISSION_PAGES.map(p => (
                      <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={!!form.permissions[p.key]}
                          onCheckedChange={(checked) => setForm(f => ({ ...f, permissions: { ...f.permissions, [p.key]: !!checked } }))}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">Dashboard fica sempre liberado. Você pode ajustar essas permissões depois a qualquer momento.</p>
                </div>

                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  Um convite será enviado por e-mail. Quando o vendedor fizer o primeiro login, a conta será ativada automaticamente com as permissões escolhidas acima.
                </p>
                {inviteError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{inviteError}</span>
                  </div>
                )}
                <Button onClick={handleInvite} disabled={!form.email || saving} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserCog className="w-4 h-4 mr-2" />}
                  {saving ? "Enviando convite..." : "Cadastrar e Enviar Convite"}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto">
                  <Clock className="w-8 h-8 text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Convite enviado!</p>
                  <p className="text-sm text-muted-foreground mt-1">{inviteInfo}</p>
                </div>
                <Button className="w-full" onClick={resetForm}>Concluir</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit permissions modal */}
      {editingSeller && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6 space-y-5 shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Editar acesso — {editingSeller.full_name || editingSeller.email}</h2>
              <button onClick={() => setEditingSeller(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted/40 rounded-lg p-3">
              {PERMISSION_PAGES.map(p => (
                <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!editPermissions[p.key]}
                    onCheckedChange={(checked) => setEditPermissions(prev => ({ ...prev, [p.key]: !!checked }))}
                  />
                  {p.label}
                </label>
              ))}
            </div>

            {editError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingSeller(null)}>Cancelar</Button>
              <Button className="flex-1" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm modal */}
      {revoking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 space-y-4 text-center shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <ShieldOff className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <p className="font-semibold">Revogar acesso?</p>
              <p className="text-sm text-muted-foreground mt-1">
                {revoking.full_name || revoking.email} perde o acesso ao sistema imediatamente. Para liberar de novo será preciso um novo convite.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRevoking(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmRevoke} disabled={revokeSaving}>
                {revokeSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Revogar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Convites aguardando primeiro login ({pending.length})
          </p>
          <div className="space-y-1.5">
            {pending.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs text-amber-900 bg-amber-100/60 rounded-md px-3 py-1.5">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{p.full_name || p.email}</span>
                  {p.full_name && <span className="text-amber-800/80 ml-2">({p.email})</span>}
                </div>
                <button
                  onClick={() => cancelInvite(p)}
                  className="text-amber-800 hover:text-red-700 flex items-center gap-1"
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
        <Input placeholder="Buscar vendedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(s => (
          <div key={s.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{s.full_name || s.email}</p>
                <p className="text-xs text-muted-foreground truncate">{s.email}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {s.phone && <p>📞 {s.phone}</p>}
              <p className="line-clamp-2"><span className="font-medium text-foreground">Acesso:</span> {permissionSummary(s.permissions)}</p>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button onClick={() => openEdit(s)} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Pencil className="w-3 h-3" /> Editar acesso
              </button>
              <button onClick={() => setRevoking(s)} className="text-xs text-red-600 hover:underline flex items-center gap-1">
                <ShieldOff className="w-3 h-3" /> Revogar
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <UserCog className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum vendedor cadastrado</p>
          <p className="text-xs mt-1">Clique em "Cadastrar Vendedor" para adicionar</p>
        </div>
      )}
    </div>
  );
}
