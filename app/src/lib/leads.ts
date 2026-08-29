import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadMessageRole, LeadStatus } from "@/lib/database.types";
import { brPhoneVariants } from "@/lib/validation";

export const LEAD_STATUSES: LeadStatus[] = ["bot_active", "waiting_reply", "urgent", "scheduled"];

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
  const { error } = await supabase.from("lead_messages").insert({
    lead_id: input.leadId,
    clinic_id: input.clinicId,
    role: input.role,
    content: input.content,
  });
  // Não lança — histórico não pode travar a resposta ao paciente, mesmo padrão
  // de recordAppointmentEvent em lib/appointments.ts.
  if (error) console.error("Falha ao gravar mensagem do lead:", error);
}
