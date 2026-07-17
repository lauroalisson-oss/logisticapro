import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SellerActivation({ onActivated }) {
  const [status, setStatus] = useState("activating"); // activating | done | error

  useEffect(() => {
    activate();
  }, []);

  const activate = async () => {
    try {
      // Ativação inteira roda no backend (activateSeller): aplica o
      // company_id e as permissões definidas pelo convite pendente — o
      // cliente não escolhe nada aqui.
      const res = await base44.functions.invoke("activateSeller", {});
      if (!res.data?.ok) throw new Error(res.data?.error || "Falha na ativação");

      setStatus("done");
      setTimeout(() => onActivated(), 1500);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Falha na ativação:", err);
      setStatus("error");
    }
  };

  if (status === "activating") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Ativando sua conta de vendedor...</p>
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
        <UserCog className="w-10 h-10 text-accent" />
      </div>
      <div>
        <p className="text-xl font-bold">Conta ativada!</p>
        <p className="text-sm text-muted-foreground mt-1">Bem-vindo ao sistema.</p>
      </div>
      <div className="flex items-center gap-2 text-accent text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Entrando no sistema...
      </div>
    </div>
  );
}
