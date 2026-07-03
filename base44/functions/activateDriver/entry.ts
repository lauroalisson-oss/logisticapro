import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Ativação de motorista feita no servidor. O convite (DriverInvite) é a
// fonte de verdade: só quem tem convite pendente para o próprio email
// vira motorista, e o company_id aplicado é o do convite — nunca um
// valor escolhido pelo cliente.

function generatePin(): string {
  const max = 1_000_000;
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
  return String(n % max).padStart(6, '0');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;
    const invites = await sr.entities.DriverInvite.filter({
      email: user.email,
      status: 'pending',
    });
    const invite = invites[0];
    if (!invite) {
      return Response.json({ error: 'Nenhum convite pendente para este usuário.' }, { status: 404 });
    }

    const payload: Record<string, unknown> = {
      is_driver: true,
      driver_pin: invite.driver_pin || generatePin(),
    };
    if (invite.full_name) payload.full_name = invite.full_name;
    if (invite.phone) payload.phone = invite.phone;
    if (invite.cpf) payload.cpf = invite.cpf;
    if (invite.license_number) payload.license_number = invite.license_number;
    if (invite.license_category) payload.license_category = invite.license_category;
    if (invite.license_points) payload.license_points = Number(invite.license_points);
    if (invite.company_id) payload.company_id = invite.company_id;

    await sr.entities.User.update(user.id, payload);
    await sr.entities.DriverInvite.update(invite.id, { status: 'activated' });

    return Response.json({ ok: true, driver_pin: payload.driver_pin });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
