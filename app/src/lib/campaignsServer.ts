import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasWhatsApp, sendMedia, sendText } from "@/lib/evolution";
import { findPendingAppointmentForPhone } from "@/lib/appointments";
import { appendLeadMessage, findOpenLead, findOrCreateOpenLead } from "@/lib/leads";
import { brDateOnly, brDayRangeUtc } from "@/lib/date";
import { brPhoneVariants } from "@/lib/validation";
import {
  CAMPAIGN_DAILY_LIMIT,
  CAMPAIGN_DECLINE_CONFIRMATION,
  CAMPAIGN_MANUAL_SKIP_REASON,
  CAMPAIGN_MAX_CONSECUTIVE_FAILURES,
  CAMPAIGN_NO_WHATSAPP_REASON,
  CAMPAIGN_WRONG_NUMBER_REASON,
  OPT_OUT_SOURCE_WRONG_NUMBER,
  CAMPAIGN_REPLY_WINDOW_DAYS,
  canonicalCampaignPhone,
  classifyCampaignReply,
  isCampaignSendingWindow,
  nextCampaignSendAt,
  renderCampaignText,
} from "@/lib/campaigns";
import type { Clinic, Lead, MarketingCampaign, MarketingCampaignRecipient } from "@/lib/database.types";

export const CAMPAIGN_MEDIA_BUCKET = "campaign-media";

/** Janela em que um `fromMe` pro mesmo número é eco de mensagem de campanha (não a dentista digitando). */
const CAMPAIGN_ECHO_WINDOW_MS = 60_000;

/** Lê todas as linhas de uma query paginando de 1000 em 1000 (limite padrão do PostgREST). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export interface AudienceMember {
  phone: string;
  name: string | null;
  patient_id: string | null;
  lead_id: string | null;
}

/**
 * Monta o público da campanha: pacientes com telefone (opcionalmente só os
 * já atendidos) e/ou leads cujo telefone não é de paciente nenhum. Sem
 * duplicar telefone, sem quem pediu pra sair e sem o próprio celular de aviso
 * da clínica.
 */
export async function buildCampaignAudience(
  supabase: SupabaseClient,
  clinic: Pick<Clinic, "id" | "notify_phone">,
  options: Pick<MarketingCampaign, "audience" | "only_attended">
): Promise<AudienceMember[]> {
  const [patients, leads, optOuts] = await Promise.all([
    fetchAll<{ id: string; name: string | null; phone: string | null }>((from, to) =>
      supabase.from("patients").select("id, name, phone").eq("clinic_id", clinic.id).not("phone", "is", null).order("created_at").range(from, to)
    ),
    options.audience === "pacientes"
      ? Promise.resolve([])
      : fetchAll<{ id: string; patient_name: string | null; patient_phone: string }>((from, to) =>
          supabase.from("leads").select("id, patient_name, patient_phone").eq("clinic_id", clinic.id).order("created_at", { ascending: false }).range(from, to)
        ),
    fetchAll<{ phone: string }>((from, to) => supabase.from("marketing_opt_outs").select("phone").eq("clinic_id", clinic.id).range(from, to)),
  ]);

  let attended: Set<string> | null = null;
  if (options.only_attended && options.audience !== "leads") {
    const rows = await fetchAll<{ patient_id: string }>((from, to) =>
      supabase.from("appointments").select("patient_id").eq("clinic_id", clinic.id).eq("status", "atendido").not("patient_id", "is", null).range(from, to)
    );
    attended = new Set(rows.map((r) => r.patient_id));
  }

  const excluded = new Set(optOuts.map((o) => canonicalCampaignPhone(o.phone)).filter((p): p is string => !!p));
  const notify = canonicalCampaignPhone(clinic.notify_phone);
  if (notify) excluded.add(notify);

  const patientPhones = new Set(patients.map((p) => canonicalCampaignPhone(p.phone)).filter((p): p is string => !!p));
  const members = new Map<string, AudienceMember>();

  if (options.audience !== "leads") {
    for (const p of patients) {
      const phone = canonicalCampaignPhone(p.phone);
      if (!phone || excluded.has(phone) || members.has(phone)) continue;
      if (attended && !attended.has(p.id)) continue;
      members.set(phone, { phone, name: p.name, patient_id: p.id, lead_id: null });
    }
  }
  if (options.audience !== "pacientes") {
    for (const l of leads) {
      const phone = canonicalCampaignPhone(l.patient_phone);
      // Telefone de paciente = o lead virou paciente; não entra como lead.
      if (!phone || excluded.has(phone) || patientPhones.has(phone) || members.has(phone)) continue;
      members.set(phone, { phone, name: l.patient_name, patient_id: null, lead_id: l.id });
    }
  }
  return Array.from(members.values());
}

