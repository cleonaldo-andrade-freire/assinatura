import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DENTAL_TREATMENT_SEED } from "@/lib/dentalTreatmentSeed";

/**
 * Popula a tabela com o catálogo padrão de especialidades/tratamentos —
 * só nomes, preço sempre 0 (ver comentário em `dentalTreatmentSeed.ts` do
 * porquê não existe um valor "real" pra sugerir). Pula o que já existe
 * (mesma especialidade + nome), pra poder rodar de novo sem duplicar se a
 * clínica já tinha adicionado um item igual manualmente.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existingData } = await supabase
    .from("price_table_items")
    .select("specialty, name")
    .eq("price_table_id", params.id)
    .eq("clinic_id", clinic.id);
  const existingKeys = new Set((existingData ?? []).map((i) => `${i.specialty ?? ""}::${i.name}`));

  const toInsert = DENTAL_TREATMENT_SEED.filter((seed) => !existingKeys.has(`${seed.specialty}::${seed.name}`)).map((seed, index) => ({
    clinic_id: clinic.id,
    price_table_id: params.id,
    specialty: seed.specialty,
    name: seed.name,
    price: 0,
    display_order: index,
  }));

  if (toInsert.length === 0) {
    return NextResponse.json({ added: 0 });
  }

  const { error } = await supabase.from("price_table_items").insert(toInsert);
  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ added: toInsert.length });
}
