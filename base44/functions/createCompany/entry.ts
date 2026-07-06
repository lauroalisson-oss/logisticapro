import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Criação de empresa feita no servidor. O cliente não escreve na entidade
// Company diretamente — isso impede que alguém crie a própria empresa já
// com status "active" e burle a licença. Aqui só campos de perfil são
// aceitos; status e prazo de acesso são forçados pelo servidor.

const ALLOWED_FIELDS = ['name', 'cnpj', 'phone', 'address', 'admin_email'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Um usuário só cria uma empresa. Se já tem vínculo, recusa.
    if (user.company_id) {
      return Response.json({ error: 'Usuário já vinculado a uma empresa.' }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    if (!body?.name || !String(body.name).trim()) {
      return Response.json({ error: 'Nome da empresa é obrigatório.' }, { status: 400 });
    }

    // Copia apenas os campos permitidos.
    const clean: Record<string, unknown> = {};
    for (const k of ALLOWED_FIELDS) {
      if (body[k] != null) clean[k] = body[k];
    }
    if (clean.admin_email) clean.admin_email = String(clean.admin_email).trim().toLowerCase();

    const sr = base44.asServiceRole;
    // Nova empresa nasce travada aguardando PIN — status/acesso definidos aqui,
    // nunca pelo cliente.
    const company = await sr.entities.Company.create({
      ...clean,
      owner_email: user.email,
      status: 'pending_pin',
    });
    // Vincula o usuário à empresa (server-side, não via updateMe do cliente).
    await sr.entities.User.update(user.id, { company_id: company.id });

    return Response.json({ ok: true, company });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
