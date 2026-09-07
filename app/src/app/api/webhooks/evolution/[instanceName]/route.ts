import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseInboundMessage, sendText } from "@/lib/evolution";
import { advanceConversation, formatQuestionPrompt } from "@/lib/conversationEngine";
import { createAnamnesis } from "@/lib/anamnesis";
import { brPhoneVariants } from "@/lib/validation";
import { matchConfirmCancel, processAppointmentResponse } from "@/lib/appointmentNotifications";
import { findPendingAppointmentForPhone } from "@/lib/appointments";
import { findOpenLead, findOrCreateOpenLead, appendLeadMessage, matchesLeadBotTrigger } from "@/lib/leads";
import type { Clinic, Conversation, Lead, LeadMessage, Question } from "@/lib/database.types";

/** Janela dentro da qual um `fromMe` com o mesmo texto de uma mensagem 'bot'
 * recém-gravada é tratado como eco da própria resposta do bot, não como
 * handoff manual — ver `handleOutboundEcho`. */
const BOT_ECHO_WINDOW_MS = 30_000;

/** Intervalo mínimo entre dois avisos de `maybeSendLeadAlert` pro mesmo lead —
 * uma conversa de ida e volta ping­aria a equipe a cada mensagem sem isso. */
const LEAD_ALERT_THROTTLE_MS = 15 * 60_000;

/**
 * Recebe eventos MESSAGES_UPSERT da Evolution API. Configure isso no "Set Webhook"
 * da instância de cada clínica (ver guia-deploy-saas.md). Sempre respondemos 200
 * rapidamente, mesmo quando ignoramos o evento — não queremos que a Evolution
 * fique retentando um webhook que não vamos processar mesmo.
 */
