import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseInboundMessage, sendText } from "@/lib/evolution";
import { advanceConversation, formatQuestionPrompt } from "@/lib/conversationEngine";
import { createAnamnesis } from "@/lib/anamnesis";
import type { Conversation, Question } from "@/lib/database.types";

/**
 * Recebe eventos MESSAGES_UPSERT da Evolution API. Configure isso no "Set Webhook"
 * da instância de cada clínica (ver guia-deploy-saas.md). Sempre respondemos 200
 * rapidamente, mesmo quando ignoramos o evento — não queremos que a Evolution
 * fique retentando um webhook que não vamos processar mesmo.
 */
export async function POST(req: NextRequest, { params }: { params: { instanceName: string } }) {
  const payload = await req.json().catch(() => null);
  const inbound = parseInboundMessage(payload);

  if (!inbound || inbound.fromMe || !inbound.text) {
    console.log(
      `[evolution-webhook] instance=${params.instanceName} ignorado: inbound=${
        inbound ? JSON.stringify({ fromMe: inbound.fromMe, hasText: !!inbound.text }) : "não parseou o payload"
      }`
    );
    return NextResponse.json({ ok: true });
  }

  const supabase = createSupabaseAdminClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("evolution_instance_name", params.instanceName)
    .maybeSingle();
  if (!clinic) {
    console.log(`[evolution-webhook] instance=${params.instanceName} ignorado: nenhuma clínica com esse evolution_instance_name`);
    return NextResponse.json({ ok: true });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("patient_phone", inbound.phone)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    // Nenhuma anamnese em andamento pra esse número — não é uma resposta que esperávamos.
    console.log(
      `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} ignorado: nenhuma conversa ativa para o telefone ${inbound.phone}`
    );
    return NextResponse.json({ ok: true });
  }

  console.log(
    `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} conversation=${conversation.id} processando resposta`
  );

  const typedConversation = conversation as Conversation;
  const result = advanceConversation(
    typedConversation.questions,
    typedConversation.current_index,
    typedConversation.answers,
    inbound.text
  );

  if (result.kind === "clarify") {
    await sendText(clinic, inbound.phone, result.prompt);
    return NextResponse.json({ ok: true });
  }

  if (result.kind === "next") {
    await supabase
      .from("conversations")
      .update({
        current_index: result.nextIndex,
        answers: result.answers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", typedConversation.id);

    await sendText(clinic, inbound.phone, formatQuestionPrompt(result.question as Question));
    return NextResponse.json({ ok: true });
  }

  // result.kind === "done"
  const anamnesis = await createAnamnesis(supabase, {
    clinicId: clinic.id,
    patientName: typedConversation.patient_name,
    patientPhone: typedConversation.patient_phone,
    answers: result.answers,
  });

  await supabase
    .from("conversations")
    .update({ answers: result.answers, status: "completed", updated_at: new Date().toISOString() })
    .eq("id", typedConversation.id);

  if (anamnesis) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL}/assinatura?token=${anamnesis.token}`;
    await sendText(
      clinic,
      inbound.phone,
      `Perfeito! Agora é só confirmar suas respostas e assinar: ${link}`
    );
  }

  return NextResponse.json({ ok: true });
}
