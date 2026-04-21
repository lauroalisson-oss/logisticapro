import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useCompany } from "@/lib/CompanyContext";
import PageHeader from "@/components/shared/PageHeader";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, MapPin, User, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

const TYPE_LABEL = { issue: "Ocorrência", not_delivered: "Não Entregue", delay: "Atraso" };
const TYPE_COLOR = { issue: "text-red-600 bg-red-50 border-red-200", not_delivered: "text-orange-600 bg-orange-50 border-orange-200", delay: "text-yellow-600 bg-yellow-50 border-yellow-200" };

export default function Notifications() {
  const { companyId } = useCompany();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
    if (companyId) loadAlerts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {

    // Real-time subscription
    const unsub = base44.entities.Alert.subscribe((event) => {
      if (event.type === "create") {
        setAlerts(prev => [event.data, ...prev]);
      } else if (event.type === "update") {
        setAlerts(prev => prev.map(a => a.id === event.id ? event.data : a));
      } else if (event.type === "delete") {
        setAlerts(prev => prev.filter(a => a.id !== event.id));
      }
    });

    return () => unsub();
  }, []);

  const loadAlerts = async () => {
    const data = await base44.entities.Alert.filter({ company_id: companyId }, "-created_date", 100);
    setAlerts(data);
    setLoading(false);
  };

  const markResolved = async (alert) => {
    await base44.entities.Alert.update(alert.id, {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: user?.full_name || user?.email || "—",
    });
  };

  const markPending = async (alert) => {
    await base44.entities.Alert.update(alert.id, {
      status: "pending",
      resolved_at: null,
      resolved_by: null,
    });
  };

  const filtered = alerts.filter(a => filter === "all" || a.status === filter);
  const pendingCount = alerts.filter(a => a.status === "pending").length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Notificações"
        subtitle={pendingCount > 0 ? `${pendingCount} ocorrência(s) pendente(s)` : "Sem pendências"}
      >
        <Button variant="outline" size="sm" onClick={loadAlerts}>
          <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar
        </Button>
      </PageHeader>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
        {[
          { value: "pending", label: `Pendentes${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          { value: "resolved", label: "Resolvidas" },
          { value: "all", label: "Todas" },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.value ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma notificação {filter === "pending" ? "pendente" : filter === "resolved" ? "resolvida" : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <div
              key={alert.id}
              className={`bg-card border rounded-xl p-4 flex flex-col sm:flex-row sm:items-start gap-4 transition-opacity ${
                alert.status === "resolved" ? "opacity-60" : ""
              }`}
            >
              {/* Icon + type */}
              <div className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${TYPE_COLOR[alert.type] || "text-gray-600 bg-gray-50 border-gray-200"}`}>
                <AlertTriangle className="w-4 h-4" />
                {TYPE_LABEL[alert.type] || alert.type}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{alert.client_name}</span>
                  {alert.order_number && (
                    <span className="text-xs text-muted-foreground">#{alert.order_number}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {moment(alert.created_date).fromNow()}
                  </span>
                </div>

                {alert.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" /> {alert.address}
                  </p>
                )}

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {alert.driver_name && (
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {alert.driver_name}</span>
                  )}
                  {alert.route_number && (
                    <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {alert.route_number}</span>
                  )}
                </div>

                {alert.notes && (
                  <p className="text-xs bg-muted/50 rounded px-2 py-1 italic text-muted-foreground">"{alert.notes}"</p>
                )}

                {alert.status === "resolved" && alert.resolved_at && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Resolvido por {alert.resolved_by} — {moment(alert.resolved_at).format("DD/MM HH:mm")}
                  </p>
                )}
              </div>

              {/* Action */}
              <div className="flex-shrink-0">
                {alert.status === "pending" ? (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => markResolved(alert)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Resolver
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => markPending(alert)}>
                    <Clock className="w-3.5 h-3.5 mr-1" /> Reabrir
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}