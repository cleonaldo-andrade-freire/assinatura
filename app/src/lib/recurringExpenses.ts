import type { SupabaseClient } from "@supabase/supabase-js";
import { brDateOnly, firstOfMonth, firstOfNextMonth } from "@/lib/date";
import type { RecurringExpense } from "@/lib/database.types";

/**
 * Gera a despesa do mês pra cada recorrência ativa que ainda não tem uma
 * `expenses` nesse mês — idempotente por existência (o cron roda todo dia,
 * mas só cria uma vez por mês por recorrência), mesmo padrão de
 * `ensureTreatmentsForBudget`. Nasce no primeiro dia em que o cron rodar no
 * mês, não exatamente no dia de vencimento — aparece como "pendente" com
 * antecedência em vez de só no dia.
 */
export async function generateDueExpenses(supabase: SupabaseClient): Promise<number> {
  const today = brDateOnly();
  const monthStart = firstOfMonth(today);
  const monthEnd = firstOfNextMonth(today);

  const { data: recurringData } = await supabase.from("recurring_expenses").select("*").eq("active", true);
  const recurring = (recurringData as RecurringExpense[]) ?? [];
  if (recurring.length === 0) return 0;

  let created = 0;
  for (const rule of recurring) {
    const { count } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("recurring_expense_id", rule.id)
      .gte("due_date", monthStart)
      .lt("due_date", monthEnd);
    if ((count ?? 0) > 0) continue;

    const dueDate = `${monthStart.slice(0, 8)}${String(rule.day_of_month).padStart(2, "0")}`;
    const { error } = await supabase.from("expenses").insert({
      clinic_id: rule.clinic_id,
      recurring_expense_id: rule.id,
      description: rule.description,
      category: rule.category,
      nature: rule.nature,
      amount: rule.amount,
      due_date: dueDate,
    });
    if (!error) created++;
    else console.error(`Falha ao gerar despesa da recorrência ${rule.id}:`, error.message);
  }
  return created;
}
