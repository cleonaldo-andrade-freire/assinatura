import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PriceTableItem } from "@/lib/database.types";

/** Duplica uma tabela de preço inteira (nome + todos os tratamentos) —
 * facilita montar uma tabela nova parecida com uma que já existe (ex.: um
 * convênio com valores um pouco diferentes do particular), em vez de
 * recadastrar tudo. A cópia nunca nasce como padrão, mesmo se a original for. */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: original } = await supabase
    .from("price_tables")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!original) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: copy, error: copyError } = await supabase
    .from("price_tables")
    .insert({ clinic_id: clinic.id, name: `${original.name} (cópia)`, is_default: false })
    .select("*")
    .single();
  if (copyError || !copy) {
    return NextResponse.json({ error: "insert_failed", message: copyError?.message }, { status: 500 });
  }

  const { data: items } = await supabase.from("price_table_items").select("*").eq("price_table_id", original.id).eq("clinic_id", clinic.id);
  const originalItems = (items as PriceTableItem[]) ?? [];

  if (originalItems.length > 0) {
    const { error: itemsError } = await supabase.from("price_table_items").insert(
      originalItems.map((item) => ({
        clinic_id: clinic.id,
        price_table_id: copy.id,
        specialty: item.specialty,
        name: item.name,
        price: item.price,
        active: item.active,
        display_order: item.display_order,
      }))
    );
    if (itemsError) {
      return NextResponse.json({ error: "items_insert_failed", message: itemsError.message, priceTableId: copy.id }, { status: 500 });
    }
  }

  return NextResponse.json({ priceTable: copy }, { status: 201 });
}
