import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  specialty: z.string().trim().min(1).nullable(),
});

/**
 * Exclui uma especialidade inteira (todos os tratamentos dela) de uma
 * tabela de preço — só permite se nenhum desses tratamentos já foi usado
 * num orçamento (senão a linha do orçamento salvo perderia a referência ao
 * catálogo original; o nome/valor continuam gravados na própria linha, mas
 * o vínculo com o item de origem se perderia).
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { specialty } = parsed.data;

  const supabase = await createSupabaseServerClient();
  let itemsQuery = supabase.from("price_table_items").select("id").eq("price_table_id", params.id).eq("clinic_id", clinic.id);
  itemsQuery = specialty === null ? itemsQuery.is("specialty", null) : itemsQuery.eq("specialty", specialty);
  const { data: items } = await itemsQuery;
  const itemIds = (items ?? []).map((i) => i.id);

  if (itemIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const { count: usageCount } = await supabase
    .from("budget_items")
    .select("id", { count: "exact", head: true })
    .in("price_table_item_id", itemIds);

  if ((usageCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "in_use", message: "Um ou mais tratamentos dessa especialidade já foram usados em orçamentos — não é possível excluir." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("price_table_items").delete().in("id", itemIds);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: itemIds.length });
}
