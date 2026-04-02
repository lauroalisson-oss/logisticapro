export default function KPICard({ title, value, subtitle, icon: Icon, color = "primary" }) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-chart-3/10 text-chart-3",
    purple: "bg-chart-5/10 text-chart-5",
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-lg ${colorMap[color] || colorMap.primary}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}