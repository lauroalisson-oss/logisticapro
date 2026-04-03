import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users,
  BoxSelect, Route, MapPin, BarChart3, Settings, LogOut, Menu, X, LineChart, Bell
} from "lucide-react";
import { useState } from "react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Pedidos", icon: ShoppingCart, path: "/orders" },
  { label: "Produtos", icon: Package, path: "/products" },
  { label: "Veículos", icon: Truck, path: "/vehicles" },
  { label: "Motoristas", icon: Users, path: "/drivers" },
  { label: "Cargas", icon: BoxSelect, path: "/loads" },
  { label: "Rotas", icon: Route, path: "/routes" },
  { label: "Rastreamento", icon: MapPin, path: "/tracking" },
  { label: "Notificações", icon: Bell, path: "/notifications" },
  { label: "Analytics", icon: LineChart, path: "/analytics" },
  { label: "Relatórios", icon: BarChart3, path: "/reports" },
  { label: "Configurações", icon: Settings, path: "/settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-sidebar rounded-lg text-sidebar-foreground shadow-lg"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-sidebar z-40 flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Truck className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold text-sidebar-primary-foreground tracking-tight">LogiFlow</h1>
              <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">Logistics</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-[18px] h-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent w-full transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}