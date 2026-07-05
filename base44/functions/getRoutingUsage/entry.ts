import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Retorna o uso do motor de rotas no mês corrente, por empresa. Somente o
// super-admin da plataforma pode consultar. Usado no painel de Empresas
// para mostrar "usadas / limite" de cada empresa.

const PLATFORM_ADMIN_EMAILS = ['lauro.alisson@gmail.com'];
const DEFAULT_MONTHLY_LIMIT = 800;

function currentPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PLATFORM_ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sr = base44.asServiceRole;
    const period = currentPeriod();
    const records = await sr.entities.RoutingUsage.filter({ period });

    // Mapa company_id -> count no período.
    const usageByCompany: Record<string, number> = {};
    for (const r of records) {
      usageByCompany[r.company_id] = Number(r.count) || 0;
    }

    return Response.json({ period, usageByCompany, default_limit: DEFAULT_MONTHLY_LIMIT });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
