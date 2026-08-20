import crypto from "crypto";

/**
 * Sessão curta pós-verificação do segundo fator (§13 do prompt original:
 * "JWT de 15 min, escopo restrito à solicitação"). Em vez de trazer uma
 * biblioteca JWT nova só pra isso, um token HMAC-assinado dá a mesma
 * garantia prática (curta duração, escopo restrito a UM token de evolução,
 * não falsificável sem o segredo) com `crypto` nativo do Node.
 */
const SESSION_TTL_SECONDS = 15 * 60;

function getSecret(): string {
  const secret = process.env.EVOLUTION_SIGNATURE_SESSION_SECRET;
  if (!secret) {
    throw new Error("EVOLUTION_SIGNATURE_SESSION_SECRET não configurado — ver .env.example.");
  }
  return secret;
}

export function issueSessionToken(evolutionToken: string): { value: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${evolutionToken}.${expiresAt}`;
  const signature = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  return { value: `${payload}.${signature}`, expiresAt };
}

/** Retorna `true` só se o cookie foi emitido pra ESTE token de evolução
 * específico e ainda não expirou — impede reaproveitar a sessão de um
 * documento pra ler/assinar outro. */
export function verifySessionToken(cookieValue: string | undefined, evolutionToken: string): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [tokenPart, expiresAtPart, signature] = parts;
  if (tokenPart !== evolutionToken) return false;

  const expiresAt = Number(expiresAtPart);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expectedSignature = crypto.createHmac("sha256", getSecret()).update(`${tokenPart}.${expiresAtPart}`).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expectedSignature, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionCookieName(evolutionToken: string): string {
  // Um cookie por token de evolução — abrir dois links de evolução em abas
  // diferentes do mesmo navegador não derruba a sessão um do outro.
  return `evo_sig_${evolutionToken.slice(0, 8)}`;
}
