import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadMessageRole, LeadStatus } from "@/lib/database.types";
import { brPhoneVariants } from "@/lib/validation";

export const LEAD_STATUSES: LeadStatus[] = ["bot_active", "waiting_reply", "urgent", "scheduled"];

/** Colunas do Kanban de leads. 'scheduled' fica FORA de propósito — lead
 * agendado é caso encerrado e vai pra lista "Agendados" abaixo do quadro,
 * pra as colunas mostrarem só o que precisa de ação. */
export const LEAD_BOARD_STATUSES: LeadStatus[] = ["bot_active", "waiting_reply", "urgent"];

/** Dias parado em 'waiting_reply' (sem mensagem nova) pro chip "sem resposta"
 * do quadro. */
export const STALE_WAITING_DAYS = 2;

/**
 * Lead em 'waiting_reply' sem nenhuma mensagem nova há pelo menos `days` dias
 * — base do filtro "sem resposta há +Nd". Cai pro `created_at` enquanto não
 * houver `last_message_at` (leads anteriores à migration 067, já retro-
 * preenchidos, ou sem histórico).
 */
export function isStaleWaiting(
  lead: Pick<Lead, "status" | "last_message_at" | "created_at">,
  days: number,
  now: number = Date.now()
): boolean {
  if (lead.status !== "waiting_reply") return false;
  const ref = new Date(lead.last_message_at ?? lead.created_at).getTime();
  return now - ref >= days * 86_400_000;
}

/**
 * Ordena os cards de uma coluna. "Aguardando resposta" vai por quem espera há
 * mais tempo primeiro (a pessoa mais esquecida no topo); as demais colunas
 * seguem os mais recentes primeiro.
 */
export function compareLeadsForColumn(
  status: LeadStatus,
  a: Pick<Lead, "last_message_at" | "created_at">,
  b: Pick<Lead, "last_message_at" | "created_at">
): number {
  const at = new Date(a.last_message_at ?? a.created_at).getTime();
  const bt = new Date(b.last_message_at ?? b.created_at).getTime();
  return status === "waiting_reply" ? at - bt : bt - at;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  bot_active: "Bot atendendo",
  waiting_reply: "Aguardando resposta",
  urgent: "Urgente",
  scheduled: "Agendado",
};

/**
 * Acha o lead em triagem aberta pro telefone (qualquer status != 'scheduled',
 * mesmo padrão de findPendingAppointmentForPhone) — sem criar. Separado de
 * `findOrCreateOpenLead` pra o webhook poder aplicar o gate de
 * `matchesLeadBotTrigger` só na hora de decidir se cria um lead NOVO, sem
 * afetar mensagens seguintes de uma conversa já aberta.
 */
export async function findOpenLead(supabase: SupabaseClient, clinicId: string, phone: string): Promise<Lead | null> {
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("clinic_id", clinicId)
    .in("patient_phone", brPhoneVariants(phone))
    .neq("status", "scheduled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (existing as Lead) ?? null;
}

/**
 * Acha o lead em triagem aberta pro telefone, ou cria um novo. Usado pelo
 * webhook da Evolution API a cada mensagem recebida de um número sem anamnese
 * em andamento nem agendamento pendente, depois que `matchesLeadBotTrigger`
 * (quando configurado) já liberou a criação de um lead novo. Nasce em
 * `waiting_reply` ("Aguardando resposta") — o atendimento por IA foi removido
 * por enquanto e a equipe responde manualmente pelo Kanban.
 */
export async function findOrCreateOpenLead(
  supabase: SupabaseClient,
  clinicId: string,
  phone: string
): Promise<Lead> {
  const existing = await findOpenLead(supabase, clinicId, phone);
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("leads")
    .insert({ clinic_id: clinicId, patient_phone: phone, status: "waiting_reply" })
    .select("*")
    .single();
  if (error || !created) throw new Error(`Falha ao criar lead: ${error?.message}`);
  return created as Lead;
}

function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "") // remove acentos (marcas diacríticas combinantes) após NFD
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decide se uma mensagem de um número desconhecido conta como contato
 * genuíno (ex.: veio do botão de WhatsApp da landing page da própria
 * clínica, com texto pré-preenchido) — só se aplica à CRIAÇÃO de lead novo,
 * nunca a mensagens seguintes de uma conversa já aberta. `triggerPhrase` nulo/
 * vazio (padrão) mantém o comportamento antigo: qualquer mensagem abre lead.
 * Match por "contém", normalizado (sem acento/maiúsculas/espaços extras) —
 * o link wa.me só pré-preenche o texto, o paciente ainda pode editar antes
 * de enviar, então uma comparação exata arriscaria descartar uma emergência
 * real por causa de uma vírgula trocada.
 */
export function matchesLeadBotTrigger(triggerPhrase: string | null, messageText: string): boolean {
  if (!triggerPhrase?.trim()) return true;
  return normalizeForMatch(messageText).includes(normalizeForMatch(triggerPhrase));
}

export async function appendLeadMessage(
  supabase: SupabaseClient,
  input: { leadId: string; clinicId: string; role: LeadMessageRole; content: string }
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("lead_messages").insert({
    lead_id: input.leadId,
    clinic_id: input.clinicId,
    role: input.role,
    content: input.content,
  });
  // Não lança — histórico não pode travar a resposta ao paciente, mesmo padrão
  // de recordAppointmentEvent em lib/appointments.ts.
  if (error) console.error("Falha ao gravar mensagem do lead:", error);

  // Mantém leads.last_message_at pro quadro ordenar/filtrar sem um join em
  // lead_messages a cada render. Best-effort pelo mesmo motivo acima.
  const { error: touchError } = await supabase.from("leads").update({ last_message_at: now }).eq("id", input.leadId);
  if (touchError) console.error("Falha ao atualizar last_message_at do lead:", touchError);
}
