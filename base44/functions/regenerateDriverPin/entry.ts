import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Regenera o PIN de acesso do app de campo para um motorista.
// A atualização direta via SDK na entidade User falha para usuários não-admin
// (a plataforma só permite admins atualizarem outros usuários). Aqui usamos
// o service role e validamos que o motorista-alvo pertence à mesma empresa do
// solicitante, para não expor cross-tenant.

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
    let user;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const driverId = body?.driver_id;
    if (!driverId) return Response.json({ error: 'driver_id required' }, { status: 400 });

    const sr = base44.asServiceRole;
    const target = await sr.entities.User.get(driverId);
    if (!target) return Response.json({ error: 'Motorista não encontrado.' }, { status: 404 });

    // Mesma-empresa (admin da plataforma passa direto).
    if (user.role !== 'admin' && target.company_id !== user.company_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Pin chaves só pra quem é driver; se ainda não for, mantém a restrição.
    if (!target.is_driver && !target.driver_pin) {
      return Response.json({ error: 'Usuário não é motorista.' }, { status: 400 });
    }

    const newPin = generatePin();
    await sr.entities.User.update(driverId, { driver_pin: newPin });

    return Response.json({ ok: true, driver_pin: newPin });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});