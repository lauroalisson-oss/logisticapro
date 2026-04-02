const statusStyles = {
  // Orders
  pending: { label: "Pendente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  routing: { label: "Em Roteirização", className: "bg-blue-100 text-blue-800 border-blue-200" },
  in_transit: { label: "Em Trânsito", className: "bg-purple-100 text-purple-800 border-purple-200" },
  delivered: { label: "Entregue", className: "bg-green-100 text-green-800 border-green-200" },
  issue: { label: "Ocorrência", className: "bg-red-100 text-red-800 border-red-200" },
  cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-800 border-gray-200" },
  // Vehicles
  available: { label: "Disponível", className: "bg-green-100 text-green-800 border-green-200" },
  on_route: { label: "Em Rota", className: "bg-blue-100 text-blue-800 border-blue-200" },
  maintenance: { label: "Manutenção", className: "bg-orange-100 text-orange-800 border-orange-200" },
  inactive: { label: "Inativo", className: "bg-gray-100 text-gray-800 border-gray-200" },
  // Loads
  assembling: { label: "Montando", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  ready: { label: "Pronta", className: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  // Routes
  planned: { label: "Planejada", className: "bg-gray-100 text-gray-800 border-gray-200" },
  started: { label: "Iniciada", className: "bg-blue-100 text-blue-800 border-blue-200" },
  in_progress: { label: "Em Andamento", className: "bg-purple-100 text-purple-800 border-purple-200" },
  completed: { label: "Concluída", className: "bg-green-100 text-green-800 border-green-200" },
  // Stops
  en_route: { label: "A Caminho", className: "bg-blue-100 text-blue-800 border-blue-200" },
  not_delivered: { label: "Não Entregue", className: "bg-red-100 text-red-800 border-red-200" },
  // Priority
  low: { label: "Baixa", className: "bg-gray-100 text-gray-800 border-gray-200" },
  normal: { label: "Normal", className: "bg-blue-100 text-blue-800 border-blue-200" },
  high: { label: "Alta", className: "bg-orange-100 text-orange-800 border-orange-200" },
  urgent: { label: "Urgente", className: "bg-red-100 text-red-800 border-red-200" },
};

export default function StatusBadge({ status, customLabel }) {
  const config = statusStyles[status] || { label: status, className: "bg-gray-100 text-gray-800 border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {customLabel || config.label}
    </span>
  );
}