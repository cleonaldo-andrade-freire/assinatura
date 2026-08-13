import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PriceTable, PriceTableItem } from "@/lib/database.types";

/**
 * Todas as tabelas de preço da clínica com seus tratamentos, numa única
 * chamada — usado pelo modal "Novo orçamento" pra montar os selects em
 * cascata (Plano -> Tratamento -> Valor) sem N+1 requisição por tabela.
 */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: tablesData }, { data: itemsData }] = await Promise.all([
    supabase.from("price_tables").select("*").eq("clinic_id", clinic.id).order("name", { ascending: true }),
    supabase
      .from("price_table_items")
      .select("*")
      .eq("clinic_id", clinic.id)
      .order("specialty", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true }),
  ]);

  const tables = (tablesData as PriceTable[]) ?? [];
  const items = (itemsData as PriceTableItem[]) ?? [];

  const catalog = tables.map((t) => ({
    ...t,
    items: items.filter((i) => i.price_table_id === t.id),
  }));

  return NextResponse.json({ priceTables: catalog });
}
