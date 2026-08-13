import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBRDate, formatBRTime, formatBRWeekday } from "@/lib/date";
import { formatBRPhoneLocal } from "@/lib/validation";
import type { Appointment, AppointmentMessageTemplateType, Clinic } from "@/lib/database.types";

export const TEMPLATE_TYPES: AppointmentMessageTemplateType[] = [
  "solicitacao",
  "lembrete_24h",
  "lembrete_final",
  "confirmado",
  "cancelado",
  "remarcado",
  "retorno_lembrete",
];

export const TEMPLATE_TYPE_LABEL: Record<AppointmentMessageTemplateType, string> = {
  solicitacao: "Pedido de confirmação (ao agendar)",
  lembrete_24h: "Lembrete — véspera",
  lembrete_final: "Lembrete — mesmo dia",
  confirmado: "Resposta ao paciente confirmar",
  cancelado: "Resposta ao paciente cancelar",
  remarcado: "Aviso de remarcação",
  retorno_lembrete: "Lembrete de retorno (retornos próximos)",
};

export interface TemplateVariable {
  key: string;
  label: string;
}

/** Mesma lista de variáveis do print de referência — só os campos que a agenda realmente tem dado pra preencher. */
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "paciente_nome", label: "Nome do paciente" },
  { key: "clinica_nome", label: "Nome da clínica" },
  { key: "profissional_nome", label: "Nome do profissional" },
  { key: "data_consulta", label: "Data da consulta" },
  { key: "hora_consulta", label: "Hora da consulta" },
  { key: "duracao_consulta", label: "Duração da consulta" },
  { key: "status_consulta", label: "Status da consulta" },
  { key: "link_confirmacao", label: "Link de confirmação" },
  { key: "endereco_clinica", label: "Endereço da clínica" },
  { key: "celular_clinica", label: "Celular da clínica" },
  { key: "data_retorno", label: "Data prevista de retorno" },
];

/** Texto padrão usado quando a clínica não personalizou o modelo — mesmo texto que já ia fixo no código antes deste recurso existir. */
export const DEFAULT_TEMPLATE_BODY: Record<AppointmentMessageTemplateType, string> = {
  solicitacao:
    "Olá! Sua consulta na {{clinica_nome}} está marcada pra {{data_consulta}} às {{hora_consulta}}.\n\n" +
    "Pra confirmar ou cancelar, toque aqui: {{link_confirmacao}}",
  lembrete_24h:
    "Lembrete: você tem consulta amanhã, {{data_consulta}} às {{hora_consulta}}, na {{clinica_nome}}. " +
    "Ainda não vimos sua confirmação — pra confirmar ou cancelar, toque aqui: {{link_confirmacao}}",
  lembrete_final:
    "Sua consulta na {{clinica_nome}} é hoje às {{hora_consulta}}. " +
    "Ainda não recebemos sua confirmação — toque aqui: {{link_confirmacao}}",
  confirmado: "Combinado! Te esperamos {{data_consulta}} às {{hora_consulta}}.",
  cancelado: "Tudo bem, seu agendamento foi cancelado. Se quiser remarcar, é só chamar a gente por aqui.",
  remarcado:
    "Sua consulta na {{clinica_nome}} foi remarcada — novo horário: {{data_consulta}} às {{hora_consulta}}.\n\n" +
    "Se precisar confirmar ou cancelar, toque aqui: {{link_confirmacao}}",
  retorno_lembrete:
    "Olá, {{paciente_nome}}! Já faz um tempo desde sua última consulta na {{clinica_nome}} — " +
    "chegou perto da data que a gente combinou pro seu retorno ({{data_retorno}}). " +
    "Quer marcar? É só responder aqui ou chamar no {{celular_clinica}}.",
};

function confirmationLink(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/confirmacao/${token}`;
}

export function buildAppointmentTemplateVars(clinic: Clinic, appointment: Appointment): Record<string, string> {
  return {
    paciente_nome: appointment.patient_name,
    clinica_nome: clinic.name,
    profissional_nome: appointment.professional_name,
    data_consulta: `${formatBRWeekday(appointment.scheduled_at, "long")}, ${formatBRDate(appointment.scheduled_at)}`,
    hora_consulta: formatBRTime(appointment.scheduled_at),
    duracao_consulta: `${appointment.duration_minutes} min`,
    status_consulta: appointment.status,
    link_confirmacao: confirmationLink(appointment.confirm_token),
    endereco_clinica: clinic.clinic_address ?? "",
    celular_clinica: clinic.whatsapp_number ? formatBRPhoneLocal(clinic.whatsapp_number) : clinic.dentist_phone ?? "",
    data_retorno: appointment.return_due_date ? formatBRDate(`${appointment.return_due_date}T12:00:00-03:00`) : "",
  };
}

/** Substitui `{{variavel}}` pelo valor correspondente — variável sem valor conhecido vira string vazia em vez de aparecer literal na mensagem. */
export function resolveTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

/**
 * Corpo final da mensagem pra um agendamento — usa o modelo customizado da
 * clínica se existir, senão cai no texto padrão (`DEFAULT_TEMPLATE_BODY`).
 * Centraliza aqui pra `appointmentNotifications.ts` não duplicar a lógica de
 * "buscar customizado, senão usar padrão" nos três lugares que mandam
 * mensagem.
 */
export async function getAppointmentMessageBody(
  supabase: SupabaseClient,
  clinicId: string,
  type: AppointmentMessageTemplateType,
  vars: Record<string, string>
): Promise<string> {
  const { data } = await supabase
    .from("appointment_message_templates")
    .select("body")
    .eq("clinic_id", clinicId)
    .eq("template_type", type)
    .maybeSingle();
  const body = data?.body ?? DEFAULT_TEMPLATE_BODY[type];
  return resolveTemplate(body, vars);
}
