import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Resgate de PIN de acesso feito no servidor (service role).
// Antes isso era feito no cliente, o que exigia que qualquer usuário
// autenticado pudesse ler AccessPin e escrever em Company — permitindo
// ativar o acesso sem PIN válido. Aqui toda a validação e escrita
// acontecem no backend; o cliente só envia o código digitado.

// Mesma regra de computeExpiresAt do cliente: renovação antecipada soma
// os dias ao prazo restante; acesso expirado conta a partir de agora.
function computeExpiresAt(currentExpiresAt: string | null | undefined, durationDays: number): string {
  const now = new Date();
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pin } = await req.json();
    const code = typeof pin === 'string' ? pin.trim().toUpperCase() : '';
    if (code.length < 6) {
      return Response.json({ error: 'PIN inválido.' }, { status: 400 });
    }

    if (!user.company_id) {
      return Response.json({ error: 'Usuário sem empresa vinculada.' }, { status: 403 });
    }

    const sr = base44.asServiceRole;
    const companies = await sr.entities.Company.filter({ id: user.company_id });
    const company = companies[0];
    if (!company) {
      return Response.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }
    if (company.status === 'suspended') {
      return Response.json({ error: 'Conta suspensa. Entre em contato com o suporte.' }, { status: 403 });
    }

    const candidates = await sr.entities.AccessPin.filter({ pin: code });

    // Aceita PIN disponível OU PIN já resgatado pela própria empresa
    // (o mesmo PIN vale enquanto o acesso estiver dentro do prazo).
    const match = candidates.find((p) =>
      p.status === 'available' ||
      (p.status === 'redeemed' && p.redeemed_by_company_id === company.id)
    );

    if (!match) {
      if (candidates.find((p) => p.status === 'redeemed')) {
        return Response.json({ error: 'Este PIN foi utilizado por outra empresa.' }, { status: 409 });
      }
      if (candidates.find((p) => p.status === 'expired')) {
        return Response.json({ error: 'Este PIN foi invalidado. Solicite um novo ao administrador.' }, { status: 410 });
      }
      return Response.json({ error: 'PIN não encontrado. Verifique e tente novamente.' }, { status: 404 });
    }

    // PIN emitido para um email específico só vale para a empresa dona dele.
    if (match.assigned_company_email &&
        match.assigned_company_email.toLowerCase() !== (company.owner_email || '').toLowerCase()) {
      return Response.json({ error: 'Este PIN foi emitido para outra conta.' }, { status: 403 });
    }

    const newExpiresAt = computeExpiresAt(company.access_expires_at, match.duration_days);
    const patch = {
      status: 'active',
      access_expires_at: newExpiresAt,
      last_pin_used: match.pin,
    };

    // Marca o PIN como resgatado ANTES de liberar a empresa para evitar
    // que dois resgates simultâneos usem o mesmo PIN duas vezes.
    if (match.status === 'available') {
      await sr.entities.AccessPin.update(match.id, {
        status: 'redeemed',
        redeemed_by_company_id: company.id,
        redeemed_at: new Date().toISOString(),
      });
    }
    await sr.entities.Company.update(company.id, patch);

    return Response.json({ ok: true, company: patch });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
