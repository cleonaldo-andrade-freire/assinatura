import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  specialty: z.string().trim().min(1).nullable(),
  active: z.boolean(),
});

/** Ativa/desativa de uma vez todos os tratamentos de uma especialidade —
 * usado pelo botão "Ativar todos"/"Desativar todos" por grupo, pra não
 * precisar clicar item por item quando a clínica não trabalha aquela
 * especialidade inteira. */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("price_table_items")
    .update({ active: parsed.data.active, updated_at: new Date().toISOString() })
    .eq("price_table_id", params.id)
    .eq("clinic_id", clinic.id);
  query = parsed.data.specialty === null ? query.is("specialty", null) : query.eq("specialty", parsed.data.specialty);

  const { error } = await query;
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
