import { generateText, tool, stepCountIs, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Appointment, Clinic, Lead, LeadMessage } from "@/lib/database.types";
import { sendText } from "@/lib/evolution";
import { appendLeadMessage } from "@/lib/leads";
import { upsertPatientFromContact } from "@/lib/patients";
import { brDateOnly, brHour, formatBRTime, formatBRWeekday } from "@/lib/date";
import {
  AGENDA_END_HOUR,
  AGENDA_START_HOUR,
  APPOINTMENT_SLOT_MINUTES,
  appointmentEndsAt,
  buildContinuationMap,
  buildDaySlotTimes,
  findOverlappingAppointment,
  isCancelled,
  recordAppointmentEvent,
  slotKey,
} from "@/lib/appointments";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function buildSystemPrompt(clinic: Clinic): string {
  const now = new Date();
  const nowIso = now.toISOString();
  const hoje = brDateOnly();
  const diaSemana = formatBRWeekday(nowIso, "long");
  const horaAtual = formatBRTime(nowIso);
  const isHorarioComercial = brHour(now) >= AGENDA_START_HOUR && brHour(now) < AGENDA_END_HOUR;
  const statusClinica = isHorarioComercial ? "ABERTA" : "FECHADA no momento";

  return `Você é a assistente de triagem da clínica odontológica ${clinic.name}. Responda de forma humana, concisa e com empatia. Nunca faça diagnósticos ou prescreva remédios.
Hoje é ${diaSemana}, ${hoje} (AAAA-MM-DD), agora são ${horaAtual} (horário de Brasília) — a clínica está ${statusClinica} (horário de atendimento: ${AGENDA_START_HOUR}h às ${AGENDA_END_HOUR}h). Use SEMPRE essa data/hora real como referência ao interpretar "hoje", "amanhã" ou qualquer data relativa que o paciente mencionar — nunca chute ou assuma outra data, e sempre passe a data no formato AAAA-MM-DD pras ferramentas.
1. Pergunte o nome se não souber. Assim que o paciente informar o nome, chame a ferramenta registrarNome imediatamente (antes de continuar as perguntas). Entenda o motivo do contato.
2. Se o paciente relatar dor, pergunte (uma por vez): A dor é contínua ou com estímulo? Há inchaço? Houve trauma recente?
3. Se houver inchaço, trauma ou dor aguda contínua, chame imediatamente a ferramenta alertarUrgencia. Depois:
   - Se a clínica estiver ABERTA: diga que a equipe já foi avisada e a doutora responde em instantes.
   - Se a clínica estiver FECHADA: diga que a clínica está fechada agora, mas que o caso já foi marcado com prioridade máxima e a doutora entra em contato assim que abrir, às ${AGENDA_START_HOUR}h; se a dor estiver insuportável, oriente a buscar um pronto-socorro.
4. Se for caso eletivo (limpeza, dor leve, avaliação):
   - Se a clínica estiver ABERTA: chame consultarDisponibilidade e ofereça até duas opções de horário; após o paciente escolher, chame agendarPaciente.
   - Se a clínica estiver FECHADA: não consulte horários agora — avise com simpatia que o agendamento continua assim que a clínica abrir, às ${AGENDA_START_HOUR}h, e chame marcarRetornoParaAmanha.
5. NUNCA diga ao paciente que não há vaga/horário disponível, em nenhuma hipótese, nem sugira "tente outro dia" por conta própria. Se consultarDisponibilidade não retornar horários livres (em qualquer data), peça para ele ligar (chamada de voz) aqui mesmo pelo WhatsApp, pra clínica encontrar um encaixe.`;
}

/**
 * Tools do agente — fecham sobre `supabase`/`clinic`/`lead` porque cada
 * execução (dentro de generateText) precisa gravar direto nas tabelas reais
 * de agenda/leads da clínica, não em dados fictícios.
 */
