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

/** A partir dessa hora, um caso urgente nunca é agendado pelo bot sozinho —
 * só por ligação direta com a clínica (a equipe decide o encaixe manualmente
 * no fim do dia). Mais cedo que AGENDA_END_HOUR de propósito. */
const URGENT_BOOKING_CUTOFF_HOUR = 18;

/** Marca o início do bloco de contexto dinâmico injetado na última mensagem
 * (ver buildContextNote) — precisa ser reconhecível o bastante pro modelo
 * saber que aquele trecho não veio do paciente. */
const CONTEXT_NOTE_MARKER = "[CONTEXTO ATUAL]";

/** Data/hora reais + status da clínica — muda a cada chamada, por isso fica
 * de fora do prompt de sistema (que precisa ser estático pro cache de prompt
 * funcionar) e é injetado só na mensagem mais recente. */
function buildContextNote(): string {
  const now = new Date();
  const nowIso = now.toISOString();
  const hoje = brDateOnly();
  const diaSemana = formatBRWeekday(nowIso, "long");
  const horaAtual = formatBRTime(nowIso);
  const isHorarioComercial = brHour(now) >= AGENDA_START_HOUR && brHour(now) < AGENDA_END_HOUR;
  const statusClinica = isHorarioComercial ? "ABERTA" : "FECHADA no momento";

  return `${CONTEXT_NOTE_MARKER} Hoje é ${diaSemana}, ${hoje} (AAAA-MM-DD), agora são ${horaAtual} (horário de Brasília) — a clínica está ${statusClinica} (horário de atendimento: ${AGENDA_START_HOUR}h às ${AGENDA_END_HOUR}h). [/CONTEXTO ATUAL]`;
}

/**
 * 100% estático por clínica (nunca muda entre chamadas pro mesmo `clinic.id`)
 * — é o que permite o cache de prompt da Anthropic reaproveitar esse bloco
 * grande (persona + regras + descrição das tools) em vez de recomputar/
 * repagar ele inteiro a cada mensagem. A data/hora reais (que mudam a cada
 * chamada e antes ficavam aqui, quebrando o cache) agora entram só na última
 * mensagem, via CONTEXT_NOTE_MARKER — ver buildContextNote/runLeadTriageAgent.
 */
function buildSystemPrompt(clinic: Clinic): string {
  return `Você é a assistente de triagem da clínica odontológica ${clinic.name}. Responda de forma humana, concisa e com empatia. Nunca faça diagnósticos ou prescreva remédios.
A mensagem mais recente do paciente pode vir precedida de um bloco "${CONTEXT_NOTE_MARKER} ..." — isso é informação do sistema (data/hora reais e se a clínica está aberta), não foi o paciente que escreveu. Use SEMPRE essa data/hora real como referência ao interpretar "hoje", "amanhã" ou qualquer data relativa que o paciente mencionar — nunca chute ou assuma outra data, e sempre passe a data no formato AAAA-MM-DD pras ferramentas. Sem esse bloco (mensagens mais antigas no histórico), ignore — vale só o mais recente.
1. Pergunte o nome se não souber. Assim que o paciente informar o nome, chame a ferramenta registrarNome imediatamente (antes de continuar as perguntas). Entenda o motivo do contato. O telefone já é conhecido (é o número desta própria conversa) — nunca peça o telefone ao paciente.
2. Se o paciente relatar dor, pergunte (uma por vez): A dor é contínua ou com estímulo? Há inchaço? Houve trauma recente?
3. Se houver inchaço, trauma ou dor aguda contínua, chame imediatamente a ferramenta alertarUrgencia. Depois:
   - Se a clínica estiver ABERTA e for antes das ${URGENT_BOOKING_CUTOFF_HOUR}h: diga que a equipe já foi avisada e a doutora responde em instantes.
   - Se for ${URGENT_BOOKING_CUTOFF_HOUR}h ou mais tarde (mesmo com a clínica ainda ABERTA): NUNCA tente agendar você mesma (não chame agendarPaciente) — diga que a equipe já foi avisada, mas que casos urgentes nesse horário precisam de uma ligação direta pra clínica encaixar o atendimento, e peça pro paciente ligar (chamada de voz) aqui mesmo pelo WhatsApp.
   - Se a clínica estiver FECHADA: diga que a clínica está fechada agora, mas que o caso já foi marcado com prioridade máxima e a doutora entra em contato assim que abrir, às ${AGENDA_START_HOUR}h; se a dor estiver insuportável, oriente a buscar um pronto-socorro.
4. Se for caso eletivo (limpeza, dor leve, avaliação):
   - Se a clínica estiver ABERTA: chame consultarDisponibilidade e ofereça até duas opções de horário. Se o paciente pedir um horário específico, passe-o em horario_preferido e confie SOMENTE no campo disponivel_no_horario_pedido pra saber se está livre — nunca conclua que não tem vaga só porque o horário pedido não apareceu na lista de sugestões. Após o paciente escolher, chame agendarPaciente.
   - Se a clínica estiver FECHADA: não consulte horários agora — avise com simpatia que o agendamento continua assim que a clínica abrir, às ${AGENDA_START_HOUR}h, e chame marcarRetornoParaAmanha.
5. NUNCA diga ao paciente que não há vaga/horário disponível, em nenhuma hipótese, nem sugira "tente outro dia" por conta própria. Se consultarDisponibilidade não retornar horários livres (em qualquer data), peça para ele ligar (chamada de voz) aqui mesmo pelo WhatsApp, pra clínica encontrar um encaixe.
6. Se o paciente pedir ou insistir num horário FORA do expediente (antes das ${AGENDA_START_HOUR}h ou às/depois das ${AGENDA_END_HOUR}h, de qualquer dia), NUNCA tente agendar nesse horário (agendarPaciente recusa mesmo assim) e não fique só oferecendo outro dia — peça diretamente pra ele ligar (chamada de voz) aqui mesmo pelo WhatsApp e falar com o atendimento, que eles veem se dá pra abrir uma exceção.
7. NUNCA diga que um agendamento foi criado/confirmado sem ter chamado agendarPaciente e recebido sucesso:true de volta. Se vier sucesso:false, explique o motivo ao paciente (nunca finja que deu certo) e ofereça outro horário ou peça pra ligar.`;
}

