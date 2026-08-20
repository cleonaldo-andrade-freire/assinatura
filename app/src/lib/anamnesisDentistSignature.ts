import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeContentHash } from "@/lib/documentSignatureEvents";
import { getSignatureProvider } from "@/lib/signature";
import { buildAnamnesisDentistPdf, type AnamnesisDentistSnapshot } from "@/lib/anamnesisDentistPdf";
import { saveAnamnesisDentistPdf } from "@/lib/anamnesisDentistPdfStorage";
import type { Anamnesis, Clinic } from "@/lib/database.types";

export type IssueAnamnesisDentistSignatureResult =
  | { ok: true; externalSigning: { hashToSignBase64: string; signatureSessionId: string } }
  | { ok: true; finished: true }
  | { ok: false; error: string };

/** Congela o conteúdo que a dentista está prestes a assinar — mesmo motivo
 * de `buildEvolutionSnapshot`: se a anamnese pudesse mudar depois, o PDF
 * assinado deixaria de bater com o dado ao vivo. */
function buildAnamnesisDentistSnapshot(anamnesis: Anamnesis, clinic: Clinic): AnamnesisDentistSnapshot {
  return {
    schema: "anamnese-dentista/v1",
    clinic: { name: clinic.name, logoUrl: clinic.logo_url },
    dentist: { name: clinic.dentist_name!, cro: clinic.dentist_cro!, croUf: clinic.dentist_cro_uf! },
    patient: { name: anamnesis.patient_name, cpf: anamnesis.patient_cpf, phone: anamnesis.patient_phone },
    answers: anamnesis.answers,
    anamnesisDate: anamnesis.created_at,
  };
}

/**
 * Passo 1 (assinatura ICP-Brasil da dentista, agente local — mesmo desenho
 * de `issueEvolutionDentistSignature`): a anamnese só pode ser
 * contra-assinada depois que o paciente já assinou (`signatures` precisa
 * existir) — a dentista está confirmando ciência do que o paciente
 * declarou, não substituindo a assinatura dele.
 */
export async function issueAnamnesisDentistSignature(
  clinicId: string,
  anamnesisId: string,
  signerCertificatePem?: string
): Promise<IssueAnamnesisDentistSignatureResult> {
  const supabase = createSupabaseAdminClient();

  const { data: anamnesisData } = await supabase.from("anamneses").select("*").eq("id", anamnesisId).eq("clinic_id", clinicId).maybeSingle();
  if (!anamnesisData) return { ok: false, error: "not_found" };
  const anamnesis = anamnesisData as Anamnesis;

  const { data: signature } = await supabase.from("signatures").select("*").eq("anamnesis_id", anamnesisId).maybeSingle();
  if (!signature) return { ok: false, error: "patient_not_signed" };
  if (signature.dentist_signature_status === "assinada") return { ok: false, error: "already_signed" };

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;
  if (!clinic.dentist_name || !clinic.dentist_cro || !clinic.dentist_cro_uf) return { ok: false, error: "dentist_not_configured" };

  const snapshot = buildAnamnesisDentistSnapshot(anamnesis, clinic);
  const contentHash = computeContentHash(snapshot);
  await supabase.from("signatures").update({ dentist_content_snapshot: snapshot, dentist_content_hash: contentHash }).eq("id", signature.id);

  const pdfBytes = await buildAnamnesisDentistPdf(snapshot);

  const provider = getSignatureProvider();
  const result = await provider.requestSignature({
    pdfBytes,
    documentId: anamnesisId,
    clinicId,
    signerName: clinic.dentist_name,
    signerDocument: `CRO ${clinic.dentist_cro}/${clinic.dentist_cro_uf}`,
    signerCpf: clinic.dentist_cpf ?? "",
    signerEmail: clinic.dentist_email ?? "",
    signerCertificatePem,
  });

  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status === "pendente") {
    // Mesma limitação de issueEvolutionDentistSignature — providers
    // assíncronos remotos (ex.: certisign) precisariam de um poller/webhook
    // próprio, que não existe ainda pra este documento.
    return { ok: false, error: "provider_not_supported_for_anamneses" };
  }
  if (result.status === "external_signing") {
    return { ok: true, externalSigning: { hashToSignBase64: result.hashToSignBase64, signatureSessionId: result.signatureSessionId } };
  }

  // "assinado" (provider mock, resolve na hora) — finaliza direto.
  await finishAndSave(supabase, clinicId, anamnesisId, result.providerDocumentId, result.signedPdfBytes, result.signedAt);
  return { ok: true, finished: true };
}

/** Passo 2 — chamado depois que o navegador assinou o hash com o agente
 * local (ver useAgent/signHash no frontend, mesmo padrão de
 * evolutionDentistSignature.ts/finishEvolutionDentistSignature). */
export async function finishAnamnesisDentistSignature(
  clinicId: string,
  anamnesisId: string,
  signatureSessionId: string,
  signatureBase64: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();

  const provider = getSignatureProvider();
  if (!provider.completeExternalSignature) return { ok: false, error: "provider_not_supported_for_anamneses" };

  const result = await provider.completeExternalSignature(signatureSessionId, signatureBase64);
  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status !== "assinado") return { ok: false, error: "signature_incomplete" };

  await finishAndSave(supabase, clinicId, anamnesisId, "", result.signedPdfBytes, result.signedAt);
  return { ok: true };
}

async function finishAndSave(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  clinicId: string,
  anamnesisId: string,
  _providerDocumentId: string,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<void> {
  const sha256 = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");
  const pdfStorageKey = await saveAnamnesisDentistPdf(clinicId, anamnesisId, signedPdfBytes);

  await supabase
    .from("signatures")
    .update({
      dentist_signature_status: "assinada",
      dentist_signed_at: signedAt,
      dentist_pdf_storage_key: pdfStorageKey,
      dentist_pdf_sha256: sha256,
    })
    .eq("anamnesis_id", anamnesisId);
}
