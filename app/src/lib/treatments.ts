import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget, BudgetItem, Treatment } from "@/lib/database.types";
import { ensureDebitsForTreatments } from "@/lib/treatmentDebits";

/**
 * Gera os tratamentos do paciente a partir de um orçamento aprovado — uma
 * linha por item selecionado (os desmarcados não viram tratamento, do mesmo
 * jeito que não entram no PDF/total). Cada tratamento com valor > 0 já sai
 * daqui com o débito (conta a receber) correspondente.
 */
async function createTreatmentsFromBudget(supabase: SupabaseClient, budget: Budget, items: BudgetItem[]): Promise<number> {
  const selected = items.filter((i) => i.selected);
  if (selected.length === 0) return 0;

  const { data, error } = await supabase
    .from("treatments")
    .insert(
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
    )
    .select("*");
  if (error) throw new Error(`Falha ao criar tratamentos a partir do orçamento: ${error.message}`);

  try {
    await ensureDebitsForTreatments(supabase, (data as Treatment[]) ?? []);
  } catch (err) {
    // Os tratamentos já foram criados (o que importa mais) — só os débitos
    // falharam; loga em vez de derrubar a aprovação do orçamento inteira.
    console.error("Falha ao criar débitos dos tratamentos do orçamento:", err);
  }

  return selected.length;
}

/**
 * Idempotente por existência (não por "acabou de aprovar agora"): se o
 * orçamento já tem tratamentos vinculados, não cria de novo — permite
 * chamar isso tanto na aprovação quanto como recuperação manual pra
 * orçamentos que ficaram sem tratamento por alguma falha anterior (ex.:
 * aprovado antes da migration da tabela `treatments` rodar).
 */
export async function ensureTreatmentsForBudget(supabase: SupabaseClient, budget: Budget, items: BudgetItem[]): Promise<number> {
  const { count } = await supabase.from("treatments").select("id", { count: "exact", head: true }).eq("budget_id", budget.id);
  if ((count ?? 0) > 0) return 0;
  return createTreatmentsFromBudget(supabase, budget, items);
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

/**
 * Rótulo dos tratamentos vinculados a uma evolução — usado no PDF assinado,
 * na tela pública de confirmação e no aviso "Também vinculada a" da tela de
 * edição do tratamento. Mesma convenção de formatação (toothRegion — name)
 * já usada no campo "Tratamento:" de antes desta evolução poder cobrir mais
 * de um tratamento.
 */
export function formatTreatmentsLabel(treatments: { name: string; toothRegion: string | null }[]): string {
  return treatments.map((t) => (t.toothRegion ? `${t.toothRegion} — ${t.name}` : t.name)).join("; ");
}

/** Mesmo conteúdo de `formatTreatmentsLabel`, mas uma linha por tratamento
 * — usado onde o grupo precisa ficar legível empilhado (card de evolução,
 * revisão antes de assinar, PDF), em vez de um parágrafo só separado por
 * ponto e vírgula. */
export function formatTreatmentsLines(treatments: { name: string; toothRegion: string | null }[]): string[] {
  return treatments.map((t) => (t.toothRegion ? `${t.toothRegion} — ${t.name}` : t.name));
}
