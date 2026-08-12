import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Busca no conjunto inicial de códigos CID (capítulo odontológico, K00-K14 — ver
 * `supabase/013_cid10.sql`). Não é escopado por clínica: é dado de referência
 * compartilhado, só exige que o usuário esteja logado em alguma clínica.
 */
export async function GET(req: NextRequest) {
  const clinic = await getCurrentClinic();
  if (!clinic) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ codes: [] });
  }

  // Duas buscas separadas (em vez de `.or()` com a string interpolada) pra não
  // deixar caracteres do `q` do usuário virarem sintaxe do filtro do PostgREST.
  const supabase = await createSupabaseServerClient();
  const [byCode, byDescription] = await Promise.all([
    supabase.from("cid_codes").select("code, description").ilike("code", `${q}%`).limit(15),
    supabase.from("cid_codes").select("code, description").ilike("description", `%${q}%`).limit(15),
  ]);

  const seen = new Set<string>();
  const codes: { code: string; description: string }[] = [];
  for (const row of [...(byCode.data ?? []), ...(byDescription.data ?? [])]) {
    if (seen.has(row.code)) continue;
    seen.add(row.code);
    codes.push(row);
    if (codes.length >= 15) break;
  }

  return NextResponse.json({ codes });
}
