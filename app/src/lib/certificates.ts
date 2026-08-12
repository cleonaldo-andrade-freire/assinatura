import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCertificatePdf } from "@/lib/certificatePdf";
import { saveCertificatePdf } from "@/lib/certificatePdfStorage";
import { getSignatureProvider } from "@/lib/signature";
import { sendText } from "@/lib/evolution";
import { loadClinicLogoForPdf } from "@/lib/pdfLogo";
import { ensureUniqueValidationCode } from "@/lib/validationCode";
import type { Certificate, Clinic } from "@/lib/database.types";

/**
 * Ponto único que leva um atestado de `rascunho` a `assinado` (ou `falha`):
 * gera o PDF, chama o provider de assinatura (hoje mockado — ver
 * `lib/signature`), salva o resultado e avisa o paciente por WhatsApp
 * (best-effort). Reaproveitado tanto na criação quanto no retry manual, e é o
 * mesmo ponto de costura que um provider assíncrono real vai precisar depois.
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
  const result = await provider.sign({
    pdfBytes,
    documentId: certificateId,
    signerName: certificate.dentist_name,
    signerDocument: `CRO ${certificate.dentist_cro}/${certificate.dentist_cro_uf}`,
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

  const sha256 = crypto.createHash("sha256").update(Buffer.from(result.signedPdfBytes)).digest("hex");
  const pdfStorageKey = await saveCertificatePdf(certificate.clinic_id, certificateId, result.signedPdfBytes);

  const { data: updated } = await supabase
    .from("certificates")
    .update({
      status: "assinado",
      signed_at: result.signedAt,
      signature_provider: provider.name,
      signature_provider_doc_id: result.providerDocumentId,
      pdf_storage_key: pdfStorageKey,
      sha256,
    })
    .eq("id", certificateId)
    .select("*")
    .single();

  const finalCertificate = updated as Certificate;

  if (finalCertificate.patient_phone) {
    const link = `${process.env.NEXT_PUBLIC_APP_URL}/atestado?token=${finalCertificate.token}`;
    const sent = await sendText(clinic as Clinic, finalCertificate.patient_phone, `📄 Seu atestado odontológico já está disponível: ${link}`);
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
