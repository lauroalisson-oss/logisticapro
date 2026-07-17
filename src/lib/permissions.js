// Páginas cujo acesso é configurável por vendedor. A chave bate com o path
// da rota (sem a barra inicial) para reaproveitar tanto no filtro do
// Sidebar quanto no guard de rotas em App.jsx — "dashboard" fica de fora
// da lista por ser sempre liberado, e "sellers" nunca é uma permissão
// configurável (gestão de vendedores é exclusiva do gestor).
export const PERMISSION_PAGES = [
  { key: "orders", label: "Pedidos" },
  { key: "products", label: "Produtos" },
  { key: "vehicles", label: "Veículos" },
  { key: "drivers", label: "Motoristas" },
  { key: "loads", label: "Cargas" },
  { key: "routes", label: "Rotas" },
  { key: "tracking", label: "Rastreamento" },
  { key: "notifications", label: "Notificações" },
  { key: "analytics", label: "Analytics" },
  { key: "maintenance", label: "Manutenção" },
  { key: "reports", label: "Relatórios" },
  { key: "settings", label: "Configurações" },
];

// Sugestão de permissões ao cadastrar um vendedor novo — focado no que um
// vendedor tipicamente precisa (pedidos/produtos/rastreamento/relatórios).
// O gestor pode ajustar livremente antes de enviar o convite.
export const DEFAULT_SELLER_PERMISSIONS = {
  orders: true,
  products: true,
  vehicles: false,
  drivers: false,
  loads: false,
  routes: false,
  tracking: true,
  notifications: false,
  analytics: false,
  maintenance: false,
  reports: true,
  settings: false,
};

// Gestor e admin sempre têm acesso a tudo; vendedor só ao que estiver
// marcado em user.permissions (dashboard é sempre liberado).
export function hasPagePermission(user, key) {
  if (!user?.is_seller) return true;
  if (key === "dashboard") return true;
  return !!user?.permissions?.[key];
}
