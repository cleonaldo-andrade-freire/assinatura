import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 horas

/**
 * Sessão de admin bem simples: um cookie assinado com a própria ADMIN_MASTER_KEY,
 * sem tabela de sessão nenhuma. Só existe um operador admin por enquanto — se isso
 * crescer pra várias pessoas com acesso, vale trocar por usuários de verdade.
 */
function secret(): string {
  const value = process.env.ADMIN_MASTER_KEY;
  if (!value) throw new Error("ADMIN_MASTER_KEY não configurado");
  return value;
}

function sign(exp: number): string {
  const body = Buffer.from(String(exp)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): boolean {
  const [body, mac] = token.split(".");
  if (!body || !mac) return false;

  const expectedMac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return false;
  }

  const exp = Number(Buffer.from(body, "base64url").toString());
  return Number.isFinite(exp) && exp > Date.now();
}

export async function createAdminSession() {
  const token = sign(Date.now() + MAX_AGE_SECONDS * 1000);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? verify(token) : false;
}

/** Pra rotas de API: aceita tanto o cookie de sessão quanto o header X-Admin-Key (uso via curl/script). */
export async function isAdminRequestAuthorized(headerKey: string | null): Promise<boolean> {
  if (headerKey && process.env.ADMIN_MASTER_KEY) {
    const a = Buffer.from(headerKey);
    const b = Buffer.from(process.env.ADMIN_MASTER_KEY);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return hasAdminSession();
}
