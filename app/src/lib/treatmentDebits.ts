import type { SupabaseClient } from "@supabase/supabase-js";
import type { Treatment } from "@/lib/database.types";

/** Um tratamento sem valor (ex.: retorno de cortesia) não gera conta a receber. */
function isBillable(treatment: Pick<Treatment, "price">): boolean {
  return treatment.price > 0;
}

/** Cria o débito de UM tratamento recém-criado (uso: rota manual de "Novo tratamento"). */
export async function createDebitForTreatment(supabase: SupabaseClient, treatment: Treatment): Promise<void> {
  if (!isBillable(treatment)) return;
  const { error } = await supabase.from("treatment_debits").insert({
    clinic_id: treatment.clinic_id,
    patient_id: treatment.patient_id,
    treatment_id: treatment.id,
    description: treatment.treatment_name,
    amount: treatment.price,
  });
  if (error) throw new Error(`Falha ao criar débito do tratamento: ${error.message}`);
}

/**
 * Sincroniza o débito quando o valor do tratamento é editado — só quando
 * existe exatamente UM débito pra esse tratamento e ele ainda está
 * `aberto` (nunca foi pago nem dividido). Se já existe mais de um débito
 * (pagamento parcial já dividiu em dois) ou o único existente já está
 * `pago`, não mexe — o registro financeiro é histórico a partir daí, e não
 * há uma forma óbvia de "quanto" recalcular no débito remanescente de uma
 * divisão sem arriscar um valor errado.
 */
export async function syncDebitAfterPriceChange(supabase: SupabaseClient, treatment: Treatment): Promise<void> {
  const { data } = await supabase.from("treatment_debits").select("*").eq("treatment_id", treatment.id);
  const debits = data ?? [];

  if (debits.length === 0) {
    if (isBillable(treatment)) await createDebitForTreatment(supabase, treatment);
    return;
  }
  if (debits.length > 1 || debits[0].status !== "aberto") return;

  const debit = debits[0];
  if (!isBillable(treatment)) {
    await supabase.from("treatment_debits").delete().eq("id", debit.id);
    return;
  }
  await supabase
    .from("treatment_debits")
    .update({ amount: treatment.price, description: treatment.treatment_name, updated_at: new Date().toISOString() })
    .eq("id", debit.id);
}

/** Apaga os débitos ainda `aberto` de um tratamento antes dele ser excluído — débito `pago`/dividido fica (o FK desvincula sozinho). */
export async function deleteOpenDebitsForTreatment(supabase: SupabaseClient, treatmentId: string): Promise<void> {
  await supabase.from("treatment_debits").delete().eq("treatment_id", treatmentId).eq("status", "aberto");
}

/**
 * Um débito por tratamento com valor > 0, em lote — uso: geração de
 * tratamentos a partir de um orçamento aprovado. Sem checagem de
 * idempotência própria porque só é chamada logo depois de inserir os
 * tratamentos pela primeira vez (`createTreatmentsFromBudget`, que já é
 * guardada por `ensureTreatmentsForBudget`).
 */
export async function ensureDebitsForTreatments(supabase: SupabaseClient, treatments: Treatment[]): Promise<void> {
  const eligible = treatments.filter(isBillable);
  if (eligible.length === 0) return;
  const { error } = await supabase.from("treatment_debits").insert(
    eligible.map((t) => ({
      clinic_id: t.clinic_id,
      patient_id: t.patient_id,
      treatment_id: t.id,
      description: t.treatment_name,
      amount: t.price,
    }))
  );
  if (error) throw new Error(`Falha ao criar débitos dos tratamentos: ${error.message}`);
}
