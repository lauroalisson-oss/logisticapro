import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Edição das permissões de um vendedor (ou revogação total do acesso),
// feita no servidor: só um gestor da mesma empresa (não motorista, não
// vendedor) pode alterar o que outro vendedor pode acessar — impede que
// um vendedor edite as próprias permissões ou as de outro vendedor.

const ALLOWED_PERMISSION_KEYS = [
  'orders', 'products', 'vehicles', 'drivers', 'loads', 'routes',
  'tracking', 'notifications', 'analytics', 'maintenance', 'reports', 'settings',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.is_driver || user.is_seller) {
      return Response.json({ error: 'Somente o gestor da empresa pode editar vendedores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const sellerId = body?.seller_id;
    if (!sellerId) return Response.json({ error: 'seller_id required' }, { status: 400 });

    const sr = base44.asServiceRole;
    const target = await sr.entities.User.get(sellerId);
    if (!target) return Response.json({ error: 'Vendedor não encontrado.' }, { status: 404 });
    if (target.company_id !== user.company_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!target.is_seller) {
      return Response.json({ error: 'Usuário-alvo não é vendedor.' }, { status: 400 });
    }

    if (body?.revoke) {
      await sr.entities.User.update(sellerId, { is_seller: false, permissions: {} });
      return Response.json({ ok: true, revoked: true });
    }

    const permissions: Record<string, boolean> = {};
    for (const k of ALLOWED_PERMISSION_KEYS) {
      permissions[k] = !!body?.permissions?.[k];
    }
    await sr.entities.User.update(sellerId, { permissions });

    return Response.json({ ok: true, permissions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
