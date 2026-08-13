import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

/**
 * Exclusão em lote do painel "Cancelamentos" — pedido explícito pra enxugar
 * a lista de uma vez, sem precisar clicar item por item. Mesmo efeito do
 * dismiss avulso: some da lista de acompanhamento, não mexe no agendamento
 * nem no cadastro do paciente.
 */
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
  const { error } = await supabase
    .from("appointments")
    .update({ cancellation_dismissed_at: new Date().toISOString() })
    .eq("clinic_id", clinic.id)
    .in("id", parsed.data.ids);

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
