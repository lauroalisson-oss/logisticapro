import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useCompany } from "@/lib/CompanyContext";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Building2, Save, Loader2, CheckCircle2 } from "lucide-react";

export default function Settings() {
  const { company, patchCompany } = useCompany();
  const [user, setUser] = useState(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Company form
  const [companyForm, setCompanyForm] = useState({ name: "", cnpj: "", phone: "", address: "", admin_email: "" });
  const [savingCompany, setSavingCompany] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [companyError, setCompanyError] = useState("");

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name || "",
        cnpj: company.cnpj || "",
        phone: company.phone || "",
        address: company.address || "",
        admin_email: company.admin_email || company.owner_email || "",
      });
    }
  }, [company]);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    setPhone(me?.phone || "");
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    await base44.auth.updateMe({ phone });
    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleSaveCompany = async () => {
    if (!company?.id) return;
    setSavingCompany(true);
    setCompanySaved(false);
    setCompanyError("");
    try {
      const patch = {
        name: companyForm.name.trim(),
        cnpj: companyForm.cnpj.trim(),
        phone: companyForm.phone.trim(),
        address: companyForm.address.trim(),
        admin_email: (companyForm.admin_email || "").trim().toLowerCase(),
      };
      await base44.entities.Company.update(company.id, patch);
      patchCompany(patch);
      setCompanySaved(true);
      setTimeout(() => setCompanySaved(false), 2500);
    } catch (err) {
      setCompanyError(err?.message || "Erro ao salvar dados da empresa.");
    } finally {
      setSavingCompany(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" subtitle="Gerencie seu perfil e sua empresa" />

      <div className="max-w-xl space-y-6">
        {/* Profile */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">{user?.full_name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">Perfil: {user?.role === "admin" ? "Administrador" : user?.role === "dispatcher" ? "Despachante" : "Motorista"}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={user?.full_name || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">O nome não pode ser alterado aqui</p>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-muted" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {profileSaved ? <><CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> Salvo</> : <><Save className="w-4 h-4 mr-2" /> {savingProfile ? "Salvando..." : "Salvar Alterações"}</>}
          </Button>
        </div>

        {/* Company */}
        {company && (
          <div className="bg-card rounded-xl border border-border p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Dados da empresa</p>
                <p className="text-sm text-muted-foreground">Atualize os dados cadastrais e o admin responsável</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Nome da empresa</Label>
                <Input value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={companyForm.cnpj} onChange={e => setCompanyForm(f => ({ ...f, cnpj: e.target.value }))} />
              </div>
              <div>
                <Label>Email do administrador responsável</Label>
                <Input
                  type="email"
                  value={companyForm.admin_email}
                  onChange={e => setCompanyForm(f => ({ ...f, admin_email: e.target.value }))}
                  placeholder="admin@empresa.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Pode ser diferente do email de login ({company.owner_email}). Serve só como identificação do responsável.
                </p>
              </div>
              <div>
                <Label>Telefone da empresa</Label>
                <Input value={companyForm.phone} onChange={e => setCompanyForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input value={companyForm.address} onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>

            {companyError && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{companyError}</p>
            )}

            <Button onClick={handleSaveCompany} disabled={savingCompany}>
              {companySaved ? <><CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> Salvo</> : <><Save className="w-4 h-4 mr-2" /> {savingCompany ? "Salvando..." : "Salvar dados da empresa"}</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