function buildLeadTools(supabase: SupabaseClient, clinic: Clinic, lead: Lead): ToolSet {
  const professionalName = clinic.dentist_name || clinic.name;

  return {
    consultarDisponibilidade: tool({
      description:
        "Consulta os horários livres da agenda da clínica numa data específica. Retorna até 3 horários (formato HH:mm) ou uma mensagem dizendo que não há vagas.",
      inputSchema: z.object({
        data: z.string().regex(DATE_REGEX, "use o formato AAAA-MM-DD"),
      }),
      execute: async ({ data }) => {
        const slots = buildDaySlotTimes(data);
        const rangeEnd = appointmentEndsAt(slots[slots.length - 1], APPOINTMENT_SLOT_MINUTES).toISOString();

        const { data: appointmentsData } = await supabase
          .from("appointments")
          .select("*")
          .eq("clinic_id", clinic.id)
          .eq("professional_name", professionalName)
          .gte("scheduled_at", slots[0])
          .lt("scheduled_at", rangeEnd);
        const appointments = ((appointmentsData as Appointment[]) ?? []).filter((a) => !isCancelled(a.status));

        const startTimes = new Set(appointments.map((a) => slotKey(a.scheduled_at)));
        const continuationMap = buildContinuationMap(appointments, slots);
        const now = Date.now();

        const free = slots
          .filter((s) => !startTimes.has(s) && !continuationMap.has(s) && new Date(s).getTime() > now)
          .slice(0, 3);

        if (free.length === 0) {
          return {
            horarios: [],
            mensagem:
              "Nenhum horário livre nesse dia. NUNCA diga ao paciente que não há vaga ou disponibilidade — em vez disso, peça para ele ligar (chamada de voz) aqui mesmo pelo WhatsApp, que a clínica encontra um encaixe.",
          };
        }
        return { horarios: free.map((s) => formatBRTime(s)) };
      },
    }),

    registrarNome: tool({
      description:
        "Salva o nome do paciente no lead assim que ele for informado, mesmo antes de agendar ou de haver urgência — assim a equipe já vê o nome certo no painel de leads em vez de 'Sem nome ainda'.",
      inputSchema: z.object({
        nome: z.string().min(1),
      }),
      execute: async ({ nome }) => {
        await supabase.from("leads").update({ patient_name: nome, updated_at: new Date().toISOString() }).eq("id", lead.id);
        return { salvo: true };
      },
    }),

    marcarRetornoParaAmanha: tool({
      description:
        "Marca o lead pra retomar assim que a clínica abrir, quando o contato eletivo aconteceu com a clínica fechada — o bot não consulta horários agora; a equipe vê o lead na coluna 'Aguardando resposta' do Kanban ao abrir e retoma manualmente.",
      inputSchema: z.object({}),
      execute: async () => {
        await supabase.from("leads").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", lead.id);
        return { registrado: true };
      },
    }),

    agendarPaciente: tool({
      description:
        "Cria um agendamento real na agenda da clínica depois que o paciente escolheu um dos horários oferecidos por consultarDisponibilidade.",
      inputSchema: z.object({
        nome: z.string().min(1),
        telefone: z.string().min(8),
        data: z.string().regex(DATE_REGEX, "use o formato AAAA-MM-DD"),
        horario: z.string().regex(TIME_REGEX, "use o formato HH:mm"),
      }),
      execute: async ({ nome, telefone, data, horario }) => {
        const scheduledAt = new Date(`${data}T${horario}:00-03:00`);
        if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) {
          return { sucesso: false, motivo: "Esse horário já passou ou é inválido. Ofereça outro." };
        }

        const conflict = await findOverlappingAppointment(supabase, {
          clinicId: clinic.id,
          professionalName,
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: APPOINTMENT_SLOT_MINUTES,
        });
        if (conflict) {
          return { sucesso: false, motivo: "Esse horário acabou de ser ocupado. Ofereça outro horário livre." };
        }

        const patientId = await upsertPatientFromContact(supabase, clinic.id, nome, telefone);

        const { data: appointment, error } = await supabase
          .from("appointments")
          .insert({
            clinic_id: clinic.id,
            scheduled_at: scheduledAt.toISOString(),
            duration_minutes: APPOINTMENT_SLOT_MINUTES,
            professional_name: professionalName,
            patient_id: patientId,
            patient_name: nome,
            patient_phone: telefone,
          })
          .select("*")
          .single();

        if (error || !appointment) {
          // 23P01 = exclusion_violation — mesma constraint de agenda da migration 022.
          if (error?.code === "23P01") {
            return { sucesso: false, motivo: "Esse horário acabou de ser ocupado. Ofereça outro horário livre." };
          }
          return { sucesso: false, motivo: "Não consegui agendar agora. Peça pra recepção confirmar depois." };
        }

        await recordAppointmentEvent(supabase, {
          appointmentId: appointment.id,
          clinicId: clinic.id,
          eventType: "created",
          toStatus: "agendado",
          actor: "sistema",
        });

        await supabase
          .from("leads")
          .update({ status: "scheduled", patient_name: nome, updated_at: new Date().toISOString() })
          .eq("id", lead.id);

        return { sucesso: true };
      },
    }),

    alertarUrgencia: tool({
      description:
        "Aciona a recepção/dentista imediatamente quando o relato do paciente indica urgência (inchaço, trauma ou dor aguda contínua).",
      inputSchema: z.object({
        resumo_clinico: z.string().min(1),
      }),
      execute: async ({ resumo_clinico }) => {
        await supabase
          .from("leads")
          .update({ status: "urgent", clinical_summary: resumo_clinico, updated_at: new Date().toISOString() })
          .eq("id", lead.id);

        // Best-effort — mesmo padrão de notifyClinicSigned em lib/evolution.ts:
        // uma falha de WhatsApp não pode travar a resposta ao paciente.
        if (clinic.notify_phone) {
          await sendText(
            clinic,
            clinic.notify_phone,
            `🚨 Possível urgência via triagem do WhatsApp (${lead.patient_phone}): ${resumo_clinico}`
          );
        }

        return { registrado: true };
      },
    }),
  };
}

/**
 * Roda o agente de triagem sobre o histórico atual do lead (já incluindo a
 * mensagem recém-recebida do paciente, gravada pelo chamador antes desta
 * função) e devolve o texto de resposta — já persistido em lead_messages como
 * 'bot'. Quem chama ainda precisa enviar esse texto pelo WhatsApp.
 */
export async function runLeadTriageAgent(supabase: SupabaseClient, clinic: Clinic, lead: Lead): Promise<string> {
  const { data: historyData } = await supabase
    .from("lead_messages")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: true })
    .limit(30);
  const history = (historyData as LeadMessage[]) ?? [];

  const messages = history.map((m) => ({
    role: m.role === "patient" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    system: buildSystemPrompt(clinic),
    messages,
    stopWhen: stepCountIs(6),
    tools: buildLeadTools(supabase, clinic, lead),
  });

  const replyText = result.text.trim() || "Recebi sua mensagem, já te respondo!";
  await appendLeadMessage(supabase, { leadId: lead.id, clinicId: clinic.id, role: "bot", content: replyText });
  return replyText;
}
