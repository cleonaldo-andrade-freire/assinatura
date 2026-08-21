import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/evolution";
import { formatValidationCode } from "@/lib/validationCode";

/**
 * Reenvia manualmente pro WhatsApp do paciente o link do documento de
 * evolução já assinado — mesmo texto/link que `finishAndNotify` (ver
 * evolutionDentistSignature.ts) manda automaticamente quando a dentista
 * contra-assina, só que sob demanda (ex.: a mensagem automática falhou, ou o
 * paciente pediu de novo). Usa o client admin (não o de sessão) pra ler
 * `treatment_evolution_signatures` — essa tabela não tem RLS/policy (ver
 * migration 052), mesmo padrão já usado em
 * `api/evolucao-assinatura/[token]/pdf/route.ts`. O acesso continua
 * protegido pela checagem de sessão logo acima + o filtro por clinic_id.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("id, patient_id, signature_status, dentist_signature_status")
    .eq("id", params.evolutionId)
    .eq("clinic_id", params.clinicId)
    .maybeSingle();
  if (!evolution) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (evolution.signature_status !== "assinada") {
    return NextResponse.json({ error: "patient_not_signed", message: "O paciente ainda não assinou essa evolução." }, { status: 400 });
  }

  const { data: signature } = await supabase
    .from("treatment_evolution_signatures")
    .select("verification_code")
    .eq("treatment_evolution_id", evolution.id)
    .maybeSingle();
  if (!signature) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: patient } = await supabase.from("patients").select("phone").eq("id", evolution.patient_id).maybeSingle();
  if (!patient?.phone) {
    return NextResponse.json({ error: "patient_no_phone", message: "Este paciente não tem WhatsApp cadastrado." }, { status: 400 });
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/validar-evolucao/${signature.verification_code}`;
  const message =
    evolution.dentist_signature_status === "assinada"
      ? `✅ A doutora confirmou o registro do seu atendimento. O documento completo (com as duas assinaturas) está disponível aqui: ${link}\n\nCódigo de verificação: ${formatValidationCode(signature.verification_code)}`
      : `Aqui está o documento do seu atendimento: ${link}\n\nCódigo de verificação: ${formatValidationCode(signature.verification_code)}`;

  const sent = await sendText(clinic, patient.phone, message);
  if (!sent) {
    return NextResponse.json({ error: "send_failed", message: "Falha ao enviar pelo WhatsApp." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
