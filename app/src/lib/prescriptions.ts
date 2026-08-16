import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildPrescriptionPdf } from "@/lib/prescriptionPdf";
import { savePrescriptionPdf } from "@/lib/prescriptionPdfStorage";
import { getSignatureProvider } from "@/lib/signature";
import { sendText } from "@/lib/evolution";
import { loadClinicLogoForPdf } from "@/lib/pdfLogo";
import { ensureUniqueValidationCode } from "@/lib/validationCode";
import type { Clinic, Prescription } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ponto único que leva uma prescrição de `rascunho` a `aguardando_assinatura`:
 * gera o PDF e pede a assinatura ao provider (ver `lib/signature`). Espelha
 * `issueCertificate` (`lib/certificates.ts`) — mesmo fluxo, mesmo provider,
 * só troca o gerador de PDF e o bucket de storage. Com a Certisign, quem
 * completa o fluxo depois da dentista confirmar é `finalizePrescriptionSignature`.
 */
export async function issuePrescription(prescriptionId: string): Promise<Prescription> {
  const supabase = createSupabaseAdminClient();

  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", prescriptionId)
    .single();
  if (!prescription) throw new Error(`Prescrição ${prescriptionId} não encontrada.`);

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("id", prescription.clinic_id)
    .single();
  if (!clinic) throw new Error(`Clínica ${prescription.clinic_id} não encontrada.`);

  // Reaproveita o código se já existe (retry após falha) — só gera um novo na
  // primeira tentativa, pra não invalidar um QR/código já impresso em algum
  // PDF anterior deste mesmo documento.
  const validationCode = prescription.validation_code ?? (await ensureUniqueValidationCode(supabase));

  await supabase
    .from("prescriptions")
    .update({
      status: "aguardando_assinatura",
      signature_requested_at: new Date().toISOString(),
      validation_code: validationCode,
    })
    .eq("id", prescriptionId);

  const logo = await loadClinicLogoForPdf((clinic as Clinic).logo_url);
  const validationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/validar/${validationCode}`;
  const pdfBytes = await buildPrescriptionPdf(
    { ...(prescription as Prescription), validation_code: validationCode },
    (clinic as Clinic).name,
    logo,
    validationUrl
  );

  const provider = getSignatureProvider();
  const result = await provider.requestSignature({
    pdfBytes,
    documentId: prescriptionId,
    signerName: prescription.dentist_name,
    signerDocument: `CRO ${prescription.dentist_cro}/${prescription.dentist_cro_uf}`,
    signerCpf: (clinic as Clinic).dentist_cpf ?? "",
    signerEmail: (clinic as Clinic).dentist_email ?? "",
  });

  if (result.status === "falha") {
    const { data: updated } = await supabase
      .from("prescriptions")
      .update({ status: "falha", signature_error: result.errorMessage })
      .eq("id", prescriptionId)
      .select("*")
      .single();
    return updated as Prescription;
  }

  if (result.status === "pendente") {
    const { data: updated } = await supabase
      .from("prescriptions")
      .update({
        signature_provider: provider.name,
        signature_provider_doc_id: result.providerDocumentId,
        signature_document_key: result.documentKey,
        signature_sign_url: result.signUrl,
      })
      .eq("id", prescriptionId)
      .select("*")
      .single();
    return updated as Prescription;
  }

  return finishPrescriptionSignature(
    supabase,
    prescriptionId,
    clinic as Clinic,
    provider.name,
    result.providerDocumentId,
    result.signedPdfBytes,
    result.signedAt
  );
}

/**
 * Chamada pelo poller pra prescrições em `aguardando_assinatura` com pedido
 * já disparado na Certisign — consulta se a dentista já confirmou e, se sim,
 * baixa o PDF assinado e fecha o fluxo. No-op se ainda estiver pendente.
 */
export async function finalizePrescriptionSignature(prescriptionId: string): Promise<Prescription> {
  const supabase = createSupabaseAdminClient();

  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", prescriptionId)
    .single();
  if (!prescription) throw new Error(`Prescrição ${prescriptionId} não encontrada.`);
  const presc = prescription as Prescription;

  if (presc.status !== "aguardando_assinatura" || !presc.signature_provider_doc_id) {
    return presc;
  }

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", presc.clinic_id).single();
  if (!clinic) throw new Error(`Clínica ${presc.clinic_id} não encontrada.`);

  const provider = getSignatureProvider();
  const result = await provider.checkSignature(presc.signature_provider_doc_id, presc.signature_document_key);

  if (result.status === "pendente") return presc;

  if (result.status === "falha") {
    const { data: updated } = await supabase
      .from("prescriptions")
      .update({ status: "falha", signature_error: result.errorMessage })
      .eq("id", prescriptionId)
      .select("*")
      .single();
    return updated as Prescription;
  }

  return finishPrescriptionSignature(
    supabase,
    prescriptionId,
    clinic as Clinic,
    provider.name,
    presc.signature_provider_doc_id,
    result.signedPdfBytes,
    result.signedAt
  );
}

/**
 * Chamada pelo webhook (`/api/webhooks/certisign`) quando o callback de FLOW
 * chega com o PDF já baixado via `apiDownload`. Espelha
 * `completeCertificateSignatureByProviderDocId` — ver `lib/certificates.ts`.
 */
export async function completePrescriptionSignatureByProviderDocId(
  providerDocumentId: string,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<Prescription | null> {
  const supabase = createSupabaseAdminClient();
  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("signature_provider_doc_id", providerDocumentId)
    .eq("status", "aguardando_assinatura")
    .maybeSingle();
  if (!prescription) return null;

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", prescription.clinic_id).single();
  if (!clinic) throw new Error(`Clínica ${prescription.clinic_id} não encontrada.`);

  return finishPrescriptionSignature(
    supabase,
    prescription.id,
    clinic as Clinic,
    "certisign",
    providerDocumentId,
    signedPdfBytes,
    signedAt
  );
}

/** Chamada pelo webhook quando o callback traz `action: "SIGNATURE-NOK"` (dentista rejeitou no app). */
export async function rejectPrescriptionSignatureByProviderDocId(
  providerDocumentId: string,
  reason: string
): Promise<Prescription | null> {
  const supabase = createSupabaseAdminClient();
  const { data: updated } = await supabase
    .from("prescriptions")
    .update({ status: "falha", signature_error: reason })
    .eq("signature_provider_doc_id", providerDocumentId)
    .eq("status", "aguardando_assinatura")
    .select("*")
    .maybeSingle();
  return updated as Prescription | null;
}

async function finishPrescriptionSignature(
  supabase: SupabaseClient,
  prescriptionId: string,
  clinic: Clinic,
  providerName: string,
  providerDocumentId: string,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<Prescription> {
  const sha256 = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");
  const pdfStorageKey = await savePrescriptionPdf(clinic.id, prescriptionId, signedPdfBytes);

  const { data: updated } = await supabase
    .from("prescriptions")
    .update({
      status: "assinado",
      signed_at: signedAt,
      signature_provider: providerName,
      signature_provider_doc_id: providerDocumentId,
      pdf_storage_key: pdfStorageKey,
      sha256,
    })
    .eq("id", prescriptionId)
    .select("*")
    .single();

  const finalPrescription = updated as Prescription;

  if (finalPrescription.patient_phone) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL}/prescricao?token=${finalPrescription.token}`;
    const sent = await sendText(
      clinic,
      finalPrescription.patient_phone,
      `💊 Sua prescrição odontológica já está disponível: ${link}`
    );
    if (sent) {
      await supabase
        .from("prescriptions")
        .update({ sent_whatsapp_at: new Date().toISOString() })
        .eq("id", prescriptionId);
      finalPrescription.sent_whatsapp_at = new Date().toISOString();
    }
  }

  return finalPrescription;
}
