// Super-admin da plataforma identificado pelo email. Adicione mais emails aqui
// se houver um time de operadores. A checagem é case-insensitive.
const PLATFORM_ADMIN_EMAILS = [
  "lauro.alisson@gmail.com",
];

export function isPlatformAdmin(user) {
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  return PLATFORM_ADMIN_EMAILS.includes(email);
}

// Durações que o super-admin pode gerar. Valor é em dias.
export const PIN_DURATIONS = [
  { days: 3, label: "3 dias" },
  { days: 15, label: "15 dias" },
  { days: 30, label: "1 mês" },
  { days: 90, label: "3 meses" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 ano" },
];

// Gera um PIN de 8 caracteres maiúsculos [A-Z0-9] sem caracteres ambíguos
// (0/O, 1/I/L). Usa crypto.getRandomValues com rejection sampling para
// evitar viés de módulo.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars, sem 0/O/1/I/L
export function generateAccessPin(len = 8) {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    // Fallback para ambientes sem WebCrypto.
    let out = "";
    for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return out;
  }
  const size = ALPHABET.length;
  const limit = Math.floor(256 / size) * size;
  const buf = new Uint8Array(len * 2);
  crypto.getRandomValues(buf);
  let out = "";
  let i = 0;
  while (out.length < len) {
    if (i >= buf.length) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    const b = buf[i++];
    if (b < limit) out += ALPHABET[b % size];
  }
  return out;
}

// Computa o novo access_expires_at após resgatar um PIN de duration_days.
// Regra: se ainda não expirou, soma dias ao restante (renovação
// antecipada não "queima" os dias). Se expirou/nunca foi ativo, conta
// a partir de agora.
export function computeExpiresAt(currentExpiresAt, durationDays) {
  const now = new Date();
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = current && current > now ? current : now;
  const next = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

// Dias restantes (fracionário), para banner de aviso e UI.
export function daysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms / (24 * 60 * 60 * 1000);
}

// A empresa pode acessar o sistema agora?
export function companyHasActiveAccess(company) {
  if (!company) return false;
  if (company.status !== "active") return false;
  const remaining = daysRemaining(company.access_expires_at);
  return remaining !== null && remaining > 0;
}
