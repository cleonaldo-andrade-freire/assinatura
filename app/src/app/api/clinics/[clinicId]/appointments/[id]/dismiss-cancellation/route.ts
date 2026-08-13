import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * "Excluir da lista" no painel "Cancelamentos" (item avulso — a exclusão em
 * lote fica em .../appointments/dismiss-cancellations). Não mexe no
 * agendamento nem no cadastro do paciente, só some da lista.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("appointments")
    .update({ cancellation_dismissed_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id);

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
