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
import { runLeadTriageAgent } from "@/lib/leadAgent";
import type { Clinic, Conversation, LeadMessage, Question } from "@/lib/database.types";

/** Janela dentro da qual um `fromMe` com o mesmo texto de uma mensagem 'bot'
 * recém-gravada é tratado como eco da própria resposta do bot, não como
 * handoff manual — ver `handleOutboundEcho`. */
const BOT_ECHO_WINDOW_MS = 30_000;

/**
 * Recebe eventos MESSAGES_UPSERT da Evolution API. Configure isso no "Set Webhook"
 * da instância de cada clínica (ver guia-deploy-saas.md). Sempre respondemos 200
 * rapidamente, mesmo quando ignoramos o evento — não queremos que a Evolution
 * fique retentando um webhook que não vamos processar mesmo.
 */
export async function POST(req: NextRequest, { params }: { params: { instanceName: string } }) {
  const payload = await req.json().catch(() => null);
  const inbound = parseInboundMessage(payload);

  if (!inbound || !inbound.text) {
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
    await handleOutboundEcho(supabase, clinic, inbound.phone, inbound.text);
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

  if (!conversation) {
    // Nenhuma anamnese em andamento pra esse número — antes de desistir do
    // evento, checa se é uma resposta de confirmação de agendamento (canal
    // alternativo ao link, ver lib/appointmentNotifications.ts).
    const pendingAppointment = await findPendingAppointmentForPhone(supabase, clinic.id, inbound.phone);
    if (pendingAppointment) {
      const action = matchConfirmCancel(inbound.text);
      if (action) {
        console.log(
          `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} appointment=${pendingAppointment.id} resposta="${action}" via texto livre`
        );
        await processAppointmentResponse(supabase, clinic, pendingAppointment, action, "paciente");
        return NextResponse.json({ ok: true });
      }
      // Tem agendamento pendente mas o texto não deu pra interpretar como
      // confirmar/cancelar — orienta a usar o link, que é sempre inequívoco.
      await sendText(
        clinic,
        inbound.phone,
        `Não entendi. Pra confirmar ou cancelar sua consulta, toque aqui: ${process.env.NEXT_PUBLIC_APP_URL}/confirmacao/${pendingAppointment.confirm_token}`
      );
      return NextResponse.json({ ok: true });
    }

    // Nenhuma anamnese em andamento, nenhum agendamento pendente — número
    // desconhecido (ou fora do fluxo já mapeado). É aqui que o Mini-CRM entra:
    // a triagem por IA assume a conversa, a menos que a clínica tenha
    // desligado o bot em `lead_bot_enabled`.
    if (!clinic.lead_bot_enabled) {
      console.log(
        `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} ignorado: lead_bot_enabled=false para o telefone ${inbound.phone}`
      );
      return NextResponse.json({ ok: true });
    }

    // Só cria lead NOVO se a mensagem "parecer" um contato genuíno — ver
    // matchesLeadBotTrigger. Uma conversa já aberta (findOpenLead encontra
    // algo) segue normal, o gate só protege a criação do primeiro contato.
    const existingLead = await findOpenLead(supabase, clinic.id, inbound.phone);
    if (!existingLead && !matchesLeadBotTrigger(clinic.lead_bot_trigger_phrase, inbound.text)) {
      console.log(
        `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} ignorado: mensagem não bate com lead_bot_trigger_phrase para ${inbound.phone}`
      );
      return NextResponse.json({ ok: true });
    }

    const lead = existingLead ?? (await findOrCreateOpenLead(supabase, clinic.id, inbound.phone));
    await appendLeadMessage(supabase, {
      leadId: lead.id,
      clinicId: clinic.id,
      role: "patient",
      content: inbound.text,
    });

    // Handoff em andamento (dentista assumiu manualmente ou contato eletivo
    // adiado pra abertura, ver handleOutboundEcho/marcarRetornoParaAmanha) —
    // bot fica calado até a equipe mover o lead de volta pro Kanban.
    if (lead.status === "waiting_reply") {
      console.log(
        `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} lead=${lead.id} em waiting_reply — bot não responde`
      );
      return NextResponse.json({ ok: true });
    }

    console.log(
      `[evolution-webhook] instance=${params.instanceName} clinic=${clinic.id} lead=${lead.id} acionando triagem por IA`
    );

    try {
      const replyText = await runLeadTriageAgent(supabase, clinic, lead);
      await sendText(clinic, inbound.phone, replyText);
    } catch (err) {
      console.error("Falha no agente de triagem de leads:", err);
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
    inbound.text
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
