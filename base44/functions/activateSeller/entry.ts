import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Ativação de vendedor feita no servidor: o convite (SellerInvite) é a
// fonte de verdade — só quem tem convite pendente para o próprio email
// vira vendedor, e o company_id + as permissões aplicadas são as do
// convite, nunca escolhidas pelo cliente.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;
    const invites = await sr.entities.SellerInvite.filter({
      email: user.email,
      status: 'pending',
    });
    const invite = invites[0];
    if (!invite) {
      return Response.json({ error: 'Nenhum convite pendente para este usuário.' }, { status: 404 });
    }

    const payload: Record<string, unknown> = {
      is_seller: true,
      permissions: invite.permissions || {},
      company_id: invite.company_id,
    };
    if (invite.full_name) payload.full_name = invite.full_name;
    if (invite.phone) payload.phone = invite.phone;

    await sr.entities.User.update(user.id, payload);
    await sr.entities.SellerInvite.update(invite.id, { status: 'activated' });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
