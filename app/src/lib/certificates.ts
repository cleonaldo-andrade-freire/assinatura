import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCertificatePdf } from "@/lib/certificatePdf";
import { saveCertificatePdf } from "@/lib/certificatePdfStorage";
import { getSignatureProvider } from "@/lib/signature";
import { sendText } from "@/lib/evolution";
import { loadClinicLogoForPdf } from "@/lib/pdfLogo";
import { ensureUniqueValidationCode } from "@/lib/validationCode";
import type { Certificate, Clinic } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ponto único que leva um atestado de `rascunho` a `aguardando_assinatura`:
 * gera o PDF e pede a assinatura ao provider (ver `lib/signature`). Com o
 * mock, o provider resolve na hora e o atestado já sai `assinado`. Com a
 * Certisign, o provider volta `pendente` (a dentista precisa confirmar no
 * app) — quem completa é `finalizeCertificateSignature`, chamado pelo poller
 * (`app/api/cron/check-signatures`).
 */
export async function issueCertificate(certificateId: string): Promise<Certificate> {
  const supabase = createSupabaseAdminClient();

  const { data: certificate } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", certificateId)
    .single();
  if (!certificate) throw new Error(`Atestado ${certificateId} não encontrado.`);

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("id", certificate.clinic_id)
    .single();
  if (!clinic) throw new Error(`Clínica ${certificate.clinic_id} não encontrada.`);

  // Reaproveita o código se já existe (retry após falha) — só gera um novo na
  // primeira tentativa, pra não invalidar um QR/código já impresso em algum
  // PDF anterior deste mesmo documento.
  const validationCode = certificate.validation_code ?? (await ensureUniqueValidationCode(supabase));

  await supabase
    .from("certificates")
    .update({
      status: "aguardando_assinatura",
      signature_requested_at: new Date().toISOString(),
      validation_code: validationCode,
    })
    .eq("id", certificateId);

  const logo = await loadClinicLogoForPdf((clinic as Clinic).logo_url);
  const validationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/validar/${validationCode}`;
  const pdfBytes = await buildCertificatePdf(
    { ...(certificate as Certificate), validation_code: validationCode },
    (clinic as Clinic).name,
    logo,
    validationUrl
  );

  const provider = getSignatureProvider();
  const result = await provider.requestSignature({
    pdfBytes,
    documentId: certificateId,
    signerName: certificate.dentist_name,
    signerDocument: `CRO ${certificate.dentist_cro}/${certificate.dentist_cro_uf}`,
    signerCpf: (clinic as Clinic).dentist_cpf ?? "",
    signerEmail: (clinic as Clinic).dentist_email ?? "",
  });

  if (result.status === "falha") {
    const { data: updated } = await supabase
      .from("certificates")
      .update({ status: "falha", signature_error: result.errorMessage })
      .eq("id", certificateId)
      .select("*")
      .single();
    return updated as Certificate;
  }

  if (result.status === "pendente") {
    const { data: updated } = await supabase
      .from("certificates")
      .update({
        signature_provider: provider.name,
        signature_provider_doc_id: result.providerDocumentId,
        signature_document_key: result.documentKey,
        signature_sign_url: result.signUrl,
      })
      .eq("id", certificateId)
      .select("*")
      .single();
    return updated as Certificate;
  }

  return finishCertificateSignature(
    supabase,
    certificateId,
    clinic as Clinic,
    provider.name,
    result.providerDocumentId,
    result.signedPdfBytes,
    result.signedAt
  );
}

/**
 * Chamada pelo poller pra atestados em `aguardando_assinatura` com pedido já
 * disparado na Certisign — consulta se a dentista já confirmou e, se sim,
 * baixa o PDF assinado e fecha o fluxo. No-op se ainda estiver pendente.
 */
export async function finalizeCertificateSignature(certificateId: string): Promise<Certificate> {
  const supabase = createSupabaseAdminClient();

  const { data: certificate } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", certificateId)
    .single();
  if (!certificate) throw new Error(`Atestado ${certificateId} não encontrado.`);
  const cert = certificate as Certificate;

  if (cert.status !== "aguardando_assinatura" || !cert.signature_provider_doc_id) {
    return cert;
  }

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", cert.clinic_id).single();
  if (!clinic) throw new Error(`Clínica ${cert.clinic_id} não encontrada.`);

  const provider = getSignatureProvider();
  const result = await provider.checkSignature(cert.signature_provider_doc_id, cert.signature_document_key);

  if (result.status === "pendente") return cert;

  if (result.status === "falha") {
    const { data: updated } = await supabase
      .from("certificates")
      .update({ status: "falha", signature_error: result.errorMessage })
      .eq("id", certificateId)
      .select("*")
      .single();
    return updated as Certificate;
  }

  return finishCertificateSignature(
    supabase,
    certificateId,
    clinic as Clinic,
    provider.name,
    cert.signature_provider_doc_id,
    result.signedPdfBytes,
    result.signedAt
  );
}

/**
 * Chamada pelo webhook (`/api/webhooks/certisign`) quando o callback de FLOW
 * chega com o PDF já baixado via `apiDownload`. Localiza o atestado pelo id
 * que a Certisign devolveu em `document/create` (guardado em
 * `signature_provider_doc_id`) — o webhook não sabe o id interno do atestado.
 * Retorna `null` se não achar (o caller tenta em `prescriptions` também).
 */
export async function completeCertificateSignatureByProviderDocId(
  providerDocumentId: string,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<Certificate | null> {
  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase
    .from("certificates")
    .select("*")
    .eq("signature_provider_doc_id", providerDocumentId)
    .eq("status", "aguardando_assinatura")
    .maybeSingle();
  if (!certificate) return null;

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", certificate.clinic_id).single();
  if (!clinic) throw new Error(`Clínica ${certificate.clinic_id} não encontrada.`);

  return finishCertificateSignature(
    supabase,
    certificate.id,
    clinic as Clinic,
    "certisign",
    providerDocumentId,
    signedPdfBytes,
    signedAt
  );
}

/** Chamada pelo webhook quando o callback traz `action: "SIGNATURE-NOK"` (dentista rejeitou no app). */
export async function rejectCertificateSignatureByProviderDocId(
  providerDocumentId: string,
  reason: string
): Promise<Certificate | null> {
  const supabase = createSupabaseAdminClient();
  const { data: updated } = await supabase
    .from("certificates")
    .update({ status: "falha", signature_error: reason })
    .eq("signature_provider_doc_id", providerDocumentId)
    .eq("status", "aguardando_assinatura")
    .select("*")
    .maybeSingle();
  return updated as Certificate | null;
}

async function finishCertificateSignature(
  supabase: SupabaseClient,
  certificateId: string,
  clinic: Clinic,
  providerName: string,
  providerDocumentId: string,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<Certificate> {
  const sha256 = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");
  const pdfStorageKey = await saveCertificatePdf(clinic.id, certificateId, signedPdfBytes);

  const { data: updated } = await supabase
    .from("certificates")
    .update({
      status: "assinado",
      signed_at: signedAt,
      signature_provider: providerName,
      signature_provider_doc_id: providerDocumentId,
      pdf_storage_key: pdfStorageKey,
      sha256,
    })
    .eq("id", certificateId)
    .select("*")
    .single();

  const finalCertificate = updated as Certificate;

  if (finalCertificate.patient_phone) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL}/atestado?token=${finalCertificate.token}`;
    const sent = await sendText(clinic, finalCertificate.patient_phone, `📄 Seu atestado odontológico já está disponível: ${link}`);
    if (sent) {
      await supabase
        .from("certificates")
        .update({ sent_whatsapp_at: new Date().toISOString() })
        .eq("id", certificateId);
      finalCertificate.sent_whatsapp_at = new Date().toISOString();
    }
  }

  return finalCertificate;
}
