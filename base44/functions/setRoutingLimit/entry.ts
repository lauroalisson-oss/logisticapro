import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Ajusta o limite mensal de rotas de uma empresa. Somente o super-admin da
// plataforma pode alterar — a verificação acontece no servidor, então nem
// mesmo um usuário que burle a UI consegue mudar cotas.

const PLATFORM_ADMIN_EMAILS = ['lauro.alisson@gmail.com'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PLATFORM_ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { company_id, limit } = await req.json();
    if (!company_id) return Response.json({ error: 'company_id required' }, { status: 400 });

    const n = Math.max(0, Math.round(Number(limit) || 0));
    await base44.asServiceRole.entities.Company.update(company_id, { routing_monthly_limit: n });

    return Response.json({ ok: true, company_id, routing_monthly_limit: n });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
