import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Edição do perfil da empresa (tela Configurações) feita no servidor. Só os
// campos de perfil são aceitos — status, access_expires_at, last_pin_used e
// routing_monthly_limit NUNCA são tocados aqui, então o cliente não pode
// se auto-liberar a licença nem aumentar a própria cota.

const ALLOWED_FIELDS = [
  'name', 'cnpj', 'phone', 'address', 'admin_email',
  'departure_address', 'departure_lat', 'departure_lng',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.company_id) return Response.json({ error: 'Usuário sem empresa vinculada.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));

    // Só pode editar a própria empresa.
    const targetId = body?.company_id || user.company_id;
    if (targetId !== user.company_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clean: Record<string, unknown> = {};
    for (const k of ALLOWED_FIELDS) {
      if (body[k] !== undefined) clean[k] = body[k];
    }
    if (clean.admin_email) clean.admin_email = String(clean.admin_email).trim().toLowerCase();

    const sr = base44.asServiceRole;
    await sr.entities.Company.update(user.company_id, clean);

    return Response.json({ ok: true, patch: clean });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