/**
 * Tools do agente — fecham sobre `supabase`/`clinic`/`lead` porque cada
 * execução (dentro de generateText) precisa gravar direto nas tabelas reais
 * de agenda/leads da clínica, não em dados fictícios.
 */
function buildLeadTools(supabase: SupabaseClient, clinic: Clinic, lead: Lead): ToolSet {
  const professionalName = clinic.dentist_name || clinic.name;
  // Fechada sobre as duas tools abaixo: alertarUrgencia marca true assim que
  // roda, mesmo dentro do mesmo turno (o `lead.status` do banco só reflete
  // isso na próxima chamada) — é o que permite agendarPaciente barrar um
  // agendamento urgente tarde da noite mesmo quando as duas tools são
  // chamadas na mesma mensagem. Regra de negócio explícita: depois das
  // URGENT_BOOKING_CUTOFF_HOUR, urgência nunca é agendada pelo bot sozinho.
  let leadIsUrgent = lead.status === "urgent";

  return {
    consultarDisponibilidade: tool({
      description:
        "Consulta os horários livres da agenda da clínica numa data específica. Se o paciente pediu um horário específico, informe em horario_preferido — a resposta traz disponivel_no_horario_pedido dizendo se EXATAMENTE aquele horário está livre; a lista de horarios só mostra até 3 sugestões e pode não incluir um horário que também está livre, então nunca deduza indisponibilidade pela ausência dele na lista, só pelo campo disponivel_no_horario_pedido.",
      inputSchema: z.object({
        data: z.string().regex(DATE_REGEX, "use o formato AAAA-MM-DD"),
        horario_preferido: z.string().regex(TIME_REGEX, "use o formato HH:mm").optional(),
      }),
      execute: async ({ data, horario_preferido }) => {
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
        const isFree = (s: string) => !startTimes.has(s) && !continuationMap.has(s) && new Date(s).getTime() > now;

        const free = slots.filter(isFree);

        if (free.length === 0) {
          return {
            horarios: [],
            mensagem:
              "Nenhum horário livre nesse dia. NUNCA diga ao paciente que não há vaga ou disponibilidade — em vez disso, peça para ele ligar (chamada de voz) aqui mesmo pelo WhatsApp, que a clínica encontra um encaixe.",
          };
        }

        if (horario_preferido) {
          const preferidoSlot = slots.find((s) => formatBRTime(s) === horario_preferido);
          const disponivel = !!preferidoSlot && isFree(preferidoSlot);
          const horarios = disponivel
            ? [horario_preferido, ...free.filter((s) => formatBRTime(s) !== horario_preferido).slice(0, 2).map((s) => formatBRTime(s))]
            : free.slice(0, 3).map((s) => formatBRTime(s));
          return { horarios, disponivel_no_horario_pedido: disponivel };
        }

        return { horarios: free.slice(0, 3).map((s) => formatBRTime(s)) };
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
        "Cria um agendamento real na agenda da clínica depois que o paciente escolheu um dos horários oferecidos por consultarDisponibilidade. O telefone já é conhecido (é o número desta própria conversa) — nunca peça o telefone ao paciente.",
      inputSchema: z.object({
        nome: z.string().min(1),
        data: z.string().regex(DATE_REGEX, "use o formato AAAA-MM-DD"),
        horario: z.string().regex(TIME_REGEX, "use o formato HH:mm"),
      }),
      execute: async ({ nome, data, horario }) => {
        const horarioHour = Number(horario.slice(0, 2));
        if (horarioHour < AGENDA_START_HOUR || horarioHour >= AGENDA_END_HOUR) {
          return {
            sucesso: false,
            motivo: `Fora do horário de atendimento (${AGENDA_START_HOUR}h às ${AGENDA_END_HOUR}h) — nunca agende nesse horário. Oriente o paciente a ligar (chamada de voz) aqui mesmo pelo WhatsApp e falar com o atendimento.`,
          };
        }

        if (leadIsUrgent && brHour(new Date()) >= URGENT_BOOKING_CUTOFF_HOUR) {
          return {
            sucesso: false,
            motivo: `Depois das ${URGENT_BOOKING_CUTOFF_HOUR}h, caso urgente não é agendado automaticamente — oriente o paciente a ligar (chamada de voz) aqui mesmo pelo WhatsApp pra clínica encaixar o atendimento.`,
          };
        }

        const telefone = lead.patient_phone;
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

        // Best-effort — mesmo padrão de alertarUrgencia: uma falha de WhatsApp
        // não pode travar a confirmação ao paciente, que já foi salva.
        if (clinic.notify_phone) {
          await sendText(
            clinic,
            clinic.notify_phone,
            `📅 Agendamento automático via WhatsApp: ${nome} (${telefone}) — ${formatBRWeekday(scheduledAt.toISOString(), "long")}, ${data.split("-").reverse().join("/")} às ${horario}.`
          );
        }

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
        leadIsUrgent = true;
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

  // Injeta a data/hora reais só na mensagem mais recente (sempre a do
  // paciente que disparou esta chamada) — ver buildContextNote/CONTEXT_NOTE_MARKER.
  // Mantém o prompt de sistema 100% estático entre chamadas, permitindo o
  // cache de prompt da Anthropic reaproveitar o bloco grande (persona +
  // regras + tools) em vez de pagar ele inteiro de novo a cada mensagem.
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    lastMessage.content = `${buildContextNote()}\n${lastMessage.content}`;
  }

  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    system: buildSystemPrompt(clinic),
    messages,
    stopWhen: stepCountIs(6),
    tools: buildLeadTools(supabase, clinic, lead),
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });

  let replyText = result.text.trim() || "Recebi sua mensagem, já te respondo!";

  // Guarda de segurança: o texto do modelo não é a fonte da verdade sobre se
  // um agendamento foi realmente criado — só um sucesso:true de agendarPaciente
  // é. Sem isso, o modelo pode "confirmar" uma consulta que nunca foi salva no
  // banco (já aconteceu: o paciente recebeu confirmação, a agenda ficou vazia).
  const agendouComSucesso = result.toolResults.some(
    (r) => r.toolName === "agendarPaciente" && (r.output as { sucesso?: boolean } | undefined)?.sucesso === true
  );
  const pareceConfirmarAgendamento = /agendamento\s*(foi|est[áa])?\s*confirmad[oa]|voc[eê]\s+est[áa]\s+agendad[oa]|marquei\s+(sua\s+|a\s+)?consulta/i.test(
    replyText
  );
  if (pareceConfirmarAgendamento && !agendouComSucesso) {
    console.error(
      `[leadAgent] lead=${lead.id} resposta parecia confirmar agendamento sem sucesso real de agendarPaciente — bloqueando`,
      { replyText, toolResults: result.toolResults }
    );
    replyText = "Só um instante — vou confirmar esse horário certinho com a equipe e te aviso assim que estiver garantido.";
    await supabase.from("leads").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", lead.id);
  }

  await appendLeadMessage(supabase, { leadId: lead.id, clinicId: clinic.id, role: "bot", content: replyText });
  return replyText;
}
