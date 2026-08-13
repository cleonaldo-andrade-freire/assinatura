import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "@/lib/evolution";
import { recordAppointmentEvent } from "@/lib/appointments";
import { buildAppointmentTemplateVars, getAppointmentMessageBody } from "@/lib/appointmentTemplates";
import type { Appointment, AppointmentEventActor, AppointmentStatus, Clinic } from "@/lib/database.types";

const CONFIRM_WORDS = new Set(["confirmar", "confirmo", "confirmado", "sim", "s", "1", "ok", "okay", "beleza", "certo"]);
const CANCEL_WORDS = new Set(["cancelar", "cancelo", "cancelado", "nao", "n", "2"]);

function normalizeWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, ""); // remove pontuação (ex.: "confirmar!", "não.")
}

/**
 * Fallback pra quando o paciente responde em texto livre no WhatsApp em vez
 * de tocar no link — canal complementar, não o principal (ver correção de
 * escopo da proposta: o link já resolve com um toque só, sem depender de
 * botão interativo que a Evolution API não sustenta de forma confiável).
 */
export function matchConfirmCancel(raw: string): "confirm" | "cancel" | null {
  const normalized = normalizeWord(raw);
  if (CONFIRM_WORDS.has(normalized)) return "confirm";
  if (CANCEL_WORDS.has(normalized)) return "cancel";
  const firstWord = normalized.split(/\s+/)[0] ?? "";
  if (CONFIRM_WORDS.has(firstWord)) return "confirm";
  if (CANCEL_WORDS.has(firstWord)) return "cancel";
  return null;
}

/**
 * Mensagem inicial de confirmação, mandada assim que o agendamento é criado.
 * Um link só (não um botão por link) — a página é que mostra as duas ações;
 * evita o risco de o preview de link do WhatsApp (que busca a URL no
 * servidor pra montar a prévia) disparar a ação sozinho antes do paciente
 * clicar em qualquer coisa. Usa o modelo customizado da clínica se existir
 * (ver /dashboard/configuracoes/mensagens), senão o texto padrão.
 */
export async function sendAppointmentRequest(supabase: SupabaseClient, clinic: Clinic, appointment: Appointment): Promise<void> {
  const vars = buildAppointmentTemplateVars(clinic, appointment);
  const text = await getAppointmentMessageBody(supabase, clinic.id, "solicitacao", vars);
  await sendText(clinic, appointment.patient_phone, text);
}

/**
 * Avisa o paciente quando a clínica remarca (seja pela tela de detalhe ou
 * arrastando o card na grade semanal — os dois passam pelo mesmo PATCH).
 * `appointment` já precisa vir com o `scheduled_at` NOVO (a linha já
 * atualizada), pra {{data_consulta}}/{{hora_consulta}} no texto saírem
 * certos.
 */
export async function sendAppointmentRescheduled(supabase: SupabaseClient, clinic: Clinic, appointment: Appointment): Promise<void> {
  const vars = buildAppointmentTemplateVars(clinic, appointment);
  const text = await getAppointmentMessageBody(supabase, clinic.id, "remarcado", vars);
  await sendText(clinic, appointment.patient_phone, text);
}

/**
 * Lembrete escalonado — mesmo link de sempre, só muda o texto conforme o
 * nível ("amanhã" vs. "hoje"). Quem decide QUANDO mandar é o cron
 * (`/api/cron/appointment-reminders`, 1x/dia — granularidade de dia, não de
 * hora, ver o comentário lá); esta função só manda e marca o timestamp de
 * controle, pra não reenviar o mesmo lembrete de novo.
 */
export async function sendAppointmentReminder(
  supabase: SupabaseClient,
  clinic: Clinic,
  appointment: Appointment,
  tier: "24h" | "final"
): Promise<void> {
  const vars = buildAppointmentTemplateVars(clinic, appointment);
  const text = await getAppointmentMessageBody(supabase, clinic.id, tier === "24h" ? "lembrete_24h" : "lembrete_final", vars);

  await sendText(clinic, appointment.patient_phone, text);
  await supabase
    .from("appointments")
    .update({ [tier === "24h" ? "reminder_24h_sent_at" : "reminder_final_sent_at"]: new Date().toISOString() })
    .eq("id", appointment.id);
}

export type AppointmentResponseResult =
  | { ok: true; status: AppointmentStatus }
  | { ok: false; reason: "already_processed" | "expired" };

/**
 * Núcleo compartilhado entre o link público de confirmação e a resposta em
 * texto livre pelo WhatsApp (webhook) — mesma regra de idempotência nos
 * dois canais, pra não duplicar a lógica de concorrência.
 *
 * A idempotência sob concorrência (dois cliques/duas respostas quase ao
 * mesmo tempo) não depende de nenhum lock explícito: o `UPDATE ... WHERE
 * status = 'agendado'` só afeta a linha se ela ainda estiver nesse status.
 * O Postgres serializa updates concorrentes na mesma linha — o segundo a
 * chegar reavalia o WHERE depois que o primeiro já comitou, vê que o status
 * mudou, e não atualiza nada. `supabase-js` reporta isso como nenhuma linha
 * retornada, tratado abaixo como "already_processed".
 */
export async function processAppointmentResponse(
  supabase: SupabaseClient,
  clinic: Clinic,
  appointment: Appointment,
  action: "confirm" | "cancel",
  actor: AppointmentEventActor
): Promise<AppointmentResponseResult> {
  const now = new Date();
  if (new Date(appointment.scheduled_at).getTime() < now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  const newStatus: AppointmentStatus = action === "confirm" ? "confirmado" : "cancelado_paciente";

  const { data: updated } = await supabase
    .from("appointments")
    .update({ status: newStatus, updated_at: now.toISOString() })
    .eq("id", appointment.id)
    .eq("status", "agendado")
    .select("*")
    .maybeSingle();

  if (!updated) {
    return { ok: false, reason: "already_processed" };
  }

  await recordAppointmentEvent(supabase, {
    appointmentId: appointment.id,
    clinicId: appointment.clinic_id,
    eventType: "status_changed",
    fromStatus: "agendado",
    toStatus: newStatus,
    actor,
  });

  const vars = buildAppointmentTemplateVars(clinic, appointment);
  const reply = await getAppointmentMessageBody(supabase, clinic.id, action === "confirm" ? "confirmado" : "cancelado", vars);
  await sendText(clinic, appointment.patient_phone, reply);

  return { ok: true, status: newStatus };
}
