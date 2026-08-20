import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clinic } from "@/lib/database.types";

/** SHA-256 do texto do termo, pra registrar exatamente o que a pessoa leu
 * mesmo que a clínica edite o texto depois (ver migration 052, comentário
 * da tabela `electronic_consent_terms`). */
export function hashConsentText(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** Bloqueia o fluxo de assinatura de evolução até a clínica configurar o
 * próprio texto do Termo de Adesão em Configurações — nunca existe um
 * texto padrão pronto pra uso sem revisão jurídica. */
export function clinicHasConfiguredConsentTerm(clinic: Pick<Clinic, "consent_term_text" | "consent_term_version">): boolean {
  return !!clinic.consent_term_text?.trim() && !!clinic.consent_term_version?.trim();
}

/** Paciente já tem um termo ativo (não revogado)? Não força reaceite quando
 * a clínica só corrige um typo no texto — ver nota na migration/documento
 * de análise sobre essa ser uma decisão de produto, não uma obrigação legal
 * automática. */
export async function patientHasActiveConsent(supabase: SupabaseClient, patientId: string): Promise<boolean> {
  const { data } = await supabase
    .from("electronic_consent_terms")
    .select("id")
    .eq("patient_id", patientId)
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
}

/** Registra o aceite do termo — snapshot da versão/hash vigente na
 * clínica no momento do aceite. */
export async function recordConsentAcceptance(
  supabase: SupabaseClient,
  params: {
    clinicId: string;
    patientId: string;
    termVersion: string;
    termTextHash: string;
    phoneE164: string;
    ip: string | null;
    userAgent: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("electronic_consent_terms").insert({
    clinic_id: params.clinicId,
    patient_id: params.patientId,
    term_version: params.termVersion,
    term_text_hash: params.termTextHash,
    accepted_at: new Date().toISOString(),
    accept_channel: "whatsapp",
    phone_e164: params.phoneE164,
    ip: params.ip,
    user_agent: params.userAgent,
  });
  if (error) throw new Error(`Falha ao registrar aceite do termo: ${error.message}`);
}
