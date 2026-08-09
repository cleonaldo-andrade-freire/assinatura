import type { Clinic } from "@/lib/database.types";

/** Dias de carência depois que a assinatura entra em atraso antes de bloquear o acesso. */
export const GRACE_PERIOD_DAYS = 3;

export function canAcceptAnamnesis(clinic: Pick<Clinic, "subscription_status" | "past_due_since">): boolean {
  if (clinic.subscription_status === "canceled") return false;
  if (clinic.subscription_status === "past_due") {
    if (!clinic.past_due_since) return true; // acabou de ficar em atraso, ainda sem data marcada
    const graceEnds = new Date(clinic.past_due_since);
    graceEnds.setDate(graceEnds.getDate() + GRACE_PERIOD_DAYS);
    return new Date() < graceEnds;
  }
  return true; // trialing ou active
}
