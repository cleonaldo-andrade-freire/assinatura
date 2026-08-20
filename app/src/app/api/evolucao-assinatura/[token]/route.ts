import { NextRequest, NextResponse } from "next/server";
import { isValidToken } from "@/lib/validation";
import { getEvolutionStatusByToken } from "@/lib/evolutionSignature";

/** Status inicial ao abrir o link — sem paciente logado, o token é a
 * credencial. Nome do paciente vem mascarado (confirma que chegou à
 * pessoa certa sem vazar dado se o celular for de terceiro). */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const status = await getEvolutionStatusByToken(params.token);
  if (!status.found) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(status);
}
