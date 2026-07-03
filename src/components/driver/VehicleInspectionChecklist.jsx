import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, AlertTriangle, CheckCircle2, SkipForward } from "lucide-react";

const STATUS_OPTIONS = {
  fluid: [
    { value: "ok", label: "OK", color: "bg-green-500", textColor: "text-green-700", border: "border-green-400" },
    { value: "low", label: "Baixo", color: "bg-amber-500", textColor: "text-amber-700", border: "border-amber-400" },
    { value: "critical", label: "Crítico", color: "bg-red-500", textColor: "text-red-700", border: "border-red-400" },
  ],
  tire: [
    { value: "ok", label: "OK", color: "bg-green-500", textColor: "text-green-700", border: "border-green-400" },
    { value: "low", label: "Murcho", color: "bg-amber-500", textColor: "text-amber-700", border: "border-amber-400" },
    { value: "flat", label: "Furado", color: "bg-red-500", textColor: "text-red-700", border: "border-red-400" },
  ],
  lights: [
    { value: "ok", label: "OK", color: "bg-green-500", textColor: "text-green-700", border: "border-green-400" },
    { value: "partial", label: "Parcial", color: "bg-amber-500", textColor: "text-amber-700", border: "border-amber-400" },
    { value: "broken", label: "Com falha", color: "bg-red-500", textColor: "text-red-700", border: "border-red-400" },
  ],
  wipers: [
    { value: "ok", label: "OK", color: "bg-green-500", textColor: "text-green-700", border: "border-green-400" },
    { value: "worn", label: "Desgastado", color: "bg-amber-500", textColor: "text-amber-700", border: "border-amber-400" },
    { value: "broken", label: "Com falha", color: "bg-red-500", textColor: "text-red-700", border: "border-red-400" },
  ],
  cargo: [
    { value: "ok", label: "OK", color: "bg-green-500", textColor: "text-green-700", border: "border-green-400" },
    { value: "missing", label: "Faltando", color: "bg-amber-500", textColor: "text-amber-700", border: "border-amber-400" },
    { value: "damaged", label: "Danificado", color: "bg-red-500", textColor: "text-red-700", border: "border-red-400" },
  ],
};

const ITEMS = [
  { key: "oil_level", label: "Nível de Óleo", icon: "🛢️", type: "fluid" },
  { key: "water_level", label: "Água do Radiador", icon: "💧", type: "fluid" },
  { key: "brake_fluid", label: "Fluido de Freio", icon: "🔴", type: "fluid" },
  { key: "tire_front_left", label: "Pneu Diant. Esq.", icon: "⬛", type: "tire" },
  { key: "tire_front_right", label: "Pneu Diant. Dir.", icon: "⬛", type: "tire" },
  { key: "tire_rear_left", label: "Pneu Tras. Esq.", icon: "⬛", type: "tire" },
  { key: "tire_rear_right", label: "Pneu Tras. Dir.", icon: "⬛", type: "tire" },
  { key: "lights", label: "Faróis e Luzes", icon: "💡", type: "lights" },
  { key: "wipers", label: "Limpadores", icon: "🌧️", type: "wipers" },
  { key: "cargo_straps", label: "Cintas de Carga", icon: "🪢", type: "cargo" },
];

function StatusPicker({ type, value, onChange }) {
  const options = STATUS_OPTIONS[type];
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
            value === opt.value
              ? `${opt.color} text-white ${opt.border} scale-105 shadow-sm`
              : `bg-background ${opt.border} ${opt.textColor} opacity-60`
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function VehicleInspectionChecklist({ route, user, onConfirm, onSkip }) {
  const initialState = ITEMS.reduce((acc, item) => ({ ...acc, [item.key]: "ok" }), {});
  const [values, setValues] = useState(initialState);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const hasIssues = Object.values(values).some(v => v !== "ok");
  const issueCount = Object.values(values).filter(v => v !== "ok").length;

  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm({ ...values, notes, has_issues: hasIssues });
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 p-4 space-y-4 overflow-auto pb-28">
        {/* Header */}
        <div className="pt-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Inspeção do Veículo</h2>
              <p className="text-sm text-muted-foreground">{route.vehicle_plate} • {route.route_number}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Preencha o estado atual do veículo antes de iniciar. Esta etapa é opcional mas ajuda a registrar eventuais problemas.
          </p>
        </div>

        {/* Checklist items */}
        <div className="space-y-3">
          {ITEMS.map(item => (
            <div key={item.key} className="bg-card border border-border rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-semibold">{item.label}</span>
                {values[item.key] !== "ok" && (
                  <AlertTriangle className="w-4 h-4 text-amber-500 ml-auto" />
                )}
              </div>
              <StatusPicker
                type={item.type}
                value={values[item.key]}
                onChange={v => setValues(prev => ({ ...prev, [item.key]: v }))}
              />
            </div>
          ))}

          {/* Notes */}
          <div className="bg-card border border-border rounded-xl p-3.5 space-y-2">
            <p className="text-sm font-semibold">📝 Observações</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Algum problema adicional ou observação importante..."
              rows={3}
              className="w-full text-sm resize-none rounded-lg border border-input bg-transparent p-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Issues summary */}
        {hasIssues && (
          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              {issueCount} item(ns) com pendência detectado(s). Será registrado no sistema.
            </p>
          </div>
        )}

        {!hasIssues && (
          <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl p-3.5">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-medium">Veículo em boas condições!</p>
          </div>
        )}
      </div>

      {/* Fixed bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t border-border bg-background space-y-2">
        <Button className="w-full h-12" onClick={handleConfirm} disabled={saving}>
          {saving ? (
            <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</span>
          ) : (
            <><ClipboardCheck className="w-5 h-5 mr-2" /> Confirmar Inspeção e Continuar</>
          )}
        </Button>
        <button
          onClick={onSkip}
          className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground py-2 hover:text-foreground transition-colors"
        >
          <SkipForward className="w-4 h-4" /> Pular inspeção por agora
        </button>
      </div>
    </div>
  );
}