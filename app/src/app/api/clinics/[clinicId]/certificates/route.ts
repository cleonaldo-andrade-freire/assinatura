import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueCertificate } from "@/lib/certificates";
import { isValidCPF } from "@/lib/validation";
import { upsertPatientFromContact } from "@/lib/patients";

const bodySchema = z.object({
  patient_name: z.string().min(1),
  patient_cpf: z
    .string()
    .min(1)
    .optional()
    .refine((val) => !val || isValidCPF(val), { message: "CPF inválido" }),
  patient_phone: z.string().min(10).optional(),
  patient_id: z.string().uuid().optional(),

  reason: z.string().min(1),
  rest_days: z.number().int().min(0),
  care_date: z.string().min(1),
  starts_on: z.string().min(1),
  signerCertificatePem: z.string().optional(),
  // Via não assinada digitalmente (shell mobile v2, prompt §8) — default
  // false preserva o fluxo de assinatura normal pra quem não manda esse campo.
  unsigned: z.boolean().default(false),
});

/** Lista os atestados da clínica logada. RLS já garante que só vem o que é dela. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("certificates")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ certificates: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!clinic.dentist_name || !clinic.dentist_cro || !clinic.dentist_cro_uf) {
    return NextResponse.json({ error: "dentist_not_configured" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Escrita via chave de serviço — mesmo padrão de `anamneses`/`signatures`:
  // `certificates` não tem policy de insert pra usuário autenticado.
  const supabase = createSupabaseAdminClient();

  // Se o dentista não selecionou uma sugestão da busca (sem patient_id), cadastra
  // o paciente automaticamente aqui — no servidor, com os dados finais do envio,
  // em vez de depender de um clique manual no meio do preenchimento do formulário
  // (isso causava cadastro incompleto quando CPF/celular eram preenchidos depois
  // do clique em "cadastrar").
  let patientId: string | null | undefined = input.patient_id;
  let finalPhone = input.patient_phone ?? null;
  let finalCpf = input.patient_cpf ?? null;

  if (patientId) {
    const { data: patient } = await supabase.from("patients").select("phone, cpf").eq("id", patientId).single();
    if (patient) {
      if (!finalPhone) finalPhone = patient.phone;
      if (!finalCpf) finalCpf = patient.cpf;
    }
  } else {
    patientId = await upsertPatientFromContact(supabase, clinic.id, input.patient_name, input.patient_phone, input.patient_cpf);
  }

  const { data: certificate, error } = await supabase
    .from("certificates")
    .insert({
      clinic_id: clinic.id,
      patient_name: input.patient_name,
      patient_cpf: finalCpf,
      patient_phone: finalPhone,
      patient_id: patientId ?? null,
      dentist_name: clinic.dentist_name,
      dentist_cro: clinic.dentist_cro,
      dentist_cro_uf: clinic.dentist_cro_uf,

      reason: input.reason,
      rest_days: input.rest_days,
      care_date: input.care_date,
      starts_on: input.starts_on,
    })
    .select("id")
    .single();

  if (error || !certificate) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }

  try {
    const issued = await issueCertificate(certificate.id, input.signerCertificatePem, input.unsigned);
    return NextResponse.json({ certificate: issued }, { status: 201 });
  } catch (err: any) {
    console.error("Erro no issueCertificate:", err);
    return NextResponse.json({ error: "issue_certificate_failed", message: err.message, stack: err.stack }, { status: 500 });
  }
}
