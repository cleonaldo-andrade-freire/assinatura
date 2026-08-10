import { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_MONTHLY_LIMIT, OVERAGE_PRICE, createAsaasCharge } from "@/lib/asaas";
import type { Clinic } from "@/lib/database.types";

/** Início do mês corrente, em UTC, pra contar uso "desde o dia 1". */
function startOfCurrentMonth(): Date {
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

/** Quantas unidades de uma contagem já ultrapassam o limite do plano (0 se dentro do limite). */
export function overageUnits(usedThisMonth: number, plan: Clinic["plan"]): number {
  return Math.max(0, usedThisMonth - PLAN_MONTHLY_LIMIT[plan]);
}

/**
 * Chamada logo depois de criar uma anamnese: se essa unidade ultrapassou o
 * limite mensal do plano, dispara uma cobrança avulsa no Asaas (best-effort —
 * nunca derruba a resposta principal, só loga se falhar, mesmo padrão de
 * `notifyClinicSigned`).
 */
export async function chargeOverageIfNeeded(
  supabase: SupabaseClient,
  clinic: Pick<Clinic, "id" | "name" | "plan" | "asaas_customer_id">,
  anamnesisId: string
): Promise<void> {
  if (!clinic.asaas_customer_id) return;

  const used = await countMonthlyAnamneses(supabase, clinic.id);
  if (overageUnits(used, clinic.plan) <= 0) return;

  try {
    const charge = await createAsaasCharge({
      customerId: clinic.asaas_customer_id,
      value: OVERAGE_PRICE,
      description: `Anamnese excedente do plano — ${clinic.name}`,
    });
    await supabase.from("usage_charges").insert({
      clinic_id: clinic.id,
      anamnesis_id: anamnesisId,
      asaas_payment_id: charge.id,
      amount: OVERAGE_PRICE,
    });
  } catch (err) {
    console.error("Falha ao cobrar anamnese excedente:", err);
  }
}
