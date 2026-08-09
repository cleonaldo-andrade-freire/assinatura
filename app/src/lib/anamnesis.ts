import { SupabaseClient } from "@supabase/supabase-js";
import type { AnamnesisAnswer } from "@/lib/database.types";

interface CreateAnamnesisInput {
  clinicId: string;
  patientName: string;
  patientCpf?: string | null;
  patientPhone?: string | null;
  answers: AnamnesisAnswer[];
}

/**
 * Cria o registro de anamnese. Usada tanto pelo endpoint que o Typebot chama
 * (`/api/clinics/:id/anamnesis`, usado pela instância da Dra. Ewerjane) quanto
 * pelo motor de conversa próprio, ao finalizar uma `conversation`.
 */
export async function createAnamnesis(
  supabase: SupabaseClient,
  input: CreateAnamnesisInput
): Promise<{ token: string } | null> {
  const { data, error } = await supabase
    .from("anamneses")
    .insert({
      clinic_id: input.clinicId,
      patient_name: input.patientName,
      patient_cpf: input.patientCpf ?? null,
      patient_phone: input.patientPhone ?? null,
      answers: input.answers,
    })
    .select("token")
    .single();

  if (error || !data) {
    console.error("Falha ao criar anamnese:", error);
    return null;
  }
  return data;
}
