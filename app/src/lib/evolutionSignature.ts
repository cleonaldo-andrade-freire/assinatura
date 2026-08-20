import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { appendSignatureEvent, computeContentHash, verifySignatureChain } from "@/lib/documentSignatureEvents";
import { buildEvolutionSignedPdf } from "@/lib/evolutionSignaturePdf";
import { savePdf, readPdf } from "@/lib/pdfStorage";
import { ensureUniqueEvolutionSignatureCode, formatValidationCode } from "@/lib/validationCode";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendText, notifyClinicEvolutionSigned, notifyClinicEvolutionRefused } from "@/lib/evolution";
import { clinicHasConfiguredConsentTerm, hashConsentText, patientHasActiveConsent, recordConsentAcceptance } from "@/lib/electronicConsent";
import { formatDateBR } from "@/lib/pdfTextLayout";
import type { SignatureResult } from "@/components/SignatureCanvas";
import type { Clinic, TreatmentEvolution } from "@/lib/database.types";

const TOKEN_TTL_HOURS = 48;
const MAX_VERIFICATION_ATTEMPTS = 5;
const BLOCK_MINUTES = 30;

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

// ============================================================
// 1. Solicitar assinatura — lado autenticado (dentista).
// ============================================================
export async function requestEvolutionSignature(
  clinicId: string,
  evolutionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: evolutionData } = await supabase.from("treatment_evolutions").select("*").eq("id", evolutionId).eq("clinic_id", clinicId).maybeSingle();
  if (!evolutionData) return { ok: false, error: "not_found" };
  const ev = evolutionData as TreatmentEvolution;

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;

  if (!clinicHasConfiguredConsentTerm(clinic)) return { ok: false, error: "consent_term_not_configured" };
  if (!clinic.dentist_name || !clinic.dentist_cro || !clinic.dentist_cro_uf) return { ok: false, error: "dentist_not_configured" };

  const { data: patient } = await supabase.from("patients").select("*").eq("id", ev.patient_id).eq("clinic_id", clinicId).maybeSingle();
  if (!patient) return { ok: false, error: "patient_not_found" };
  if (!patient.phone) return { ok: false, error: "patient_no_phone" };
  if (!patient.cpf) return { ok: false, error: "patient_no_cpf" };

  const { data: treatment } = await supabase.from("treatments").select("treatment_name, tooth_region").eq("id", ev.treatment_id).maybeSingle();

  const snapshot = {
    schema: "evolucao/v1" as const,
    clinic: { name: clinic.name, logoUrl: clinic.logo_url },
    dentist: { name: clinic.dentist_name, cro: clinic.dentist_cro, croUf: clinic.dentist_cro_uf },
    patient: { name: patient.name as string, cpf: (patient.cpf as string | null) ?? null },
    treatment: { name: treatment?.treatment_name ?? "Tratamento", toothRegion: treatment?.tooth_region ?? null },
    evolutionDate: ev.evolution_date,
    text: ev.text,
  };
  const contentHash = computeContentHash(snapshot);
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  // Reenvio (token já existia): gera token novo, nunca reativa o velho — um
  // link antigo compartilhado por engano não pode voltar a funcionar.
  const { data: refreshed } = await supabase
    .from("treatment_evolutions")
    .update({
      signature_token: crypto.randomUUID(),
      signature_status: "solicitada",
      signature_requested_at: new Date().toISOString(),
      signature_token_expires_at: tokenExpiresAt,
      signature_verification_attempts: 0,
      signature_blocked_until: null,
      signature_refused_at: null,
      signature_refused_reason: null,
      content_snapshot: snapshot,
      content_hash: contentHash,
    })
    .eq("id", evolutionId)
    .select("signature_token")
    .single();
  if (!refreshed) return { ok: false, error: "update_failed" };

  await appendSignatureEvent(supabase, {
    clinicId,
    documentType: "treatment_evolution",
    documentId: evolutionId,
    eventType: "solicitacao_criada",
    actor: "dentist",
    payload: { content_hash: contentHash },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/assinatura-evolucao?token=${refreshed.signature_token}`;
  const message =
    `📋 Olá, ${firstName(patient.name)}! Segue o registro do seu atendimento de ${formatDateBR(ev.evolution_date)} na ${clinic.name}.\n\n` +
    `Por favor, leia e confirme sua ciência assinando no link abaixo — leva menos de 1 minuto:\n${link}\n\n` +
    `O link expira em 48 horas. Qualquer dúvida, é só responder esta mensagem.`;
  const sent = await sendText(clinic, patient.phone, message);

  if (sent) {
    await supabase.from("treatment_evolutions").update({ sent_whatsapp_at: new Date().toISOString() }).eq("id", evolutionId);
    await appendSignatureEvent(supabase, { clinicId, documentType: "treatment_evolution", documentId: evolutionId, eventType: "whatsapp_enviado", actor: "system" });
  } else {
    await appendSignatureEvent(supabase, { clinicId, documentType: "treatment_evolution", documentId: evolutionId, eventType: "whatsapp_falha", actor: "system" });
  }

  return { ok: true };
}

// ============================================================
// 2. Fluxo público — identificado só pelo token.
// ============================================================

interface EvolutionLookup {
  evolution: TreatmentEvolution;
  clinic: Clinic;
  patient: { id: string; name: string; cpf: string | null; phone: string | null };
}

async function lookupByToken(token: string): Promise<EvolutionLookup | null> {
  const supabase = createSupabaseAdminClient();
  const { data: evolutionData } = await supabase.from("treatment_evolutions").select("*").eq("signature_token", token).maybeSingle();
  if (!evolutionData) return null;
  const evolution = evolutionData as TreatmentEvolution;

  const [{ data: clinicData }, { data: patientData }] = await Promise.all([
    supabase.from("clinics").select("*").eq("id", evolution.clinic_id).single(),
    supabase.from("patients").select("id, name, cpf, phone").eq("id", evolution.patient_id).maybeSingle(),
  ]);
  if (!clinicData || !patientData) return null;

  return { evolution, clinic: clinicData as Clinic, patient: patientData };
}

export async function getEvolutionStatusByToken(token: string) {
  const found = await lookupByToken(token);
  if (!found) return { found: false as const };

  const { evolution, clinic, patient } = found;
  const expired = evolution.signature_status === "solicitada" && evolution.signature_token_expires_at
    ? new Date(evolution.signature_token_expires_at).getTime() < Date.now()
    : false;

  return {
    found: true as const,
    status: expired ? "expirada" : evolution.signature_status,
    clinicName: clinic.name,
    clinicLogoUrl: clinic.logo_url,
    patientNameMasked: maskName(patient.name),
    needsConsent: !(await patientHasActiveConsent(createSupabaseAdminClient(), patient.id)),
  };
}

function maskName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((part, i, arr) => {
      if (i === 0 || i === arr.length - 1) return part.length <= 2 ? part : `${part.slice(0, Math.max(2, Math.ceil(part.length * 0.4)))}***`;
      return "***";
    })
    .join(" ");
}

/** Segundo fator: confirma o CPF cadastrado. Rate limit reaproveita
 * lib/rateLimit.ts (Postgres puro, já usado no portal de validação
 * pública) — 5 tentativas por token, bloqueio de 30 min. */
export async function verifySecondFactor(
  token: string,
  cpfInput: string,
  ip: string | null,
  userAgent: string | null
): Promise<{ ok: true } | { ok: false; error: "not_found" | "expired" | "blocked" | "wrong" }> {
  const supabase = createSupabaseAdminClient();
  const found = await lookupByToken(token);
  if (!found) return { ok: false, error: "not_found" };
  const { evolution, patient } = found;

  if (evolution.signature_status !== "solicitada") return { ok: false, error: "not_found" };
  if (evolution.signature_token_expires_at && new Date(evolution.signature_token_expires_at).getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }
  if (evolution.signature_blocked_until && new Date(evolution.signature_blocked_until).getTime() > Date.now()) {
    return { ok: false, error: "blocked" };
  }

  const withinRateLimit = await checkRateLimit(supabase, `evo-sig-verify:${token}`, { windowSeconds: 30 * 60, maxAttempts: MAX_VERIFICATION_ATTEMPTS });
  if (!withinRateLimit) {
    const blockedUntil = new Date(Date.now() + BLOCK_MINUTES * 60 * 1000).toISOString();
    await supabase.from("treatment_evolutions").update({ signature_blocked_until: blockedUntil }).eq("id", evolution.id);
    await appendSignatureEvent(supabase, {
      clinicId: evolution.clinic_id,
      documentType: "treatment_evolution",
      documentId: evolution.id,
      eventType: "verificacao_bloqueada",
      actor: "patient",
      ip,
      userAgent,
    });
    return { ok: false, error: "blocked" };
  }

  const matches = onlyDigits(cpfInput) === onlyDigits(patient.cpf);
  await supabase
    .from("treatment_evolutions")
    .update({ signature_verification_attempts: evolution.signature_verification_attempts + 1 })
    .eq("id", evolution.id);

  await appendSignatureEvent(supabase, {
    clinicId: evolution.clinic_id,
    documentType: "treatment_evolution",
    documentId: evolution.id,
    eventType: matches ? "verificacao_ok" : "verificacao_tentada",
    actor: "patient",
    payload: { sucesso: matches },
    ip,
    userAgent,
  });

  if (!matches) return { ok: false, error: "wrong" };
  return { ok: true };
}

export async function getEvolutionDocument(token: string) {
  const found = await lookupByToken(token);
  if (!found || !found.evolution.content_snapshot) return null;
  const { evolution, clinic } = found;
  return {
    clinicName: clinic.name,
    clinicLogoUrl: clinic.logo_url,
    snapshot: evolution.content_snapshot,
    contentHash: evolution.content_hash,
    consentTermText: clinic.consent_term_text,
    consentTermVersion: clinic.consent_term_version,
  };
}

export async function markDocumentDisplayed(token: string, ip: string | null, userAgent: string | null) {
  const found = await lookupByToken(token);
  if (!found) return;
  const supabase = createSupabaseAdminClient();
  await appendSignatureEvent(supabase, {
    clinicId: found.evolution.clinic_id,
    documentType: "treatment_evolution",
    documentId: found.evolution.id,
    eventType: "documento_exibido",
    actor: "patient",
    ip,
    userAgent,
  });
}

interface SignParams {
  token: string;
  strokeSignature: SignatureResult;
  contentHashConfirmed: string;
  scrollCompleto: boolean;
  ip: string | null;
  userAgent: string | null;
  needsConsentAcceptance: boolean;
}

export async function signEvolution(
  params: SignParams
): Promise<{ ok: true; verificationCode: string } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const found = await lookupByToken(params.token);
  if (!found) return { ok: false, error: "not_found" };
  const { evolution, clinic, patient } = found;

  if (evolution.signature_status !== "solicitada") return { ok: false, error: "invalid_status" };
  if (!evolution.content_snapshot || !evolution.content_hash) return { ok: false, error: "no_snapshot" };
  if (!params.scrollCompleto) return { ok: false, error: "scroll_incomplete" };
  if (params.contentHashConfirmed !== evolution.content_hash) {
    // Divergência entre o hash que o cliente confirmou e o hash real do
    // snapshot — não assina, é exatamente o cenário que esse conferimento
    // existe pra pegar (conteúdo mudou entre a exibição e o envio).
    return { ok: false, error: "content_mismatch" };
  }

  if (!patient.phone) return { ok: false, error: "patient_no_phone" };

  if (params.needsConsentAcceptance) {
    if (!clinicHasConfiguredConsentTerm(clinic)) return { ok: false, error: "consent_term_not_configured" };
    await recordConsentAcceptance(supabase, {
      clinicId: clinic.id,
      patientId: patient.id,
      termVersion: clinic.consent_term_version!,
      termTextHash: hashConsentText(clinic.consent_term_text!),
      phoneE164: patient.phone,
      ip: params.ip,
      userAgent: params.userAgent,
    });
    await appendSignatureEvent(supabase, {
      clinicId: clinic.id,
      documentType: "treatment_evolution",
      documentId: evolution.id,
      eventType: "termo_adesao_aceito",
      actor: "patient",
      payload: { term_version: clinic.consent_term_version },
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }

  await appendSignatureEvent(supabase, {
    clinicId: clinic.id,
    documentType: "treatment_evolution",
    documentId: evolution.id,
    eventType: "assinatura_submetida",
    actor: "patient",
    payload: { metrics: params.strokeSignature.strokeData.metrics },
    ip: params.ip,
    userAgent: params.userAgent,
  });

  const verificationCode = await ensureUniqueEvolutionSignatureCode(supabase);
  const validationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/validar-evolucao/${verificationCode}`;
  const signedAtServer = new Date().toISOString();

  const auditEvents = await supabase
    .from("document_signature_events")
    .select("*")
    .eq("document_type", "treatment_evolution")
    .eq("document_id", evolution.id)
    .order("sequence", { ascending: true });
  const chainCheck = await verifySignatureChain(supabase, "treatment_evolution", evolution.id);

  const snapshot = evolution.content_snapshot as {
    schema: "evolucao/v1";
    clinic: { name: string; logoUrl: string | null };
    dentist: { name: string; cro: string; croUf: string };
    patient: { name: string; cpf: string | null };
    treatment: { name: string; toothRegion: string | null };
    evolutionDate: string;
    text: string;
  };

  const pdfBytes = await buildEvolutionSignedPdf(
    snapshot,
    {
      verificationCode,
      signerName: patient.name,
      signerCpf: patient.cpf,
      phoneE164: patient.phone,
      consentTermVersion: clinic.consent_term_version ?? "—",
      consentAcceptedAt: signedAtServer,
      signedAtServerIso: signedAtServer,
      strokeData: params.strokeSignature.strokeData,
      userAgent: params.userAgent,
      ip: params.ip,
      contentHash: evolution.content_hash,
      auditEventCount: auditEvents.data?.length ?? 0,
      auditChainIntact: chainCheck.ok,
    },
    JSON.stringify(auditEvents.data ?? [], null, 2),
    validationUrl
  );

  const sha256 = crypto.createHash("sha256").update(Buffer.from(pdfBytes)).digest("hex");
  const pdfStorageKey = await savePdf(clinic.id, evolution.id, Buffer.from(pdfBytes));

  const { error: insertError } = await supabase.from("treatment_evolution_signatures").insert({
    treatment_evolution_id: evolution.id,
    clinic_id: clinic.id,
    signer_name: patient.name,
    signer_cpf: patient.cpf,
    signed_at_client: params.strokeSignature.strokeData.capturedAt,
    signed_at_server: signedAtServer,
    ip: params.ip,
    user_agent: params.userAgent,
    sha256,
    pdf_storage_key: pdfStorageKey,
    stroke_data: params.strokeSignature.strokeData,
    verification_code: verificationCode,
  });
  if (insertError) return { ok: false, error: insertError.message };

  await supabase.from("treatment_evolutions").update({ signature_status: "assinada" }).eq("id", evolution.id);

  await appendSignatureEvent(supabase, {
    clinicId: clinic.id,
    documentType: "treatment_evolution",
    documentId: evolution.id,
    eventType: "pdf_gerado",
    actor: "system",
    payload: { sha256, verification_code: verificationCode },
  });

  const comprovanteMsg = `✅ Prontinho, ${firstName(patient.name)}! Assinatura registrada.\n\nCódigo de verificação: ${formatValidationCode(verificationCode)}\nConfira em: ${validationUrl}`;
  const sent = await sendText(clinic, patient.phone, comprovanteMsg);
  if (sent) {
    await appendSignatureEvent(supabase, { clinicId: clinic.id, documentType: "treatment_evolution", documentId: evolution.id, eventType: "comprovante_enviado", actor: "system" });
  }

  await notifyClinicEvolutionSigned(clinic, patient.name);

  return { ok: true, verificationCode };
}

export async function refuseEvolutionSignature(
  token: string,
  reason: string | null,
  ip: string | null,
  userAgent: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const found = await lookupByToken(token);
  if (!found) return { ok: false, error: "not_found" };
  const { evolution, clinic, patient } = found;

  if (evolution.signature_status !== "solicitada") return { ok: false, error: "invalid_status" };

  await supabase
    .from("treatment_evolutions")
    .update({ signature_status: "recusada", signature_refused_at: new Date().toISOString(), signature_refused_reason: reason })
    .eq("id", evolution.id);

  await appendSignatureEvent(supabase, {
    clinicId: clinic.id,
    documentType: "treatment_evolution",
    documentId: evolution.id,
    eventType: "recusado",
    actor: "patient",
    payload: { motivo: reason },
    ip,
    userAgent,
  });

  // Notifica a clínica na hora, não em batch — a recusa é o sinal mais
  // urgente que esse fluxo produz.
  await notifyClinicEvolutionRefused(clinic, patient.name, reason);

  return { ok: true };
}

export { readPdf as readEvolutionSignaturePdf };
