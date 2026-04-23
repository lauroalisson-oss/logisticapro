import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useCompany } from "@/lib/CompanyContext";
import PageHeader from "../components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Building2, Save, Loader2, CheckCircle2, MapPin } from "lucide-react";
import { maskPhone, maskCNPJ } from "@/lib/masks";

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
  const [geocodingDeparture, setGeocodingDeparture] = useState(false);
  const [departureAddress, setDepartureAddress] = useState("");
  const [departureLat, setDepartureLat] = useState(null);
  const [departureLng, setDepartureLng] = useState(null);
  const [departureConfirmed, setDepartureConfirmed] = useState(false);

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
      setDepartureAddress(company.departure_address || "");
      setDepartureLat(company.departure_lat || null);
      setDepartureLng(company.departure_lng || null);
      if (company.departure_lat && company.departure_lng) setDepartureConfirmed(true);
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

  const handleGeocodeDeparture = async () => {
    if (!departureAddress.trim()) return;
    setGeocodingDeparture(true);
    setDepartureConfirmed(false);
    try {
      const q = encodeURIComponent(departureAddress);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
      const data = await res.json();
      if (data.length > 0) {
        setDepartureLat(parseFloat(data[0].lat));
        setDepartureLng(parseFloat(data[0].lon));
        setDepartureAddress(data[0].display_name);
        setDepartureConfirmed(true);
      } else {
        setCompanyError("Endereço de saída não encontrado. Tente um endereço mais completo.");
      }
    } catch {
      setCompanyError("Erro ao geocodificar o endereço de saída.");
    } finally {
      setGeocodingDeparture(false);
    }
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
        departure_address: departureAddress,
        departure_lat: departureLat,
        departure_lng: departureLng,
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
              <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 9 9999-9999" maxLength={16} />
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
                <Input value={companyForm.cnpj} onChange={e => setCompanyForm(f => ({ ...f, cnpj: maskCNPJ(e.target.value) }))} placeholder="00.000.000/0000-00" maxLength={18} />
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
                <Input value={companyForm.phone} onChange={e => setCompanyForm(f => ({ ...f, phone: maskPhone(e.target.value) }))} placeholder="(11) 9 9999-9999" maxLength={16} />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input value={companyForm.address} onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))} />
              </div>

              {/* Departure point */}
              <div className="pt-2 border-t border-border space-y-2">
                <Label className="flex items-center gap-1.5 text-sm font-semibold">
                  <MapPin className="w-4 h-4 text-primary" /> Ponto de Partida das Rotas
                </Label>
                <p className="text-xs text-muted-foreground">Endereço de onde os caminhões saem (base/depósito). Será usado como ponto inicial no cálculo de rotas.</p>
                <div className="flex gap-2">
                  <Input
                    value={departureAddress}
                    onChange={e => { setDepartureAddress(e.target.value); setDepartureConfirmed(false); setDepartureLat(null); setDepartureLng(null); }}
                    placeholder="Ex: Rua das Indústrias, 100, São Paulo, SP"
                  />
                  <Button type="button" variant="outline" onClick={handleGeocodeDeparture} disabled={geocodingDeparture || !departureAddress.trim()}>
                    {geocodingDeparture ? <Loader2 className="w-4 h-4 animate-spin" /> : "Localizar"}
                  </Button>
                </div>
                {departureConfirmed && departureLat && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Localizado: {departureLat.toFixed(5)}, {departureLng.toFixed(5)}
                  </p>
                )}
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