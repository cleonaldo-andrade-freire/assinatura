import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "@/lib/evolution";
import { buildProsthesisTemplateVars, getProsthesisStageMessageBody } from "@/lib/prosthesisTemplates";
import type { Clinic, ProsthesisOrder, ProsthesisOrderEventActor, ProsthesisStage } from "@/lib/database.types";

export async function recordProsthesisOrderEvent(
  supabase: SupabaseClient,
  input: {
    prosthesisOrderId: string;
    clinicId: string;
    fromStage: ProsthesisStage | null;
    toStage: ProsthesisStage;
    actor: ProsthesisOrderEventActor;
  }
): Promise<void> {
  const { error } = await supabase.from("prosthesis_order_events").insert({
    prosthesis_order_id: input.prosthesisOrderId,
    clinic_id: input.clinicId,
    from_stage: input.fromStage,
    to_stage: input.toStage,
    actor: input.actor,
  });
  if (error) console.error("Falha ao gravar evento de estágio de prótese:", error);
}

/**
 * Avisa o paciente por WhatsApp que o serviço mudou de estágio — best-effort,
 * mesmo padrão do resto do app (uma falha de envio não pode impedir a
 * movimentação do card de ter sido salva). `order` já precisa vir com o
 * `stage` NOVO (a linha já atualizada).
 */
export async function notifyProsthesisStageChange(supabase: SupabaseClient, clinic: Clinic, order: ProsthesisOrder): Promise<void> {
  const vars = buildProsthesisTemplateVars(clinic, order);
  const text = await getProsthesisStageMessageBody(supabase, clinic.id, order.stage, vars);
  await sendText(clinic, order.patient_phone, text);
}
