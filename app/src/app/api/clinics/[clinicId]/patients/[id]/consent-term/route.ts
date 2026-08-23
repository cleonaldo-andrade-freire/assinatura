import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentClinic } from "@/lib/auth";
import { sendText } from "@/lib/evolution";
import { hashConsentText } from "@/lib/electronicConsent";

export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const sessionClient = await createSupabaseServerClient();
  const clinic = await getCurrentClinic();
  
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!clinic.evolution_base_url || !clinic.evolution_instance_name || !clinic.evolution_api_key) {
    return NextResponse.json({ error: "evolution_not_configured" }, { status: 400 });
  }

  if (!clinic.consent_term_text || !clinic.consent_term_version) {
    return NextResponse.json({ error: "consent_term_not_configured", message: "Configure o Termo de Adesão nas Configurações da clínica primeiro." }, { status: 400 });
  }

  // Verificar o paciente
  const { data: patient } = await sessionClient
    .from("patients")
    .select("id, name, phone, cpf")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "patient_not_found" }, { status: 404 });
  }

  if (!patient.phone) {
    return NextResponse.json({ error: "patient_no_phone", message: "O paciente precisa ter um celular (WhatsApp) cadastrado." }, { status: 400 });
  }

  if (!patient.cpf) {
    return NextResponse.json({ error: "patient_no_cpf", message: "O paciente precisa ter CPF cadastrado para validação de segurança." }, { status: 400 });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const adminClient = createSupabaseAdminClient();

  const termHash = hashConsentText(clinic.consent_term_text);

  // Expira em 7 dias
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error: insertError } = await adminClient.from("consent_term_signatures").insert({
    clinic_id: clinic.id,
    patient_id: patient.id,
    token,
    status: "aguardando_assinatura",
    expires_at: expiresAt.toISOString(),
    term_version: clinic.consent_term_version,
    term_text_hash: termHash,
    phone_e164: patient.phone,
  });

  if (insertError) {
    console.error("Falha ao criar request do termo:", insertError);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/termo-assinatura/${token}`;
  const message =
    `Olá, ${patient.name.split(" ")[0]}! Aqui é da clínica ${clinic.name}.\n\n` +
    `Por favor, precisamos que você leia e assine digitalmente o nosso *Termo de Consentimento e Adesão*.\n\n` +
    `Acesse o link abaixo para assinar na tela do celular:\n${link}\n\n` +
    `Qualquer dúvida, estamos à disposição!`;

  const sent = await sendText(clinic, patient.phone, message);

  if (sent) {
    await adminClient.from("consent_term_signatures").update({ sent_whatsapp_at: new Date().toISOString() }).eq("token", token);
  }

  return NextResponse.json({ ok: true, sent });
}
