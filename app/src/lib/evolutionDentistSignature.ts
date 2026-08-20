import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSignatureProvider } from "@/lib/signature";
import { computeContentHash, appendSignatureEvent } from "@/lib/documentSignatureEvents";
import { buildEvolutionDentistPdf } from "@/lib/evolutionDentistPdf";
import { saveEvolutionDentistPdf } from "@/lib/evolutionDentistPdfStorage";
import { buildEvolutionSnapshot, requestEvolutionSignature } from "@/lib/evolutionSignature";
import type { Clinic, TreatmentEvolution } from "@/lib/database.types";

export type IssueDentistSignatureResult =
  | { ok: true; externalSigning: { hashToSignBase64: string; signatureSessionId: string } }
  | { ok: true; finished: true; sentToPatient: boolean }
  | { ok: false; error: string };

/**
 * Passo 1 (assinatura ICP-Brasil da dentista, agente local — mesmo desenho
 * de `issueCertificate` em certificates.ts): congela o conteúdo da
 * evolução, monta o PDF-base e pede a assinatura ao provider configurado.
 * Com `local_agent`, volta `external_signing` — quem termina é
 * `finishEvolutionDentistSignature`, chamada depois que o navegador assina
 * com o agente Windows.
 */
export async function issueEvolutionDentistSignature(
  clinicId: string,
  evolutionId: string,
  signerCertificatePem?: string
): Promise<IssueDentistSignatureResult> {
  const supabase = createSupabaseAdminClient();

  const { data: evolutionData } = await supabase.from("treatment_evolutions").select("*").eq("id", evolutionId).eq("clinic_id", clinicId).maybeSingle();
  if (!evolutionData) return { ok: false, error: "not_found" };
  const ev = evolutionData as TreatmentEvolution;
  if (ev.dentist_signature_status === "assinada") return { ok: false, error: "already_signed" };

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;
  if (!clinic.dentist_name || !clinic.dentist_cro || !clinic.dentist_cro_uf) return { ok: false, error: "dentist_not_configured" };

  const { data: patient } = await supabase.from("patients").select("name, cpf, phone").eq("id", ev.patient_id).eq("clinic_id", clinicId).maybeSingle();
  if (!patient) return { ok: false, error: "patient_not_found" };

  // Congela o conteúdo AGORA — é o momento de referência de tudo que segue
  // (o que a dentista assina, e depois o que é mandado pro paciente ler).
  const snapshot = await buildEvolutionSnapshot(supabase, ev, clinic, patient as { name: string; cpf: string | null });
  const contentHash = computeContentHash(snapshot);
  await supabase.from("treatment_evolutions").update({ content_snapshot: snapshot, content_hash: contentHash }).eq("id", evolutionId);

  const pdfBytes = await buildEvolutionDentistPdf(snapshot);

  const provider = getSignatureProvider();
  const result = await provider.requestSignature({
    pdfBytes,
    documentId: evolutionId,
    clinicId,
    signerName: clinic.dentist_name,
    signerDocument: `CRO ${clinic.dentist_cro}/${clinic.dentist_cro_uf}`,
    signerCpf: clinic.dentist_cpf ?? "",
    signerEmail: clinic.dentist_email ?? "",
    signerCertificatePem,
  });

  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status === "pendente") {
    // Providers assíncronos remotos (ex.: certisign) precisariam de um
    // poller/webhook próprio pra evolução, que não existe ainda — só
    // local_agent (síncrono do ponto de vista do fluxo, via agente
    // Windows) está com o fluxo completo pra este documento.
    return { ok: false, error: "provider_not_supported_for_evolutions" };
  }
  if (result.status === "external_signing") {
    return { ok: true, externalSigning: { hashToSignBase64: result.hashToSignBase64, signatureSessionId: result.signatureSessionId } };
  }

  // "assinado" (provider mock, resolve na hora) — finaliza direto.
  const sentToPatient = await finishAndNotify(supabase, clinicId, evolutionId, clinic, result.providerDocumentId, result.signedPdfBytes, result.signedAt);
  return { ok: true, finished: true, sentToPatient };
}

/** Passo 2 — chamado depois que o navegador assinou o hash com o agente
 * local (ver useAgent/signHash no frontend, mesmo padrão de
 * certificates/[id]/sign-local/finish). */
export async function finishEvolutionDentistSignature(
  clinicId: string,
  evolutionId: string,
  signatureSessionId: string,
  signatureBase64: string
): Promise<{ ok: true; sentToPatient: boolean } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;

  const provider = getSignatureProvider();
  if (!provider.completeExternalSignature) return { ok: false, error: "provider_not_supported_for_evolutions" };

  const result = await provider.completeExternalSignature(signatureSessionId, signatureBase64);
  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status !== "assinado") return { ok: false, error: "signature_incomplete" };

  const sentToPatient = await finishAndNotify(supabase, clinicId, evolutionId, clinic, result.providerDocumentId, result.signedPdfBytes, result.signedAt);
  return { ok: true, sentToPatient };
}

async function finishAndNotify(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  clinicId: string,
  evolutionId: string,
  clinic: Clinic,
  providerDocumentId: string,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<boolean> {
  const sha256 = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");
  const pdfStorageKey = await saveEvolutionDentistPdf(clinicId, evolutionId, signedPdfBytes);

  await supabase
    .from("treatment_evolutions")
    .update({
      dentist_signature_status: "assinada",
      dentist_signed_at: signedAt,
      dentist_pdf_storage_key: pdfStorageKey,
      dentist_pdf_sha256: sha256,
    })
    .eq("id", evolutionId);

  await appendSignatureEvent(supabase, {
    clinicId,
    documentType: "treatment_evolution",
    documentId: evolutionId,
    eventType: "dentista_assinou",
    actor: "dentist",
    payload: { provider_document_id: providerDocumentId, sha256 },
  });

  // Encadeia direto pro envio ao paciente — é o desenho combinado (assinar
  // já dispara o envio, sem precisar de um segundo clique). Reaproveita o
  // content_snapshot/content_hash já congelados no passo 1, não recalcula.
  const sent = await requestEvolutionSignature(clinicId, evolutionId, { reuseFrozenSnapshot: true });
  return sent.ok;
}
