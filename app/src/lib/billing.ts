import type { Clinic } from "@/lib/database.types";

/** Dias de carência depois que a assinatura entra em atraso antes de bloquear o acesso. */
export const GRACE_PERIOD_DAYS = 3;

/** Quantas anamneses o período de teste cobre, no total — depois disso só com plano pago. */
export const TRIAL_ANAMNESIS_LIMIT = 3;

/**
 * `trialAnamnesesUsed` só é relevante (e obrigatório de checar) quando a
 * clínica está em trial — outros status não usam esse número. Fica como
 * parâmetro em vez de a função buscar sozinha pra continuar pura/testável
 * sem depender de banco.
 */
export function canAcceptAnamnesis(
  clinic: Pick<Clinic, "subscription_status" | "past_due_since">,
  trialAnamnesesUsed = 0
): boolean {
  if (clinic.subscription_status === "canceled") return false;
  if (clinic.subscription_status === "trialing") {
    return trialAnamnesesUsed < TRIAL_ANAMNESIS_LIMIT;
  }
  if (clinic.subscription_status === "past_due") {
    if (!clinic.past_due_since) return true; // acabou de ficar em atraso, ainda sem data marcada
    const graceEnds = new Date(clinic.past_due_since);
    graceEnds.setDate(graceEnds.getDate() + GRACE_PERIOD_DAYS);
    return new Date() < graceEnds;
  }
  return true; // active
}
