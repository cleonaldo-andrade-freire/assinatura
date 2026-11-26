import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Dados do formulário da Anamnese Web (/anamnese/[token]) — tudo menos a
 * assinatura. Separado da assinatura de propósito: os dados são gravados
 * antes (rascunho a cada etapa e no começo do envio final), pra clínica
 * não perder o que o paciente preencheu se a assinatura falhar ou se ele
 * desistir na última tela.
 */
export const anamnesisFormSchema = z.object({
  patient_name: z.string().min(1),
  patient_cpf: z.string().optional().nullable(),
  patient_phone: z.string().optional().nullable(),
  birth_date: z.string().optional().nullable(),
  rg: z.string().optional().nullable(),
  occupation: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  // Ausente no rascunho da 1ª etapa (identificação): o paciente ainda não
  // respondeu as perguntas, e não queremos sobrescrever o modelo vazio.
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

export type AnamnesisFormData = z.infer<typeof anamnesisFormSchema>;

interface PendingAnamnesis {
  id: string;
  clinic_id: string;
  patient_cpf: string | null;
  patient_phone: string | null;
}

/**
 * Grava os dados do formulário na anamnese e no cadastro do paciente
 * (acha pelo telefone, depois pelo CPF; senão cria). Quando vêm respostas,
 * marca `filled_at` — é o que o painel usa pra mostrar "Preenchida, sem
 * assinatura". Quem chama garante que a anamnese ainda não foi assinada.
 */
export async function saveAnamnesisForm(
  supabase: SupabaseClient,
  anamnesis: PendingAnamnesis,
  form: AnamnesisFormData
): Promise<{ error: string | null; patientId: string | null }> {
  const cleanPhone = form.patient_phone?.replace(/\D/g, "") || anamnesis.patient_phone?.replace(/\D/g, "") || null;
  const cleanCpf = form.patient_cpf?.replace(/\D/g, "") || null;

  const { error: updateError } = await supabase
    .from("anamneses")
    .update({
      patient_name: form.patient_name,
      patient_cpf: cleanCpf || anamnesis.patient_cpf,
      patient_phone: cleanPhone,
      ...(form.answers ? { answers: form.answers, filled_at: new Date().toISOString() } : {}),
    })
    .eq("id", anamnesis.id);

  if (updateError) {
    console.error("Falha ao gravar os dados da anamnese:", updateError);
    return { error: updateError.message, patientId: null };
  }

  let patientId: string | null = null;

  if (cleanPhone) {
    const { data: byPhone } = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", anamnesis.clinic_id)
      .eq("phone", cleanPhone)
      .limit(1)
      .maybeSingle();
    if (byPhone) patientId = byPhone.id;
  }

  // Paciente pode ter trocado de celular mas informado o CPF certo.
  if (!patientId && cleanCpf) {
    const { data: byCpf } = await supabase
      .from("patients")
      .select("id")
      .eq("clinic_id", anamnesis.clinic_id)
      .eq("cpf", cleanCpf)
      .limit(1)
      .maybeSingle();
    if (byCpf) patientId = byCpf.id;
  }

  const patientFields = {
    name: form.patient_name,
    cpf: cleanCpf,
    phone: cleanPhone,
    birth_date: form.birth_date || null,
    rg: form.rg || null,
    occupation: form.occupation || null,
    address: form.address || null,
  };

  if (patientId) {
    // Não apaga o que já está no cadastro com campo vazio do formulário.
    const nonEmpty = Object.fromEntries(Object.entries(patientFields).filter(([, v]) => v));
    await supabase
      .from("patients")
      .update({ ...nonEmpty, updated_at: new Date().toISOString() })
      .eq("id", patientId);
  } else {
    const { data: newPatient, error: createError } = await supabase
      .from("patients")
      .insert({ clinic_id: anamnesis.clinic_id, ...patientFields })
      .select("id")
      .single();
    if (createError) {
      console.error("Falha ao criar paciente a partir da anamnese:", createError);
    } else {
      patientId = newPatient.id;
    }
  }

  return { error: null, patientId };
}
