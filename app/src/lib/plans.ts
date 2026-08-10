import { SupabaseClient } from "@supabase/supabase-js";
import type { BillingCycle, PlanRecord } from "@/lib/database.types";

/** Planos disponíveis pra escolher (landing pública, seletor de novo plano) — só os ativos, na ordem de exibição. */
export async function getActivePlans(supabase: SupabaseClient): Promise<PlanRecord[]> {
  const { data } = await supabase.from("plans").select("*").eq("active", true).order("display_order");
  return (data as PlanRecord[]) ?? [];
}

/** Todos os planos, incluindo desativados — usado no CRUD do admin. */
export async function getAllPlans(supabase: SupabaseClient): Promise<PlanRecord[]> {
  const { data } = await supabase.from("plans").select("*").order("display_order");
  return (data as PlanRecord[]) ?? [];
}

export async function getPlanById(supabase: SupabaseClient, id: string): Promise<PlanRecord | null> {
  const { data } = await supabase.from("plans").select("*").eq("id", id).maybeSingle();
  return (data as PlanRecord | null) ?? null;
}

/** Valor mensal do plano — anual cobra 10x (2 meses de desconto), mesma regra de sempre. */
export function planValueFor(plan: PlanRecord, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.monthly_price * 10 : plan.monthly_price;
}

/** Preço mensal efetivo de uma clínica — respeita um desconto/preço customizado (admin), senão cai no preço padrão do plano. */
export function effectiveMonthlyPrice(clinic: { custom_monthly_price: number | null }, plan: PlanRecord): number {
  return clinic.custom_monthly_price ?? plan.monthly_price;
}

export function effectivePlanValue(
  clinic: { custom_monthly_price: number | null },
  plan: PlanRecord,
  cycle: BillingCycle
): number {
  const monthly = effectiveMonthlyPrice(clinic, plan);
  return cycle === "yearly" ? monthly * 10 : monthly;
}
