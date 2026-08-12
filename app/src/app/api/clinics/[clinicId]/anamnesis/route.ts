import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canAcceptAnamnesis } from "@/lib/billing";
import { safeEqual } from "@/lib/safeEqual";
import { createAnamnesis } from "@/lib/anamnesis";
import { chargeOverageIfNeeded, countTotalAnamneses } from "@/lib/usage";
import { upsertPatientFromContact } from "@/lib/patients";

const answerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const bodySchema = z.object({
  patient_name: z.string().min(1),
  patient_cpf: z.string().optional(),
  patient_phone: z.string().optional(),
  answers: z.array(answerSchema),
});

/**
 * Chamado pelo bloco de Webhook do Typebot ao final do questionário de anamnese
 * (usado hoje pela instância da Dra. Ewerjane). Não existe usuário logado aqui —
 * a autenticação é por X-Api-Key da clínica, e por isso usamos a chave de serviço
 * (bypassa RLS) depois de validar o api_key na mão.
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const supabase = createSupabaseAdminClient();

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", params.clinicId).single();
  if (!clinic) {
    return NextResponse.json({ error: "clinic_not_found" }, { status: 404 });
  }

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || !safeEqual(apiKey, clinic.api_key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const trialUsed = clinic.subscription_status === "trialing" ? await countTotalAnamneses(supabase, clinic.id) : 0;
  if (!canAcceptAnamnesis(clinic, trialUsed)) {
    const error = clinic.subscription_status === "trialing" ? "trial_limit_reached" : "subscription_inactive";
    return NextResponse.json({ error }, { status: 402 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const anamnesis = await createAnamnesis(supabase, {
    clinicId: clinic.id,
    patientName: input.patient_name,
    patientCpf: input.patient_cpf,
    patientPhone: input.patient_phone,
    answers: input.answers,
  });

  if (!anamnesis) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await upsertPatientFromContact(supabase, clinic.id, input.patient_name, input.patient_phone, input.patient_cpf);
  await chargeOverageIfNeeded(supabase, clinic, anamnesis.id);

  return NextResponse.json({ token: anamnesis.token }, { status: 201 });
}
