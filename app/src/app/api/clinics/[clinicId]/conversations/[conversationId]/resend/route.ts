import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentClinic } from "@/lib/auth";
import { sendText } from "@/lib/evolution";
import { formatQuestionPrompt } from "@/lib/conversationEngine";
import type { Conversation, Question } from "@/lib/database.types";

/**
 * Reenvia a pergunta atual de uma anamnese em andamento (o paciente pode ter
 * ignorado/perdido a mensagem). Se a anamnese estava cancelada ("abandoned"),
 * reativa antes de reenviar — é o "continuar de onde parou": mantém current_index
 * e answers, só volta a aceitar respostas.
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; conversationId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", params.conversationId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const typedConversation = conversation as Conversation;
  if (typedConversation.status === "completed") {
    return NextResponse.json({ error: "already_completed" }, { status: 400 });
  }

  if (typedConversation.status === "abandoned") {
    await supabase
      .from("conversations")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", typedConversation.id);
  }

  const question = typedConversation.questions[typedConversation.current_index] as Question | undefined;
  if (!question) {
    return NextResponse.json({ error: "no_pending_question" }, { status: 400 });
  }

  await sendText(clinic, typedConversation.patient_phone, formatQuestionPrompt(question));

  return NextResponse.json({ ok: true });
}
