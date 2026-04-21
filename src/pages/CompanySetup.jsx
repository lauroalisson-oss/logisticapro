import { useState } from "react";
import { useCompany } from "@/lib/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2 } from "lucide-react";

export default function CompanySetup() {
  const { createCompany } = useCompany();
  const [form, setForm] = useState({ name: "", cnpj: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Nome da empresa é obrigatório."); return; }
    setSaving(true);
    setError("");
    try {
      await createCompany(form);
      // CompanyProvider will update context; App will re-render naturally
    } catch (err) {
      setError(err?.message || "Erro ao criar empresa.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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
                onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
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