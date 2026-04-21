import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useCompany } from "@/lib/CompanyContext";
import { daysRemaining } from "@/lib/platformAdmin";
import { AlertTriangle } from "lucide-react";

function ExpiryBanner() {
  const { company } = useCompany();
  if (!company || company.status !== "active") return null;
  const rem = daysRemaining(company.access_expires_at);
  if (rem === null || rem > 5) return null;
  const days = Math.max(0, Math.ceil(rem));
  return (
    <div className="sticky top-0 z-30 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm text-amber-900">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>
        <strong>Acesso expira {days === 0 ? "hoje" : `em ${days} dia${days > 1 ? "s" : ""}`}.</strong>{" "}
        Entre em contato com o administrador da plataforma para renovar o PIN de acesso e evitar interrupções.
      </span>
    </div>
  );
}

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen">
        <ExpiryBanner />
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
