import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Cota mensal de chamadas ao motor de rotas pago (Mapbox), por empresa.
// O app chama esta função ANTES de cada operação de rota que vá custar uma
// requisição ao Mapbox (criar rota, recalcular trajeto, otimizar ordem).
//
// Modelo "leve": a contagem é centralizada aqui (compartilhada entre todos
// os usuários e dispositivos da empresa), mas a chamada ao Mapbox continua
// no navegador. Suficiente para controle de custo entre empresas legítimas.
//
// A empresa é derivada do usuário autenticado — o cliente NÃO escolhe o
// company_id, para não contar/gastar cota de outra empresa.

// Teto padrão por empresa/mês. O super-admin pode elevar por empresa via
// Company.routing_monthly_limit.
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
    if (!user.company_id) return Response.json({ error: 'Usuário sem empresa vinculada.' }, { status: 403 });

    const sr = base44.asServiceRole;
    const companyId = user.company_id;
    const period = currentPeriod();

    // Limite efetivo: valor por empresa, ou o padrão.
    const companies = await sr.entities.Company.filter({ id: companyId });
    const company = companies[0];
    const limit = Number(company?.routing_monthly_limit) > 0
      ? Number(company.routing_monthly_limit)
      : DEFAULT_MONTHLY_LIMIT;

    // Registro de uso do período (um por empresa por mês).
    const existing = await sr.entities.RoutingUsage.filter({ company_id: companyId, period });
    let usage = existing[0];
    const used = Number(usage?.count) || 0;

    if (used >= limit) {
      return Response.json({
        allowed: false,
        used,
        limit,
        remaining: 0,
        period,
      });
    }

    // Incrementa (cria o registro no primeiro uso do mês).
    const newCount = used + 1;
    if (usage) {
      await sr.entities.RoutingUsage.update(usage.id, { count: newCount });
    } else {
      usage = await sr.entities.RoutingUsage.create({ company_id: companyId, period, count: newCount });
    }

    return Response.json({
      allowed: true,
      used: newCount,
      limit,
      remaining: Math.max(0, limit - newCount),
      period,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
