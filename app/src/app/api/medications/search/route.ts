import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Busca no conjunto curado de medicamentos comuns em odontologia (ver
 * `supabase/018_medications.sql`) e, pra cobrir o que não está nessa lista
 * pequena, complementa com a base de dados abertos da Anvisa importada em
 * `anvisa_medicamentos` (ver scripts/import-anvisa-medicamentos.ts) — o
 * curado vem primeiro (tem apresentação/dosagem sugerida), a Anvisa só
 * preenche o resto até o limite. Não é escopado por clínica: é dado de
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

  const LIMIT = 15;

  // Duas buscas separadas (em vez de `.or()` com a string interpolada) pra não
  // deixar caracteres do `q` do usuário virarem sintaxe do filtro do PostgREST
  // — mesmo cuidado já tomado em `/api/cid-codes/search`.
  const supabase = await createSupabaseServerClient();
  const [byName, byPresentation] = await Promise.all([
    supabase.from("medications").select("id, name, presentation, default_dosage").ilike("name", `%${q}%`).limit(LIMIT),
    supabase
      .from("medications")
      .select("id, name, presentation, default_dosage")
      .ilike("presentation", `%${q}%`)
      .limit(LIMIT),
  ]);

  const seenNames = new Set<string>();
  const medications: { id: string; name: string; presentation: string | null; default_dosage: string | null }[] = [];
  for (const row of [...(byName.data ?? []), ...(byPresentation.data ?? [])]) {
    const key = row.name.trim().toUpperCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    medications.push(row);
    if (medications.length >= LIMIT) break;
  }

  if (medications.length < LIMIT) {
    const { data: anvisaRows } = await supabase
      .from("anvisa_medicamentos")
      .select("id, nome_produto")
      .ilike("nome_produto", `%${q}%`)
      .order("nome_produto", { ascending: true })
      .limit(LIMIT - medications.length + seenNames.size); // margem pra sobrar após dedupe

    for (const row of anvisaRows ?? []) {
      const key = row.nome_produto.trim().toUpperCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      medications.push({ id: `anvisa:${row.id}`, name: row.nome_produto, presentation: null, default_dosage: null });
      if (medications.length >= LIMIT) break;
    }
  }

  return NextResponse.json({ medications });
}
