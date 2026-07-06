import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Regenera o PIN de um motorista. Feito no servidor para que a escrita em
// User (campo driver_pin de OUTRO usuário) não fique aberta no cliente —
// só um membro da mesma empresa pode fazer, e apenas sobre motoristas
// daquela empresa. Sem isso, travar a entidade User quebraria a gestão de
// motoristas; deixá-la aberta manteria o furo de escrita cruzada.

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
    if (!user.company_id) return Response.json({ error: 'Usuário sem empresa vinculada.' }, { status: 403 });

    const { driver_id } = await req.json().catch(() => ({}));
    if (!driver_id) return Response.json({ error: 'driver_id required' }, { status: 400 });

    const sr = base44.asServiceRole;
    const drivers = await sr.entities.User.filter({ id: driver_id });
    const driver = drivers[0];
    if (!driver) return Response.json({ error: 'Motorista não encontrado.' }, { status: 404 });

    // Só motoristas da mesma empresa do solicitante.
    if (driver.company_id !== user.company_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!driver.is_driver && !driver.driver_pin) {
      return Response.json({ error: 'Usuário-alvo não é motorista.' }, { status: 400 });
    }

    const pin = generatePin();
    await sr.entities.User.update(driver.id, { driver_pin: pin });

    return Response.json({ ok: true, driver_pin: pin });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
