import { SupabaseClient } from "@supabase/supabase-js";
import {
  PLAN_LABEL,
  PLAN_MONTHLY_LIMIT,
  OVERAGE_PRICE,
  createAsaasCharge,
  effectivePlanValue,
  getPendingInvoice,
  updateAsaasPaymentValue,
} from "@/lib/asaas";
import type { Clinic } from "@/lib/database.types";

/** Início do mês corrente, em UTC, pra contar uso "desde o dia 1". */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function money(value: number): string {
  return value.toFixed(2).replace(".", ",");
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

/** Quantas unidades de uma contagem já ultrapassam o limite do plano (0 se dentro do limite). */
export function overageUnits(usedThisMonth: number, plan: Clinic["plan"]): number {
  return Math.max(0, usedThisMonth - PLAN_MONTHLY_LIMIT[plan]);
}

/**
 * Chamada logo depois de criar uma anamnese: se essa unidade ultrapassou o
 * limite mensal do plano, soma o excedente do mês inteiro direto na fatura
 * pendente da assinatura (mesmo valor total recalculado do zero a cada vez —
 * plano + excedente até agora — nunca incrementado, pra não haver risco de
 * duplicar). Se não houver fatura pendente pra atualizar (raro — normalmente
 * o Asaas já gera a próxima com antecedência), cai pra uma cobrança avulsa
 * como plano B. Best-effort: nunca derruba a resposta principal, só loga se
 * falhar, mesmo padrão de `notifyClinicSigned`.
 */
export async function chargeOverageIfNeeded(
  supabase: SupabaseClient,
  clinic: Pick<
    Clinic,
    "id" | "name" | "plan" | "billing_cycle" | "custom_monthly_price" | "asaas_customer_id" | "asaas_subscription_id"
  >,
  anamnesisId: string
): Promise<void> {
  if (!clinic.asaas_customer_id) return;

  const used = await countMonthlyAnamneses(supabase, clinic.id);
  const units = overageUnits(used, clinic.plan);
  if (units <= 0) return;

  const overageTotal = Math.round(units * OVERAGE_PRICE * 100) / 100;
  const planValue = effectivePlanValue(clinic, clinic.billing_cycle);

  try {
    const pending = clinic.asaas_subscription_id ? await getPendingInvoice(clinic.asaas_subscription_id) : null;

    if (pending) {
      const newValue = Math.round((planValue + overageTotal) * 100) / 100;
      const description = `Assinatura ${PLAN_LABEL[clinic.plan]} (R$ ${money(planValue)}) + ${units} anamnese${
        units === 1 ? "" : "s"
      } excedente${units === 1 ? "" : "s"} (R$ ${money(overageTotal)}) = R$ ${money(newValue)}`;
      await updateAsaasPaymentValue({ paymentId: pending.id, value: newValue, description });
      await supabase.from("usage_charges").insert({
        clinic_id: clinic.id,
        anamnesis_id: anamnesisId,
        asaas_payment_id: pending.id,
        amount: OVERAGE_PRICE,
      });
      return;
    }

    // Plano B: sem fatura pendente pra atualizar — cobrança avulsa isolada.
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
