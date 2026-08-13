import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTemplate } from "@/lib/appointmentTemplates";
import { formatBRDate } from "@/lib/date";
import type { Clinic, ProsthesisOrder, ProsthesisStage } from "@/lib/database.types";

export const PROSTHESIS_STAGES: ProsthesisStage[] = ["pre_laboratorio", "envio", "laboratorio", "agenda", "realizado"];

export const PROSTHESIS_STAGE_LABEL: Record<ProsthesisStage, string> = {
  pre_laboratorio: "Pré-laboratório",
  envio: "Envio",
  laboratorio: "Laboratório",
  agenda: "Agenda",
  realizado: "Realizado",
};

/** Texto padrão mandado por WhatsApp quando o serviço entra em cada estágio — usado se a clínica não personalizou (ver /dashboard/configuracoes/mensagens-protese). */
export const DEFAULT_STAGE_TEMPLATE_BODY: Record<ProsthesisStage, string> = {
  pre_laboratorio: "Olá! Recebemos o pedido da sua prótese ({{descricao_protese}}) na {{clinica_nome}} — está em preparação.",
  envio: "Sua prótese ({{descricao_protese}}) foi enviada ao laboratório.",
  laboratorio: "Sua prótese ({{descricao_protese}}) está sendo confeccionada no laboratório.",
  agenda: "Sua prótese ({{descricao_protese}}) ficou pronta e já entrou na agenda pra instalação{{data_prevista}}.",
  realizado: "Prótese ({{descricao_protese}}) instalada com sucesso! Qualquer dúvida, é só chamar a {{clinica_nome}}.",
};

export function buildProsthesisTemplateVars(clinic: Clinic, order: ProsthesisOrder): Record<string, string> {
  return {
    paciente_nome: order.patient_name,
    clinica_nome: clinic.name,
    descricao_protese: order.description,
    estagio: PROSTHESIS_STAGE_LABEL[order.stage],
    data_prevista: order.expected_delivery_date ? `, previsão ${formatBRDate(`${order.expected_delivery_date}T12:00:00-03:00`)}` : "",
  };
}

/** Mesma lógica de "customizado, senão padrão" de getAppointmentMessageBody, só que na tabela de estágios de prótese. */
export async function getProsthesisStageMessageBody(
  supabase: SupabaseClient,
  clinicId: string,
  stage: ProsthesisStage,
  vars: Record<string, string>
): Promise<string> {
  const { data } = await supabase
    .from("prosthesis_stage_templates")
    .select("body")
    .eq("clinic_id", clinicId)
    .eq("stage", stage)
    .maybeSingle();
  const body = data?.body ?? DEFAULT_STAGE_TEMPLATE_BODY[stage];
  return resolveTemplate(body, vars);
}
