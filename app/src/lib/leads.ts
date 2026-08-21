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
 * mesmo padrão de findPendingAppointmentForPhone), ou cria um novo. Usado pelo
 * webhook da Evolution API a cada mensagem recebida de um número sem anamnese
 * em andamento nem agendamento pendente.
 */
export async function findOrCreateOpenLead(
  supabase: SupabaseClient,
  clinicId: string,
  phone: string
): Promise<Lead> {
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("clinic_id", clinicId)
    .in("patient_phone", brPhoneVariants(phone))
    .neq("status", "scheduled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as Lead;

  const { data: created, error } = await supabase
    .from("leads")
    .insert({ clinic_id: clinicId, patient_phone: phone, status: "bot_active" })
    .select("*")
    .single();
  if (error || !created) throw new Error(`Falha ao criar lead: ${error?.message}`);
  return created as Lead;
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
