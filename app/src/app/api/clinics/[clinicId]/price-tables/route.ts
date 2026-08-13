import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  name: z.string().trim().min(1),
});

export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // A primeira tabela de preço da clínica já nasce padrão — sem isso, o
  // seletor de tratamento no orçamento não teria nenhuma pré-selecionada.
  const { count } = await supabase
    .from("price_tables")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic.id);

  const { data, error } = await supabase
    .from("price_tables")
    .insert({ clinic_id: clinic.id, name: parsed.data.name, is_default: (count ?? 0) === 0 })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ priceTable: data }, { status: 201 });
}
