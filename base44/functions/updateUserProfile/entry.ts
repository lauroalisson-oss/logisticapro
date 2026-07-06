import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Edição do próprio perfil, feita no servidor. Só campos de perfil pessoal
// são aceitos — role, is_driver, driver_pin e company_id NUNCA são tocados
// aqui, então o usuário não pode virar admin nem entrar em outra empresa.
// (is_driver/company_id/driver_pin só são definidos por activateDriver e
// createCompany, também no backend.)

const ALLOWED_FIELDS = ['phone', 'cpf', 'license_number', 'license_category'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const clean: Record<string, unknown> = {};
    for (const k of ALLOWED_FIELDS) {
      if (body[k] !== undefined) clean[k] = body[k];
    }

    if (Object.keys(clean).length === 0) {
      return Response.json({ error: 'Nenhum campo de perfil válido.' }, { status: 400 });
    }

    // Atualiza somente o próprio registro de usuário.
    await base44.asServiceRole.entities.User.update(user.id, clean);

    return Response.json({ ok: true, patch: clean });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
