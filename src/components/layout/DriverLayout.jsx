import { Outlet, Link, useLocation } from "react-router-dom";
import { Route, MapPin, ClipboardList, User, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";

const driverNav = [
  { label: "Rota", icon: Route, path: "/driver" },
  { label: "Paradas", icon: ClipboardList, path: "/driver/stops" },
  { label: "Mapa", icon: MapPin, path: "/driver/map" },
  { label: "Perfil", icon: User, path: "/driver/profile" },
];

export default function DriverLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Route className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">LogiFlow Driver</span>
        </div>
        <button onClick={() => base44.auth.logout()} className="p-2 text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>

      {/* Bottom nav */}
      <nav className="bg-card border-t border-border px-2 py-2 flex justify-around sticky bottom-0 z-30 safe-area-pb">
        {driverNav.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}