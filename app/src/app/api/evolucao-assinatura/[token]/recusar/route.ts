import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidToken } from "@/lib/validation";
import { refuseEvolutionSignature } from "@/lib/evolutionSignature";
import { verifySessionToken, sessionCookieName } from "@/lib/evolutionSignatureSession";

const bodySchema = z.object({ reason: z.string().trim().max(1000).nullable().optional() });

/** Recusa de assinatura — notifica a clínica na hora (ver
 * notifyClinicEvolutionRefused em evolutionSignature.ts). Também exige a
 * sessão de segundo fator: recusar é uma decisão do paciente identificado,
 * não uma ação anônima disponível a quem só tem o link. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cookie = req.cookies.get(sessionCookieName(params.token))?.value;
  if (!verifySessionToken(cookie, params.token)) {
    return NextResponse.json({ error: "session_required" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent");

  const result = await refuseEvolutionSignature(params.token, parsed.data.reason ?? null, ip, userAgent);
  if (!result.ok) {
    const statusByError: Record<string, number> = { not_found: 404, invalid_status: 409 };
    return NextResponse.json({ error: result.error }, { status: statusByError[result.error] ?? 400 });
  }

  return NextResponse.json({ ok: true });
}
