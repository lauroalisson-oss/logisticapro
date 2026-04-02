export default function CapacityBar({ label, current, max, unit }) {
  const percent = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const overLimit = current > max;

  const getColor = () => {
    if (overLimit) return "bg-destructive";
    if (percent > 90) return "bg-chart-3";
    if (percent > 70) return "bg-primary";
    return "bg-accent";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className={`font-semibold ${overLimit ? "text-destructive" : "text-foreground"}`}>
          {current.toFixed(1)} / {max.toFixed(1)} {unit} ({percent.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor()}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {overLimit && (
        <p className="text-[10px] text-destructive font-medium">⚠ Capacidade excedida!</p>
      )}
    </div>
  );
}