import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentClinic } from "@/lib/auth";
import { canAcceptAnamnesis } from "@/lib/billing";
import { countTotalAnamneses } from "@/lib/usage";
import { sendText } from "@/lib/evolution";
import { formatQuestionPrompt } from "@/lib/conversationEngine";
import type { Question } from "@/lib/database.types";

const bodySchema = z.object({
  patient_name: z.string().min(1),
  patient_phone: z.string().min(8),
  template_id: z.string().uuid(),
});

/**
 * Dispara uma anamnese nova pelo motor de conversa próprio: a recepção da clínica
 * escolhe o modelo e o telefone do paciente, e o app manda a primeira pergunta
 * via Evolution API. Autenticado pela sessão do painel (não por X-Api-Key).
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const sessionClient = await createSupabaseServerClient();
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const trialUsed = clinic.subscription_status === "trialing" ? await countTotalAnamneses(sessionClient, clinic.id) : 0;
  if (!canAcceptAnamnesis(clinic, trialUsed)) {
    const error = clinic.subscription_status === "trialing" ? "trial_limit_reached" : "subscription_inactive";
    return NextResponse.json(
      {
        error,
        message:
          error === "trial_limit_reached"
            ? `O período de teste cobre até 3 anamneses. Assine um plano em /billing pra continuar.`
            : "Assinatura inativa.",
      },
      { status: 402 }
    );
  }

  if (!clinic.evolution_base_url || !clinic.evolution_instance_name || !clinic.evolution_api_key) {
    return NextResponse.json({ error: "evolution_not_configured" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const phone = input.patient_phone.replace(/\D/g, "");

  // Confere o template com o cliente com sessão (RLS garante que é da própria clínica).
  const { data: template } = await sessionClient
    .from("question_templates")
    .select("id, questions")
    .eq("id", input.template_id)
    .eq("clinic_id", clinic.id)
    .single();

  if (!template) {
    return NextResponse.json({ error: "template_not_found" }, { status: 404 });
  }

  const questions = template.questions as Question[];
  if (questions.length === 0) {
    return NextResponse.json({ error: "template_empty" }, { status: 400 });
  }

  // A partir daqui usamos a chave de serviço: quem envia/recebe mensagem no
  // WhatsApp é o app rodando no servidor, sem sessão de usuário associada.
  const adminClient = createSupabaseAdminClient();
  const { data: conversation, error } = await adminClient
    .from("conversations")
    .insert({
      clinic_id: clinic.id,
      template_id: template.id,
      patient_name: input.patient_name,
      patient_phone: phone,
      questions,
      current_index: 0,
      answers: [],
      status: "active",
    })
    .select("id")
    .single();

  if (error || !conversation) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }

  await sendText(
    clinic,
    phone,
    `Olá, ${input.patient_name}! Vamos preencher sua anamnese antes da consulta. Leva menos de 3 minutos.`
  );
  await sendText(clinic, phone, formatQuestionPrompt(questions[0]));

  return NextResponse.json({ conversation_id: conversation.id }, { status: 201 });
}
