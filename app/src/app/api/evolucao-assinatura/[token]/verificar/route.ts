import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidToken } from "@/lib/validation";
import { verifySecondFactor } from "@/lib/evolutionSignature";
import { issueSessionToken, sessionCookieName } from "@/lib/evolutionSignatureSession";

const bodySchema = z.object({ cpf: z.string().min(1) });

/** Segundo fator (CPF) — 5 tentativas por token, bloqueio de 30 min (ver
 * lib/rateLimit.ts, mesmo mecanismo do portal de validação pública). */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");

  const result = await verifySecondFactor(params.token, parsed.data.cpf, ip, userAgent);
  if (!result.ok) {
    const statusByError: Record<string, number> = { not_found: 404, expired: 410, blocked: 429, wrong: 401 };
    return NextResponse.json({ error: result.error }, { status: statusByError[result.error] ?? 400 });
  }

  let session: ReturnType<typeof issueSessionToken>;
  try {
    session = issueSessionToken(params.token);
  } catch (err) {
    // EVOLUTION_SIGNATURE_SESSION_SECRET ausente no ambiente é o caso mais
    // provável aqui — sem isso o segundo fator até confere certo, mas nunca
    // consegue emitir a sessão que libera o documento. Volta um JSON com
    // causa identificável em vez de deixar a exceção virar a página de erro
    // padrão da Vercel (sem corpo JSON, o frontend só mostra "tente de novo"
    // genérico e não dá pra saber o motivo pelo Network tab).
    console.error("Falha ao emitir sessão de assinatura de evolução:", err);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true, expires_at: session.expiresAt });
  res.cookies.set(sessionCookieName(params.token), session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.expiresAt - Math.floor(Date.now() / 1000),
  });
  return res;
}
