import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Shield, Delete } from "lucide-react";

export default function DriverPinLogin({ onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleDigit = (d) => {
    if (pin.length >= 6) return;
    setPin(p => p + d);
    setError("");
  };

  const handleDelete = () => setPin(p => p.slice(0, -1));

  const handleConfirm = async () => {
    if (pin.length < 4) return;
    setChecking(true);
    const me = await base44.auth.me();
    if (me?.driver_pin === pin) {
      sessionStorage.setItem("driver_pin_verified", "1");
      onSuccess();
    } else {
      setError("PIN incorreto. Tente novamente.");
      setPin("");
    }
    setChecking(false);
  };

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-8">
        {/* Icon */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">Acesso do Motorista</h1>
            <p className="text-sm text-muted-foreground">Digite seu PIN para continuar</p>
          </div>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                i < pin.length
                  ? "bg-primary border-primary scale-110"
                  : "border-muted-foreground/40"
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-destructive font-medium">{error}</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {digits.map((d, i) => {
            if (d === "") return <div key={i} />;
            if (d === "⌫") return (
              <button
                key={i}
                onClick={handleDelete}
                className="h-16 rounded-2xl bg-muted/60 flex items-center justify-center text-foreground hover:bg-muted transition-colors active:scale-95"
              >
                <Delete className="w-5 h-5" />
              </button>
            );
            return (
              <button
                key={i}
                onClick={() => handleDigit(d)}
                className="h-16 rounded-2xl bg-card border border-border text-xl font-semibold hover:bg-muted/60 transition-colors active:scale-95 shadow-sm"
              >
                {d}
              </button>
            );
          })}
        </div>

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={pin.length < 4 || checking}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 transition-opacity active:scale-98"
        >
          {checking ? "Verificando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
}