/** Gera a fila de destinatários e coloca a campanha em "enviando". Só a partir de rascunho. */
export async function startCampaign(supabase: SupabaseClient, clinic: Clinic, campaign: MarketingCampaign): Promise<{ count: number }> {
  // Quem foi retirado no rascunho já tem linha "skipped" na fila — o upsert
  // com ignoreDuplicates abaixo não mexe nela.
  const removed = await manuallyRemovedPhones(supabase, campaign.id);
  const audience = (await buildCampaignAudience(supabase, clinic, campaign)).filter((m) => !removed.has(m.phone));
  if (audience.length === 0) throw new Error("Nenhum contato no público escolhido.");

  for (let i = 0; i < audience.length; i += 500) {
    const chunk = audience.slice(i, i + 500).map((m) => ({ ...m, campaign_id: campaign.id, clinic_id: clinic.id }));
    const { error } = await supabase.from("marketing_campaign_recipients").upsert(chunk, { onConflict: "campaign_id,phone", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("marketing_campaigns")
    .update({ status: "enviando", started_at: now, updated_at: now, pause_reason: null, consecutive_failures: 0 })
    .eq("id", campaign.id)
    .eq("status", "rascunho");
  if (error) throw new Error(error.message);
  return { count: audience.length };
}

async function manuallyRemovedPhones(supabase: SupabaseClient, campaignId: string): Promise<Set<string>> {
  const rows = await fetchAll<{ phone: string }>((from, to) =>
    supabase
      .from("marketing_campaign_recipients")
      .select("phone")
      .eq("campaign_id", campaignId)
      .eq("status", "skipped")
      .eq("skip_reason", CAMPAIGN_MANUAL_SKIP_REASON)
      .range(from, to)
  );
  return new Set(rows.map((r) => r.phone));
}

export type DraftAudienceMember = AudienceMember & { removed: boolean };

/** Rascunho: quem vai receber se iniciar agora, marcando quem a clínica já retirou. */
export async function listDraftAudience(supabase: SupabaseClient, clinic: Clinic, campaign: MarketingCampaign): Promise<DraftAudienceMember[]> {
  const [audience, removed] = await Promise.all([buildCampaignAudience(supabase, clinic, campaign), manuallyRemovedPhones(supabase, campaign.id)]);
  return audience.map((m) => ({ ...m, removed: removed.has(m.phone) })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

/**
 * Tira (removed=true) ou devolve um contato da campanha.
 * - Rascunho: grava/apaga uma linha "skipped" na fila, que o startCampaign respeita.
 * - Enviando/pausada: só mexe em quem ainda está na fila (pending) ou foi retirado à mão.
 */
export async function setCampaignContactRemoved(
  supabase: SupabaseClient,
  clinic: Clinic,
  campaign: MarketingCampaign,
  phone: string,
  removed: boolean
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (campaign.status === "rascunho") {
    if (!removed) {
      const { error } = await supabase
        .from("marketing_campaign_recipients")
        .delete()
        .eq("campaign_id", campaign.id)
        .eq("phone", phone)
        .eq("status", "skipped")
        .eq("skip_reason", CAMPAIGN_MANUAL_SKIP_REASON);
      return error ? { ok: false, status: 500, message: error.message } : { ok: true };
    }
    const member = (await buildCampaignAudience(supabase, clinic, campaign)).find((m) => m.phone === phone);
    if (!member) return { ok: false, status: 404, message: "Contato fora do público desta campanha." };
    const { error } = await supabase.from("marketing_campaign_recipients").upsert(
      { ...member, campaign_id: campaign.id, clinic_id: clinic.id, status: "skipped", skip_reason: CAMPAIGN_MANUAL_SKIP_REASON },
      { onConflict: "campaign_id,phone" }
    );
    return error ? { ok: false, status: 500, message: error.message } : { ok: true };
  }

  if (campaign.status !== "enviando" && campaign.status !== "pausada") {
    return { ok: false, status: 409, message: "Esta campanha já terminou." };
  }
  let query = supabase.from("marketing_campaign_recipients").update(removed ? { status: "skipped", skip_reason: CAMPAIGN_MANUAL_SKIP_REASON } : { status: "pending", skip_reason: null }).eq("campaign_id", campaign.id).eq("phone", phone);
  query = removed ? query.eq("status", "pending") : query.eq("status", "skipped").eq("skip_reason", CAMPAIGN_MANUAL_SKIP_REASON);
  const { data, error } = await query.select("id");
  if (error) return { ok: false, status: 500, message: error.message };
  if (!data || data.length === 0) {
    return { ok: false, status: 409, message: removed ? "Este contato já recebeu o convite (ou não está mais na fila)." : "Este contato não pode voltar para a fila." };
  }
  return { ok: true };
}

async function signedMediaUrl(key: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).createSignedUrl(key, 15 * 60);
  if (error || !data) {
    console.error("Falha ao gerar URL assinada da mídia da campanha:", error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Conteúdo da campanha (depois do SIM): mídia com o texto de legenda, ou só o texto. */
async function sendCampaignContent(clinic: Clinic, campaign: MarketingCampaign, phone: string, name: string | null): Promise<{ ok: boolean; text: string }> {
  const text = renderCampaignText(campaign.content_text, { name, clinicName: clinic.name });
  if (campaign.media_key && campaign.media_type && campaign.media_mime) {
    const url = await signedMediaUrl(campaign.media_key);
    if (url) {
      const ok = await sendMedia(clinic, phone, {
        type: campaign.media_type,
        mimetype: campaign.media_mime,
        url,
        fileName: campaign.media_name || (campaign.media_type === "video" ? "video.mp4" : "imagem.jpg"),
        caption: text,
      });
      if (ok) return { ok, text };
    }
    // Mídia falhou: manda ao menos o texto — a pessoa disse SIM e está esperando.
  }
  return { ok: await sendText(clinic, phone, text), text };
}

/** Manda convite + conteúdo pro celular de aviso da clínica, na hora — pra conferir como chega antes de iniciar. */
export async function sendCampaignTest(clinic: Clinic, campaign: MarketingCampaign): Promise<{ ok: boolean; message?: string }> {
  const phone = canonicalCampaignPhone(clinic.notify_phone);
  if (!phone) return { ok: false, message: "Cadastre o celular de aviso da clínica em Configurações para receber o teste." };
  const invite = renderCampaignText(campaign.invite_text, { name: "Teste", clinicName: clinic.name });
  if (!(await sendText(clinic, phone, `[TESTE] ${invite}`))) return { ok: false, message: "O WhatsApp recusou o envio do convite." };
  const content = await sendCampaignContent(clinic, campaign, phone, "Teste");
  return content.ok ? { ok: true } : { ok: false, message: "O convite saiu, mas o conteúdo falhou." };
}

/** Origem do opt-out desse telefone (`null` = pode receber). */
async function optOutSource(supabase: SupabaseClient, clinicId: string, phone: string): Promise<string | null> {
  const { data } = await supabase.from("marketing_opt_outs").select("source").eq("clinic_id", clinicId).in("phone", brPhoneVariants(phone)).limit(1);
  const row = (data ?? [])[0] as { source: string | null } | undefined;
  return row ? row.source || "whatsapp" : null;
}

/** Motivo pra NÃO mandar o convite agora (null = pode mandar). */
async function skipReason(supabase: SupabaseClient, clinicId: string, recipient: MarketingCampaignRecipient): Promise<string | null> {
  const optOut = await optOutSource(supabase, clinicId, recipient.phone);
  if (optOut) return optOut === OPT_OUT_SOURCE_WRONG_NUMBER ? CAMPAIGN_WRONG_NUMBER_REASON : "Pediu para não receber promoções";
  // "SIM" confirmaria a consulta em vez de responder a campanha.
  if (await findPendingAppointmentForPhone(supabase, clinicId, recipient.phone)) return "Tem consulta aguardando confirmação";
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("clinic_id", clinicId)
    .in("patient_phone", brPhoneVariants(recipient.phone))
    .eq("status", "active")
    .limit(1);
  if ((conversation ?? []).length > 0) return "Anamnese em andamento pelo WhatsApp";
  const since = new Date(Date.now() - CAMPAIGN_REPLY_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: otherInvite } = await supabase
    .from("marketing_campaign_recipients")
    .select("id")
    .eq("clinic_id", clinicId)
    .in("phone", brPhoneVariants(recipient.phone))
    .neq("campaign_id", recipient.campaign_id)
    .gte("sent_at", since)
    .limit(1);
  if ((otherInvite ?? []).length > 0) return `Recebeu convite de outra campanha nos últimos ${CAMPAIGN_REPLY_WINDOW_DAYS} dias`;
  return null;
}

async function finishIfDone(supabase: SupabaseClient, campaignId: string): Promise<void> {
  const { count } = await supabase
    .from("marketing_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "sending"]);
  if ((count ?? 0) > 0) return;
  const now = new Date().toISOString();
  await supabase.from("marketing_campaigns").update({ status: "concluida", finished_at: now, updated_at: now }).eq("id", campaignId).eq("status", "enviando");
}

/**
 * Um "tique" do agendador (chamado a cada minuto pelo pg_cron). Para cada
 * clínica com campanha enviando: no máximo UM convite, se estiver no horário,
 * abaixo do limite do dia e depois do intervalo sorteado desde o último envio.
 */
export async function runCampaignTick(supabase: SupabaseClient, now: Date = new Date()): Promise<{ sent: number; reason?: string }> {
  if (!isCampaignSendingWindow(now)) return { sent: 0, reason: "fora do horário de envio" };

  const { data: active } = await supabase.from("marketing_campaigns").select("*").eq("status", "enviando").order("started_at", { ascending: true });
  const byClinic = new Map<string, MarketingCampaign[]>();
  for (const c of (active as MarketingCampaign[]) ?? []) byClinic.set(c.clinic_id, [...(byClinic.get(c.clinic_id) ?? []), c]);

  let sent = 0;
  for (const [clinicId, campaigns] of Array.from(byClinic.entries())) {
    try {
      if (await sendNextForClinic(supabase, clinicId, campaigns, now)) sent++;
    } catch (err) {
      console.error(`[campaign-sender] clinic=${clinicId} falhou:`, err);
    }
  }
  return { sent };
}

async function sendNextForClinic(supabase: SupabaseClient, clinicId: string, campaigns: MarketingCampaign[], now: Date): Promise<boolean> {
  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  const clinic = clinicData as Clinic | null;
  if (!clinic?.campaigns_enabled) return false;
  if (clinic.campaign_next_send_at && new Date(clinic.campaign_next_send_at) > now) return false;

  const { fromIso } = brDayRangeUtc(brDateOnly(now));
  const { count: sentToday } = await supabase
    .from("marketing_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .gte("sent_at", fromIso);
  if ((sentToday ?? 0) >= CAMPAIGN_DAILY_LIMIT) return false;

  // Portão atômico: se dois tiques se sobrepõem, só um passa daqui.
  const nowIso = now.toISOString();
  const { data: gate } = await supabase
    .from("clinics")
    .update({ campaign_next_send_at: nextCampaignSendAt(now).toISOString() })
    .eq("id", clinicId)
    .or(`campaign_next_send_at.is.null,campaign_next_send_at.lte."${nowIso}"`)
    .select("id");
  if (!gate || gate.length === 0) return false;

  for (const campaign of campaigns) {
    // Pula quem não pode receber agora sem gastar o intervalo; limite de
    // tentativas só pra um tique nunca ficar longo demais.
    for (let attempt = 0; attempt < 15; attempt++) {
      const { data: next } = await supabase
        .from("marketing_campaign_recipients")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next) {
        await finishIfDone(supabase, campaign.id);
        break;
      }
      const { data: claimed } = await supabase
        .from("marketing_campaign_recipients")
        .update({ status: "sending" })
        .eq("id", next.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (!claimed) continue;
      const recipient = claimed as MarketingCampaignRecipient;

      const reason = await skipReason(supabase, clinicId, recipient);
      if (reason) {
        await supabase.from("marketing_campaign_recipients").update({ status: "skipped", skip_reason: reason }).eq("id", recipient.id);
        continue;
      }

      // Número sem WhatsApp: nem tenta mandar. A checagem não envia mensagem;
      // se ela falhar (null), segue e manda normalmente.
      const exists = await hasWhatsApp(clinic, brPhoneVariants(recipient.phone));
      const invite = renderCampaignText(campaign.invite_text, { name: recipient.name, clinicName: clinic.name });
      const ok = exists === false ? false : await sendText(clinic, recipient.phone, invite);
      const sentAt = new Date().toISOString();
      if (ok) {
        await supabase.from("marketing_campaign_recipients").update({ status: "sent", sent_at: sentAt, last_outbound_at: sentAt }).eq("id", recipient.id);
        if (campaign.consecutive_failures > 0) await supabase.from("marketing_campaigns").update({ consecutive_failures: 0 }).eq("id", campaign.id);
        // Lead aberto: o convite aparece no histórico do quadro (como 'bot', pro eco não virar handoff).
        const lead = await findOpenLead(supabase, clinicId, recipient.phone);
        if (lead) await appendLeadMessage(supabase, { leadId: lead.id, clinicId, role: "bot", content: invite });
        console.log(`[campaign-sender] clinic=${clinicId} campaign=${campaign.id} recipient=${recipient.id} convite enviado`);
      } else {
        await supabase
          .from("marketing_campaign_recipients")
          .update({ status: "failed", skip_reason: exists === false ? CAMPAIGN_NO_WHATSAPP_REASON : "Evolution API recusou o envio" })
          .eq("id", recipient.id);
        // "Sem WhatsApp" também conta como erro seguido: se a checagem estiver
        // quebrada (dizendo "não" pra todo mundo), a campanha pausa em vez de
        // marcar a fila inteira.
        const failures = campaign.consecutive_failures + 1;
        const pause = failures >= CAMPAIGN_MAX_CONSECUTIVE_FAILURES;
        await supabase
          .from("marketing_campaigns")
          .update({
            consecutive_failures: failures,
            ...(pause
              ? {
                  status: "pausada",
                  pause_reason: `Pausada automaticamente: ${failures} erros de envio (ou números sem WhatsApp) seguidos. Verifique a conexão do WhatsApp antes de retomar.`,
                }
              : {}),
            updated_at: sentAt,
          })
          .eq("id", campaign.id);
        console.error(`[campaign-sender] clinic=${clinicId} campaign=${campaign.id} falha no envio (${failures} seguidas)${pause ? " — campanha pausada" : ""}`);
      }
      await finishIfDone(supabase, campaign.id);
      return ok;
    }
  }

  // Nada enviado (fila vazia ou só pulados): libera o portão pro próximo tique.
  await supabase.from("clinics").update({ campaign_next_send_at: nowIso }).eq("id", clinicId);
  return false;
}

/**
 * Resposta do contato a um convite de campanha. `handled: true` = o webhook
 * para aqui; `false` = segue o fluxo normal (vira mensagem no quadro de
 * leads pra equipe responder). No SIM devolve o lead criado pra o webhook
 * avisar a equipe.
 */
export async function handleCampaignReply(
  supabase: SupabaseClient,
  clinic: Clinic,
  phone: string,
  text: string
): Promise<{ handled: boolean; lead?: Lead }> {
  if (!clinic.campaigns_enabled) return { handled: false };
  const since = new Date(Date.now() - CAMPAIGN_REPLY_WINDOW_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from("marketing_campaign_recipients")
    .select("*")
    .eq("clinic_id", clinic.id)
    .in("phone", brPhoneVariants(phone))
    .in("status", ["sent", "interested", "replied"])
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const recipient = data as MarketingCampaignRecipient | null;
  if (!recipient) return { handled: false };

  const kind = classifyCampaignReply(text);
  const now = new Date().toISOString();

  if (kind === "no") {
    await supabase
      .from("marketing_opt_outs")
      .upsert({ clinic_id: clinic.id, phone: recipient.phone, source: "whatsapp", reply_text: text.slice(0, 500) }, { onConflict: "clinic_id,phone", ignoreDuplicates: true });
    await supabase
      .from("marketing_campaign_recipients")
      .update({ status: "declined", replied_at: now, reply_text: text.slice(0, 500), last_outbound_at: now })
      .eq("id", recipient.id);
    await sendText(clinic, phone, CAMPAIGN_DECLINE_CONFIRMATION);
    console.log(`[campaign-reply] clinic=${clinic.id} recipient=${recipient.id} recusou — opt-out gravado`);
    return { handled: true };
  }

  // Já respondeu antes: daqui em diante é conversa normal com a equipe.
  if (recipient.status !== "sent") return { handled: false };

  if (kind === "other") {
    await supabase.from("marketing_campaign_recipients").update({ status: "replied", replied_at: now, reply_text: text.slice(0, 500) }).eq("id", recipient.id);
    return { handled: false };
  }

  const { data: campaignData } = await supabase.from("marketing_campaigns").select("*").eq("id", recipient.campaign_id).single();
  const campaign = campaignData as MarketingCampaign | null;
  if (!campaign) return { handled: false };

  await supabase
    .from("marketing_campaign_recipients")
    .update({ status: "interested", replied_at: now, reply_text: text.slice(0, 500), last_outbound_at: now })
    .eq("id", recipient.id);
  const { ok, lead } = await deliverCampaignContent(supabase, clinic, campaign, recipient, phone, text);
  console.log(`[campaign-reply] clinic=${clinic.id} recipient=${recipient.id} SIM — conteúdo ${ok ? "enviado" : "FALHOU"}, lead=${lead.id}`);
  return { handled: true, lead };
}

/**
 * Manda o conteúdo pra quem disse SIM e abre/atualiza o card no quadro de
 * leads pra recepção acompanhar até agendar. `patientText` = a resposta que
 * chegou agora pelo webhook (na ação manual ela já está no quadro).
 */
async function deliverCampaignContent(
  supabase: SupabaseClient,
  clinic: Clinic,
  campaign: MarketingCampaign,
  recipient: MarketingCampaignRecipient,
  phone: string,
  patientText: string | null
): Promise<{ ok: boolean; lead: Lead }> {
  const { ok, text: content } = await sendCampaignContent(clinic, campaign, phone, recipient.name);
  const lead = await findOrCreateOpenLead(supabase, clinic.id, phone);
  if (!lead.patient_name && recipient.name) await supabase.from("leads").update({ patient_name: recipient.name }).eq("id", lead.id);
  if (patientText) await appendLeadMessage(supabase, { leadId: lead.id, clinicId: clinic.id, role: "patient", content: patientText });
  if (ok) await appendLeadMessage(supabase, { leadId: lead.id, clinicId: clinic.id, role: "bot", content: `[Campanha "${campaign.name}"] ${content}` });
  await supabase.from("leads").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", lead.id);
  return { ok, lead };
}

export type RecipientAction = "yes" | "no" | "handled" | "wrong_number" | "retry";

/** De quais situações cada ação pode partir. */
const ACTION_FROM: Record<RecipientAction, MarketingCampaignRecipient["status"][]> = {
  yes: ["sent", "replied"],
  no: ["sent", "replied"],
  handled: ["replied", "failed"],
  wrong_number: ["sent", "replied", "failed", "interested"],
  retry: ["failed"],
};

/**
 * Ação manual da clínica sobre um contato da campanha:
 * - yes: vira "Quer saber" e manda o conteúdo (a clínica clicou — não é envio automático).
 * - no: vira "Não quer" e grava opt-out. Não manda mensagem de confirmação.
 * - handled: "Já respondi pelo WhatsApp" — sai da lista "Precisa de atenção".
 * - wrong_number: tira da campanha e marca o telefone (opt-out "numero_errado"):
 *   nunca mais entra em campanha, e o cadastro do paciente avisa pra corrigir.
 * - retry: erro no envio volta pra fila (só com a campanha enviando/pausada).
 */
export async function applyRecipientAction(
  supabase: SupabaseClient,
  clinic: Clinic,
  campaign: MarketingCampaign,
  recipientId: string,
  action: RecipientAction
): Promise<{ ok: true; warning?: string } | { ok: false; status: number; message: string }> {
  const { data } = await supabase.from("marketing_campaign_recipients").select("*").eq("id", recipientId).eq("campaign_id", campaign.id).maybeSingle();
  const recipient = data as MarketingCampaignRecipient | null;
  if (!recipient) return { ok: false, status: 404, message: "Contato não encontrado nesta campanha." };
  const changed = "A situação deste contato mudou. Atualize a página.";
  if (!ACTION_FROM[action].includes(recipient.status)) return { ok: false, status: 409, message: changed };

  const now = new Date().toISOString();
  // Update condicionado à situação lida acima: dois cliques/duas abas não mandam o conteúdo duas vezes.
  const transition = async (patch: Partial<MarketingCampaignRecipient>): Promise<string | null> => {
    const { data: rows, error } = await supabase
      .from("marketing_campaign_recipients")
      .update(patch)
      .eq("id", recipient.id)
      .eq("status", recipient.status)
      .select("id");
    if (error) return error.message;
    return rows && rows.length > 0 ? null : changed;
  };
  const done = (err: string | null) => (err ? { ok: false as const, status: 409, message: err } : { ok: true as const });

  if (action === "yes") {
    if (campaign.status === "cancelada") return { ok: false, status: 409, message: "Esta campanha foi cancelada." };
    const err = await transition({ status: "interested", handled_at: now, last_outbound_at: now });
    if (err) return done(err);
    const { ok } = await deliverCampaignContent(supabase, clinic, campaign, recipient, recipient.phone, null);
    console.log(`[campaign-action] clinic=${clinic.id} recipient=${recipient.id} SIM manual — conteúdo ${ok ? "enviado" : "FALHOU"}`);
    return ok ? { ok: true } : { ok: true, warning: "Marcado como SIM, mas o WhatsApp recusou o envio do conteúdo. Mande pelo quadro de leads." };
  }

  if (action === "no") {
    await supabase
      .from("marketing_opt_outs")
      .upsert({ clinic_id: clinic.id, phone: recipient.phone, source: "manual", reply_text: recipient.reply_text }, { onConflict: "clinic_id,phone", ignoreDuplicates: true });
    return done(await transition({ status: "declined", handled_at: now }));
  }

  if (action === "handled") return done(await transition({ handled_at: now }));

  if (action === "wrong_number") {
    // Sobrescreve um opt-out comum: "número errado" é o que importa pro cadastro.
    const { error } = await supabase
      .from("marketing_opt_outs")
      .upsert({ clinic_id: clinic.id, phone: recipient.phone, source: OPT_OUT_SOURCE_WRONG_NUMBER, reply_text: recipient.reply_text }, { onConflict: "clinic_id,phone" });
    if (error) return { ok: false, status: 500, message: error.message };
    return done(await transition({ status: "skipped", skip_reason: CAMPAIGN_WRONG_NUMBER_REASON, handled_at: now }));
  }

  // retry
  if (campaign.status !== "enviando" && campaign.status !== "pausada") {
    return { ok: false, status: 409, message: "Só dá pra reenviar com a campanha enviando ou pausada." };
  }
  return done(await transition({ status: "pending", skip_reason: null, sent_at: null, handled_at: null }));
}

/** Telefone do paciente marcado como "número errado" em alguma campanha. */
export async function isPatientPhoneMarkedWrong(supabase: SupabaseClient, clinicId: string, phone: string | null): Promise<boolean> {
  const canonical = canonicalCampaignPhone(phone);
  if (!canonical) return false;
  const { data } = await supabase
    .from("marketing_opt_outs")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("source", OPT_OUT_SOURCE_WRONG_NUMBER)
    .in("phone", brPhoneVariants(canonical))
    .limit(1);
  return (data ?? []).length > 0;
}

/** `fromMe` recebido logo depois de uma mensagem de campanha pro mesmo número = eco do próprio app. */
export async function isCampaignEcho(supabase: SupabaseClient, clinicId: string, phone: string): Promise<boolean> {
  const since = new Date(Date.now() - CAMPAIGN_ECHO_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("marketing_campaign_recipients")
    .select("id")
    .eq("clinic_id", clinicId)
    .in("phone", brPhoneVariants(phone))
    .gte("last_outbound_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}
