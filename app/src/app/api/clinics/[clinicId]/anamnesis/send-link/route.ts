import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentClinic } from "@/lib/auth";
import { canAcceptAnamnesis } from "@/lib/billing";
import { countTotalAnamneses } from "@/lib/usage";
import { sendText } from "@/lib/evolution";
import { upsertPatientFromContact } from "@/lib/patients";
import { createAnamnesis } from "@/lib/anamnesis";

const bodySchema = z.object({
  patient_name: z.string().min(1),
  patient_phone: z.string().min(8),
  template_id: z.string().uuid(),
});

/**
 * Dispara o link da nova Anamnese Web para o paciente via WhatsApp.
 * Autenticado pela sessão do painel da clínica.
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
        message: error === "trial_limit_reached"
            ? `O período de teste cobre até 3 anamneses. Assine um plano em Configurações → Assinatura pra continuar.`
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

  const { data: template } = await sessionClient
    .from("question_templates")
    .select("questions")
    .eq("id", input.template_id)
    .eq("clinic_id", clinic.id)
    .single();

  if (!template) {
    return NextResponse.json({ error: "template_not_found" }, { status: 404 });
  }

  const questions = template.questions as any[];
  const initialAnswers = questions.map(q => ({
    question: q.text || q.question || "Pergunta",
    answer: "" // Empty answer to be filled by the patient
  }));

  const adminClient = createSupabaseAdminClient();
  
  // Cria a anamnese pendente (vazia, mas com as perguntas do modelo)
  const anamnesis = await createAnamnesis(adminClient, {
    clinicId: clinic.id,
    patientName: input.patient_name,
    patientPhone: phone,
    answers: initialAnswers
  });

  if (!anamnesis) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await upsertPatientFromContact(adminClient, clinic.id, input.patient_name, phone);

  // Envia o link pelo WhatsApp
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/anamnese/${anamnesis.token}`;
  const text = `Olá, ${input.patient_name}! Aqui é da clínica ${clinic.name}.\n\nPor favor, preencha sua ficha de anamnese no link abaixo antes do seu atendimento:\n\n${link}`;
  
  await sendText(clinic, phone, text);

  return NextResponse.json({ ok: true, token: anamnesis.token }, { status: 201 });
}
