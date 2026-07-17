import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Criação do convite de vendedor feita no servidor: força company_id para
// a empresa do solicitante e recusa quando quem convida é motorista ou já
// é vendedor — só o gestor da empresa pode definir as permissões iniciais
// de outro vendedor (impede escalonamento lateral). O envio do e-mail de
// convite continua no cliente (base44.users.inviteUser), igual ao fluxo
// já existente para motoristas.

const ALLOWED_PERMISSION_KEYS = [
  'orders', 'products', 'vehicles', 'drivers', 'loads', 'routes',
  'tracking', 'notifications', 'analytics', 'maintenance', 'reports', 'settings',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.company_id) return Response.json({ error: 'Usuário sem empresa vinculada.' }, { status: 403 });
    if (user.is_driver || user.is_seller) {
      return Response.json({ error: 'Somente o gestor da empresa pode cadastrar vendedores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'E-mail é obrigatório.' }, { status: 400 });

    const sr = base44.asServiceRole;

    const existingInvites = await sr.entities.SellerInvite.filter({
      email, company_id: user.company_id, status: 'pending',
    });
    if (existingInvites.length > 0) {
      return Response.json({ error: 'Já existe um convite pendente para este e-mail.' }, { status: 409 });
    }

    const permissions: Record<string, boolean> = {};
    for (const k of ALLOWED_PERMISSION_KEYS) {
      permissions[k] = !!body?.permissions?.[k];
    }

    const invite = await sr.entities.SellerInvite.create({
      email,
      full_name: body?.full_name || undefined,
      phone: body?.phone || undefined,
      company_id: user.company_id,
      permissions,
      status: 'pending',
    });

    return Response.json({ ok: true, invite });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
