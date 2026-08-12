import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Busca no conjunto inicial de medicamentos comuns em odontologia (ver
 * `supabase/018_medications.sql`). Não é escopado por clínica: é dado de
 * referência compartilhado, só exige que o usuário esteja logado em alguma
 * clínica.
 */
export async function GET(req: NextRequest) {
  const clinic = await getCurrentClinic();
  if (!clinic) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ medications: [] });
  }

  // Duas buscas separadas (em vez de `.or()` com a string interpolada) pra não
  // deixar caracteres do `q` do usuário virarem sintaxe do filtro do PostgREST
  // — mesmo cuidado já tomado em `/api/cid-codes/search`.
  const supabase = await createSupabaseServerClient();
  const [byName, byPresentation] = await Promise.all([
    supabase.from("medications").select("id, name, presentation, default_dosage").ilike("name", `%${q}%`).limit(15),
    supabase
      .from("medications")
      .select("id, name, presentation, default_dosage")
      .ilike("presentation", `%${q}%`)
      .limit(15),
  ]);

  const seen = new Set<string>();
  const medications: { id: string; name: string; presentation: string | null; default_dosage: string | null }[] = [];
  for (const row of [...(byName.data ?? []), ...(byPresentation.data ?? [])]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    medications.push(row);
    if (medications.length >= 15) break;
  }

  return NextResponse.json({ medications });
}
