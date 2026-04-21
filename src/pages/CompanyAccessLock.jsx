import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCompany } from "@/lib/CompanyContext";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2, AlertCircle, CheckCircle2, Clock, LogOut } from "lucide-react";
import { computeExpiresAt, daysRemaining } from "@/lib/platformAdmin";

export default function CompanyAccessLock() {
  const { company, patchCompany } = useCompany();
  const { logout } = useAuth();
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const isExpired = company?.status === "expired" ||
    (company?.access_expires_at && daysRemaining(company.access_expires_at) <= 0);
  const isSuspended = company?.status === "suspended";

  const handleRedeem = async (e) => {
    e.preventDefault();
    const code = pin.trim().toUpperCase();
    if (code.length < 6) { setError("PIN inválido."); return; }
    setChecking(true);
    setError("");
    try {
      const candidates = await base44.entities.AccessPin.filter({ pin: code });
      const match = candidates.find(p => p.status === "available");
      if (!match) {
        const alreadyRedeemed = candidates.find(p => p.status === "redeemed");
        if (alreadyRedeemed) setError("Este PIN já foi utilizado.");
        else if (candidates.find(p => p.status === "revoked")) setError("Este PIN foi revogado. Solicite um novo ao administrador.");
        else setError("PIN não encontrado. Verifique e tente novamente.");
        return;
      }
      // Se o PIN foi emitido para um email específico, ele precisa casar
      // com o owner_email da empresa que está tentando resgatar.
      if (match.assigned_company_email &&
          match.assigned_company_email.toLowerCase() !== (company?.owner_email || "").toLowerCase()) {
        setError("Este PIN foi emitido para outra conta.");
        return;
      }

      const newExpiresAt = computeExpiresAt(company?.access_expires_at, match.duration_days);
      const redeemedAt = new Date().toISOString();

      await base44.entities.Company.update(company.id, {
        status: "active",
        access_expires_at: newExpiresAt,
        last_pin_used: match.pin,
      });
      await base44.entities.AccessPin.update(match.id, {
        status: "redeemed",
        redeemed_by_company_id: company.id,
        redeemed_by_company_name: company.name || "",
        redeemed_at: redeemedAt,
      });

      patchCompany({
        status: "active",
        access_expires_at: newExpiresAt,
        last_pin_used: match.pin,
      });
      // AppLayout re-renders naturally based on companyHasActiveAccess.
    } catch (err) {
      console.error(err);
      setError(err?.message || "Falha ao validar o PIN. Tente novamente.");
    } finally {
      setChecking(false);
    }
  };

  const title =
    isSuspended ? "Conta suspensa" :
    isExpired ? "Acesso expirado" :
    "Ative o acesso da empresa";

  const subtitle =
    isSuspended ? "Sua conta foi suspensa. Entre em contato com o suporte." :
    isExpired ? "Seu acesso terminou. Insira um novo PIN para continuar." :
    "Sua empresa foi cadastrada, mas o acesso ao sistema precisa ser liberado. Insira o PIN fornecido pelo administrador.";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${isSuspended ? "bg-red-100" : "bg-primary/10"}`}>
              <Lock className={`w-8 h-8 ${isSuspended ? "text-red-600" : "text-primary"}`} />
            </div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {company && (
            <div className="bg-muted/40 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold">{company.name}</p>
              <p className="text-muted-foreground">{company.owner_email}</p>
              {company.last_pin_used && (
                <p className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Último PIN: <span className="font-mono">{company.last_pin_used}</span></p>
              )}
            </div>
          )}

          {!isSuspended && (
            <form onSubmit={handleRedeem} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">PIN de acesso</label>
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="Ex: A3F7XK92"
                  maxLength={16}
                  autoFocus
                  className="text-center font-mono text-lg tracking-widest uppercase"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={checking || pin.length < 6}>
                {checking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {checking ? "Validando..." : "Ativar acesso"}
              </Button>
            </form>
          )}

          <div className="text-xs text-muted-foreground text-center">
            Não tem um PIN? Entre em contato com o administrador da plataforma.
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </div>
    </div>
  );
}
