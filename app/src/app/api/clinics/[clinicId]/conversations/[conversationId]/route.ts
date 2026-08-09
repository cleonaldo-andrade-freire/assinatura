import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentClinic } from "@/lib/auth";

/**
 * Cancela uma anamnese em andamento (status "active" -> "abandoned"). Não apaga o
 * registro: mantém o histórico, só libera o paciente pra começar uma anamnese nova
 * (o webhook da Evolution só considera conversas com status "active"). Usa a chave
 * de serviço pro update, como o resto do motor de conversa — a policy de RLS em
 * "conversations" só cobre select pela sessão da clínica.
 */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; conversationId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", params.conversationId)
    .eq("clinic_id", clinic.id)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Apaga de vez uma anamnese cancelada (só "abandoned" — uma ativa precisa ser
 * cancelada primeiro, e uma completa nunca é apagada por aqui, é histórico real).
 */
export async function DELETE(req: NextRequest, { params }: { params: { clinicId: string; conversationId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { error, count } = await supabase
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", params.conversationId)
    .eq("clinic_id", clinic.id)
    .eq("status", "abandoned");

  if (error) {
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "not_found_or_not_abandoned" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
