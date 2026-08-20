import { NextRequest, NextResponse } from "next/server";
import { isValidToken } from "@/lib/validation";
import { getEvolutionDocument, markDocumentDisplayed } from "@/lib/evolutionSignature";
import { verifySessionToken, sessionCookieName } from "@/lib/evolutionSignatureSession";

/** Conteúdo completo da evolução — só depois do segundo fator confirmado
 * (sessão curta em cookie httpOnly, ver /verificar). */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cookie = req.cookies.get(sessionCookieName(params.token))?.value;
  if (!verifySessionToken(cookie, params.token)) {
    return NextResponse.json({ error: "session_required" }, { status: 401 });
  }

  const document = await getEvolutionDocument(params.token);
  if (!document) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await markDocumentDisplayed(params.token, ip, req.headers.get("user-agent"));

  return NextResponse.json(document);
}
