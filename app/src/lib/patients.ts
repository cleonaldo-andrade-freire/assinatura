import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cadastra automaticamente o paciente (nome + telefone, e CPF quando disponível)
 * ao iniciar uma anamnese ou emitir um atestado/prescrição, se ainda não existir
 * um cadastro com esse telefone nesta clínica — evita duplicar o mesmo paciente
 * a cada documento novo. Se já existir um cadastro com esse telefone mas sem CPF,
 * preenche o CPF agora (nunca sobrescreve um CPF que já estava preenchido — evita
 * corromper um dado bom com um valor diferente digitado por engano depois).
 * Best-effort: nunca lança erro, só loga, mesmo padrão de `notifyClinicSigned` em
 * `lib/evolution.ts` — isso não pode travar a emissão do documento.
 *
 * Retorna o id do paciente (existente ou recém-criado), ou `null` se não deu
 * pra cadastrar (sem telefone, ou falha).
 */
export async function upsertPatientFromContact(
  supabase: SupabaseClient,
  clinicId: string,
  name: string,
  phone: string | null | undefined,
  cpf?: string | null
): Promise<string | null> {
  if (!phone) return null;
  try {
    const { data: existing } = await supabase
      .from("patients")
      .select("id, cpf")
      .eq("clinic_id", clinicId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      if (cpf && !existing.cpf) {
        const { error } = await supabase
          .from("patients")
          .update({ cpf, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) console.error("Falha ao preencher CPF do paciente automaticamente:", error);
      }
      return existing.id;
    }

    const { data: created, error } = await supabase
      .from("patients")
      .insert({ clinic_id: clinicId, name, phone, cpf: cpf ?? null })
      .select("id")
      .single();
    if (error || !created) {
      console.error("Falha ao cadastrar paciente automaticamente:", error);
      return null;
    }
    return created.id;
  } catch (err) {
    console.error("Falha ao cadastrar paciente automaticamente:", err);
    return null;
  }
}
