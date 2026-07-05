import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Métricas operacionais detalhadas de UMA empresa, sob demanda. Somente o
// super-admin da plataforma pode consultar. Alimenta o painel de detalhes
// em Empresas (contagens + histórico de uso do motor de rotas).

const PLATFORM_ADMIN_EMAILS = ['lauro.alisson@gmail.com'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PLATFORM_ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { company_id } = await req.json();
    if (!company_id) return Response.json({ error: 'company_id required' }, { status: 400 });

    const sr = base44.asServiceRole;
    const cid = company_id;

    const [orders, routes, vehicles, loads, users, alerts, usage] = await Promise.all([
      sr.entities.Order.filter({ company_id: cid }),
      sr.entities.Route.filter({ company_id: cid }),
      sr.entities.Vehicle.filter({ company_id: cid }),
      sr.entities.Load.filter({ company_id: cid }),
      sr.entities.User.filter({ company_id: cid }),
      sr.entities.Alert.filter({ company_id: cid }),
      sr.entities.RoutingUsage.filter({ company_id: cid }),
    ]);

    const drivers = users.filter((u) => u.is_driver || u.driver_pin);

    const byStatus = (list: any[], statuses: string[]) =>
      list.filter((x) => statuses.includes(x.status)).length;

    // Histórico de uso de rotas, últimos 6 períodos (mais recente primeiro).
    const usageHistory = usage
      .map((r) => ({ period: r.period, count: Number(r.count) || 0 }))
      .sort((a, b) => (a.period < b.period ? 1 : -1))
      .slice(0, 6);

    return Response.json({
      company_id: cid,
      counts: {
        orders: orders.length,
        orders_pending: byStatus(orders, ['pending']),
        orders_delivered: byStatus(orders, ['delivered']),
        routes: routes.length,
        routes_active: byStatus(routes, ['started', 'in_progress']),
        routes_completed: byStatus(routes, ['completed']),
        vehicles: vehicles.length,
        loads: loads.length,
        drivers: drivers.length,
        users: users.length,
        alerts_pending: byStatus(alerts, ['pending']),
      },
      usageHistory,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
