import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget, BudgetItem, Treatment } from "@/lib/database.types";

/**
 * Gera os tratamentos do paciente a partir de um orçamento aprovado — uma
 * linha por item selecionado (os desmarcados não viram tratamento, do mesmo
 * jeito que não entram no PDF/total). Best-effort: quem chama decide se uma
 * falha aqui deve travar a aprovação do orçamento ou só logar.
 */
export async function createTreatmentsFromBudget(supabase: SupabaseClient, budget: Budget, items: BudgetItem[]): Promise<void> {
  const selected = items.filter((i) => i.selected);
  if (selected.length === 0) return;

  const { error } = await supabase.from("treatments").insert(
    selected.map((item, index) => ({
      clinic_id: budget.clinic_id,
      patient_id: budget.patient_id,
      budget_id: budget.id,
      budget_item_id: item.id,
      price_table_name: item.price_table_name,
      treatment_name: item.treatment_name,
      tooth_region: item.tooth_region,
      price: item.price,
      dentist_name: item.dentist_name,
      display_order: index,
    }))
  );
  if (error) throw new Error(`Falha ao criar tratamentos a partir do orçamento: ${error.message}`);
}

/**
 * Texto padrão da evolução ao finalizar um ou mais tratamentos juntos —
 * ponto de partida editável, não o texto final ("Restauração ... do dente
 * 11, Exodontia ... do dente 33 foram finalizados").
 */
export function buildFinalizationText(treatments: Pick<Treatment, "treatment_name" | "tooth_region">[]): string {
  const parts = treatments.map((t) => (t.tooth_region ? `${t.treatment_name} do dente ${t.tooth_region}` : t.treatment_name));
  const verb = treatments.length === 1 ? "foi finalizado" : "foram finalizados";
  return `${parts.join(", ")} ${verb}`;
}
