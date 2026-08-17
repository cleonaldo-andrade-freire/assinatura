import { SupabaseClient } from "@supabase/supabase-js";

/** Início do mês corrente, em UTC, pra contar uso "desde o dia 1". */
export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function countMonthlyAnamneses(supabase: SupabaseClient, clinicId: string): Promise<number> {
  const { count } = await supabase
    .from("anamneses")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .gte("created_at", startOfCurrentMonth().toISOString());
  return count ?? 0;
}

/** Total de anamneses desde sempre (não só do mês) — usado pro limite do trial, que é vitalício, não mensal. */
export async function countTotalAnamneses(supabase: SupabaseClient, clinicId: string): Promise<number> {
  const { count } = await supabase.from("anamneses").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId);
  return count ?? 0;
}