export async function POST(req: NextRequest, { params }: { params: { instanceName: string } }) {
  const payload = await req.json().catch(() => null);
  const inbound = parseInboundMessage(payload);

  // `inboundText` é o texto real OU um rótulo tipo "[áudio]" quando a mensagem
  // é só mídia — assim um primeiro contato só por áudio/imagem ainda vira lead.
  // `isMediaOnly` marca esse caso pros fluxos que precisam de texto de verdade
  // (anamnese, confirmar/cancelar agendamento) o ignorarem.
  const inboundText = inbound?.text ?? inbound?.mediaLabel ?? null;
  const isMediaOnly = !!inbound && !inbound.text && !!inbound.mediaLabel;

  if (!inbound || !inboundText) {
    console.log(
      `[evolution-webhook] instance=${params.instanceName} ignorado: inbound=${
        inbound ? JSON.stringify({ fromMe: inbound.fromMe, hasText: !!inbound.text }) : "não parseou o payload"
      }`
    );
    return NextResponse.json({ ok: true });
  }

  const supabase = createSupabaseAdminClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("evolution_instance_name", params.instanceName)
    .maybeSingle();
  if (!clinic) {
    console.log(`[evolution-webhook] instance=${params.instanceName} ignorado: nenhuma clínica com esse evolution_instance_name`);
    return NextResponse.json({ ok: true });
  }

  if (inbound.fromMe) {
    await handleOutboundEcho(supabase, clinic, inbound.phone, inboundText);
    return NextResponse.json({ ok: true });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("clinic_id", clinic.id)
    .in("patient_phone", brPhoneVariants(inbound.phone))
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Mídia no meio de uma anamnese não é uma resposta válida — pede texto e sai
  // (não avança o motor de conversa nem abre lead).
  if (conversation && isMediaOnly) {
    await sendText(clinic, inbound.phone, "Recebi seu arquivo, mas preciso da resposta em texto pra continuar. 🙏");
    return NextResponse.json({ ok: true });
  }

  if (!conversation) {
    // Nenhuma anamnese em andamento pra esse número — antes de tratar como
    // lead, checa se é uma resposta de confirmação de agendamento (canal
    // alternativo ao link, ver lib/appointmentNotifications.ts). Mídia pura
    // nunca é confirmar/cancelar, então esse ramo só vale pra texto real.
    const pendingAppointment = isMediaOnly
      ? null
      : await findPendingAppointmentForPhone(supabase, clinic.id, inbound.phone);
    if (pendingAppointment) {
      const action = matchConfirmCancel(inboundText);
      if (action) {
        console.log(
          `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} appointment=${pendingAppointment.id} resposta="${action}" via texto livre`
        );
        await processAppointmentResponse(supabase, clinic, pendingAppointment, action, "paciente");
        return NextResponse.json({ ok: true });
      }
      // Tem agendamento pendente mas não é confirmar/cancelar — orienta a usar
      // o link e SEGUE pro fluxo de lead abaixo (a mensagem é uma dúvida real
      // que a equipe precisa ver no quadro, não pode se perder).
      await sendText(
        clinic,
        inbound.phone,
        `Pra confirmar ou cancelar sua consulta, toque aqui: ${process.env.NEXT_PUBLIC_APP_URL}/confirmacao/${pendingAppointment.confirm_token}`
      );
    }

    // Número desconhecido (ou fora do fluxo já mapeado). É aqui que o Mini-CRM
    // entra: registra o contato como lead pra equipe atender pelo Kanban, a
    // menos que a clínica tenha desligado isso em `lead_bot_enabled`.
    if (!clinic.lead_bot_enabled) {
      console.log(
        `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} ignorado: lead_bot_enabled=false para o telefone ${inbound.phone}`
      );
      return NextResponse.json({ ok: true });
    }

    // `lead_bot_trigger_phrase` NÃO bloqueia mais a criação do lead (regra:
    // não perder nenhum lead). Ela só decide se a equipe recebe o alerta no
    // celular e se a saudação automática sai — pra spam/propaganda no mesmo
    // número entrar no quadro em silêncio em vez de sumir. `matchesLeadBotTrigger`
    // devolve true quando não há frase configurada, mantendo o comportamento
    // padrão intacto.
    const existingLead = await findOpenLead(supabase, clinic.id, inbound.phone);
    const genuineContact = matchesLeadBotTrigger(clinic.lead_bot_trigger_phrase, inboundText);

    const lead = existingLead ?? (await findOrCreateOpenLead(supabase, clinic.id, inbound.phone));
    await appendLeadMessage(supabase, {
      leadId: lead.id,
      clinicId: clinic.id,
      role: "patient",
      content: inboundText,
    });

    // Saudação automática: só no primeiro contato de um lead novo E quando a
    // mensagem bate com a frase-gatilho (ou não há frase) — não manda o texto
    // do anúncio pra um spammer. Gravada como 'bot' pra handleOutboundEcho não
    // confundir o eco dela com um handoff manual.
    if (!existingLead && genuineContact && clinic.lead_bot_greeting?.trim()) {
      const greeting = clinic.lead_bot_greeting.trim();
      try {
        await sendText(clinic, inbound.phone, greeting);
        await appendLeadMessage(supabase, { leadId: lead.id, clinicId: clinic.id, role: "bot", content: greeting });
        console.log(`[evolution-webhook] clinic=${clinic.id} lead=${lead.id} saudação automática enviada`);
      } catch (err) {
        console.error("Falha ao enviar saudação automática do lead:", err);
      }
    }

    console.log(
      `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} lead=${lead.id} mensagem registrada — atendimento humano`
    );

    // Alerta pro celular da equipe: sempre em conversa já aberta; num contato
    // novo, só se bater com a frase-gatilho (ou não há frase).
    if (existingLead || genuineContact) {
      await maybeSendLeadAlert(supabase, clinic, lead, inbound.phone, inboundText);
    }

    return NextResponse.json({ ok: true });
  }

  console.log(
    `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} conversation=${conversation.id} processando resposta`
  );

  const typedConversation = conversation as Conversation;
  const result = advanceConversation(
    typedConversation.questions,
    typedConversation.current_index,
    typedConversation.answers,
    inbound.text ?? ""
  );

  if (result.kind === "clarify") {
    await sendText(clinic, inbound.phone, result.prompt);
    return NextResponse.json({ ok: true });
  }

  if (result.kind === "next") {
    await supabase
      .from("conversations")
      .update({
        current_index: result.nextIndex,
        answers: result.answers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", typedConversation.id);

    await sendText(clinic, inbound.phone, formatQuestionPrompt(result.question as Question));
    return NextResponse.json({ ok: true });
  }

  // result.kind === "done"
  const anamnesis = await createAnamnesis(supabase, {
    clinicId: clinic.id,
    patientName: typedConversation.patient_name,
    patientPhone: typedConversation.patient_phone,
    answers: result.answers,
  });

  await supabase
    .from("conversations")
    .update({ answers: result.answers, status: "completed", updated_at: new Date().toISOString() })
    .eq("id", typedConversation.id);

  if (anamnesis) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL}/assinatura?token=${anamnesis.token}`;
    await sendText(
      clinic,
      inbound.phone,
      `Perfeito! Agora é só confirmar suas respostas e assinar: ${link}`
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Espelha um aviso da mensagem do paciente pro `clinic.notify_phone` (ex.: o
 * celular pessoal da dentista). Existe porque o app WhatsApp Business da
 * clínica não notifica em segundo plano enquanto o Evolution está vinculado
 * como aparelho — o WhatsApp suprime o push do aparelho principal quando há um
 * companion tipo Baileys sempre conectado. O `notify_phone`, por não ter
 * vínculo, notifica normal.
 *
 * Throttle de `LEAD_ALERT_THROTTLE_MS` por lead (via `leads.last_alert_at`)
 * pra não pingar a cada mensagem de uma mesma conversa. Best-effort: falha de
 * WhatsApp aqui não pode travar o 200 do webhook.
 */
async function maybeSendLeadAlert(
  supabase: SupabaseClient,
  clinic: Clinic,
  lead: Lead,
  patientPhone: string,
  text: string
): Promise<void> {
  if (!clinic.lead_alert_enabled || !clinic.notify_phone) return;

  // Não avisa se quem mandou a mensagem é o próprio número de aviso (a dentista
  // testando a linha da clínica pelo celular dela, p.ex.) — evita eco.
  const patientVariants = new Set(brPhoneVariants(patientPhone));
  if (brPhoneVariants(clinic.notify_phone).some((v) => patientVariants.has(v))) return;

  if (
    lead.last_alert_at &&
    Date.now() - new Date(lead.last_alert_at).getTime() < LEAD_ALERT_THROTTLE_MS
  ) {
    return;
  }

  const quem = lead.patient_name || "Paciente";
  try {
    await sendText(
      clinic,
      clinic.notify_phone,
      `🔔 Mensagem na linha da clínica\n\n${quem} (${patientPhone}):\n"${text}"\n\nResponda pelo app WhatsApp Business da clínica.`
    );
    await supabase
      .from("leads")
      .update({ last_alert_at: new Date().toISOString() })
      .eq("id", lead.id);
  } catch (err) {
    console.error("Falha ao espelhar aviso de lead pro notify_phone:", err);
  }
}

/**
 * A Evolution API ecoa no webhook tanto as mensagens enviadas por ela mesma
 * (via `sendText`, quando o bot responde) quanto as digitadas manualmente no
 * aparelho pareado — as duas chegam com `fromMe: true`, sem nenhum campo que
 * diferencie uma da outra. Comparar com o que o próprio bot acabou de gravar
 * em `lead_messages` (role 'bot') é a única forma de não confundir as duas:
 * se bater texto e estiver dentro da janela, é eco do bot (ignora); senão, é
 * a dentista respondendo de verdade pelo WhatsApp dela — handoff real, grava
 * como 'staff' e pausa o bot (`waiting_reply`) até a equipe reabrir o lead.
 */
async function handleOutboundEcho(supabase: SupabaseClient, clinic: Clinic, phone: string, text: string): Promise<void> {
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("clinic_id", clinic.id)
    .in("patient_phone", brPhoneVariants(phone))
    .neq("status", "scheduled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lead) return; // não é um lead em triagem aberta — nada a fazer aqui

  const { data: recentBotMessages } = await supabase
    .from("lead_messages")
    .select("content, created_at")
    .eq("lead_id", lead.id)
    .eq("role", "bot")
    .order("created_at", { ascending: false })
    .limit(3);

  const isBotEcho = ((recentBotMessages as Pick<LeadMessage, "content" | "created_at">[]) ?? []).some(
    (m) => m.content === text && Date.now() - new Date(m.created_at).getTime() < BOT_ECHO_WINDOW_MS
  );
  if (isBotEcho) return;

  await appendLeadMessage(supabase, { leadId: lead.id, clinicId: clinic.id, role: "staff", content: text });
  await supabase.from("leads").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", lead.id);
  console.log(`[evolution-webhook] clinic=${clinic.id} lead=${lead.id} handoff manual detectado — bot pausado (waiting_reply)`);
}
