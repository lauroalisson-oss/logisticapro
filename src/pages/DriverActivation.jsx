import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DriverActivation({ user, onActivated }) {
  const [status, setStatus] = useState("activating"); // activating | done | error
  const [pin, setPin] = useState(null);

  useEffect(() => {
    activate();
  }, []);

  const activate = async () => {
    try {
      // Fetch the pending invite from the DB (works on any device)
      const res = await base44.functions.invoke('getDriverInvite', {});
      const invite = res.data?.invite;

      const payload = {
        is_driver: true,
        driver_pin: invite?.driver_pin || generatePin(),
      };
      if (invite?.full_name) payload.full_name = invite.full_name;
      if (invite?.phone) payload.phone = invite.phone;
      if (invite?.cpf) payload.cpf = invite.cpf;
      if (invite?.license_number) payload.license_number = invite.license_number;
      if (invite?.license_category) payload.license_category = invite.license_category;
      if (invite?.license_points) payload.license_points = Number(invite.license_points);
      if (invite?.company_id) payload.company_id = invite.company_id;

      // Apply to user account
      await base44.auth.updateMe(payload);

      // Mark invite as activated
      if (invite?.id) {
        await base44.entities.DriverInvite.update(invite.id, { status: 'activated' });
      }

      setPin(payload.driver_pin);
      setStatus("done");

      setTimeout(() => onActivated(), 3000);
    } catch (err) {
      console.error("Falha na ativação:", err);
      setStatus("error");
    }
  };

  if (status === "activating") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Ativando sua conta de motorista...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 p-8 text-center">
        <p className="font-semibold text-destructive">Erro ao ativar conta</p>
        <p className="text-sm text-muted-foreground">Tente recarregar a página ou entre em contato com o gestor.</p>
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-5 p-8 text-center">
      <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center">
        <Truck className="w-10 h-10 text-accent" />
      </div>
      <div>
        <p className="text-xl font-bold">Conta ativada!</p>
        <p className="text-sm text-muted-foreground mt-1">Bem-vindo ao sistema de entregas.</p>
      </div>
      {pin && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 w-full max-w-xs">
          <p className="text-xs text-muted-foreground mb-1">Seu PIN de acesso</p>
          <p className="text-4xl font-mono font-bold tracking-widest text-primary">{pin}</p>
          <p className="text-xs text-muted-foreground mt-2">Guarde este PIN — você precisará dele para entrar.</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-accent text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Entrando no app...
      </div>
    </div>
  );
}

function generatePin() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const max = 1_000_000;
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let n;
    do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
    return String(n % max).padStart(6, "0");
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}