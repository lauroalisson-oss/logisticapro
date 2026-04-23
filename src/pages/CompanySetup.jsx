import { useState, useEffect } from "react";
import { useCompany } from "@/lib/CompanyContext";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, Mail, Info } from "lucide-react";
import { maskPhone, maskCNPJ } from "@/lib/masks";

export default function CompanySetup() {
  const { createCompany } = useCompany();
  const { user, logout } = useAuth();
  const [form, setForm] = useState({ name: "", cnpj: "", phone: "", address: "", admin_email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pré-preenche o email administrativo com o email de login. O admin pode
  // substituir por um email diferente (ex: o email do sócio responsável)
  // sem afetar qual conta faz login — esse campo é só identificação.
  useEffect(() => {
    if (user?.email) setForm(f => ({ ...f, admin_email: f.admin_email || user.email }));
  }, [user?.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Nome da empresa é obrigatório."); return; }
    setSaving(true);
    setError("");
    try {
      await createCompany({
        ...form,
        admin_email: (form.admin_email || "").trim().toLowerCase() || user?.email,
      });
      // CompanyProvider will update context; App will re-render naturally
    } catch (err) {
      setError(err?.message || "Erro ao criar empresa.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Configure sua Empresa</h1>
            <p className="text-sm text-muted-foreground">
              Para começar, preencha os dados da sua empresa. Todos os seus dados ficarão isolados e seguros.
            </p>
          </div>

          {/* Login email summary */}
          {user?.email && (
            <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs">
              <Mail className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-muted-foreground">Você está se cadastrando como:</p>
                <p className="font-semibold font-mono">{user.email}</p>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="text-[11px] text-primary hover:underline mt-1"
                >
                  Usar outra conta
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Nome da Empresa *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Transportadora ABC Ltda"
              />
            </div>
            <div className="space-y-1">
              <Label>CNPJ</Label>
              <Input
                value={form.cnpj}
                onChange={e => setForm(f => ({ ...f, cnpj: maskCNPJ(e.target.value) }))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>
            <div className="space-y-1">
              <Label>Email do administrador responsável</Label>
              <Input
                type="email"
                value={form.admin_email}
                onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))}
                placeholder="admin@empresa.com"
              />
              <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span>Pode ser diferente do email de login acima. Serve para identificar o admin responsável pela conta (ex: o diretor que recebe as faturas).</span>
              </p>
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))}
                placeholder="(11) 9 9999-9999"
                maxLength={16}
              />
            </div>
            <div className="space-y-1">
              <Label>Endereço</Label>
              <Input
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Rua, cidade, estado..."
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{error}</p>
            )}

            <Button type="submit" className="w-full h-11" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {saving ? "Criando empresa..." : "Criar Empresa e Começar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}