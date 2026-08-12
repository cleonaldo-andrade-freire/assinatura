import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildPrescriptionPdf } from "@/lib/prescriptionPdf";
import { savePrescriptionPdf } from "@/lib/prescriptionPdfStorage";
import { getSignatureProvider } from "@/lib/signature";
import { sendText } from "@/lib/evolution";
import { loadClinicLogoForPdf } from "@/lib/pdfLogo";
import { ensureUniqueValidationCode } from "@/lib/validationCode";
import type { Clinic, Prescription } from "@/lib/database.types";

/**
 * Ponto único que leva uma prescrição de `rascunho` a `assinado` (ou `falha`):
 * gera o PDF, chama o provider de assinatura (hoje mockado — ver
 * `lib/signature`), salva o resultado e avisa o paciente por WhatsApp
 * (best-effort). Espelha `issueCertificate` (`lib/certificates.ts`) — mesmo
 * fluxo, mesmo provider de assinatura (genérico, sem nada específico de
 * atestado), só troca o gerador de PDF e o bucket de storage.
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
  const result = await provider.sign({
    pdfBytes,
    documentId: prescriptionId,
    signerName: prescription.dentist_name,
    signerDocument: `CRO ${prescription.dentist_cro}/${prescription.dentist_cro_uf}`,
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

  const sha256 = crypto.createHash("sha256").update(Buffer.from(result.signedPdfBytes)).digest("hex");
  const pdfStorageKey = await savePrescriptionPdf(prescription.clinic_id, prescriptionId, result.signedPdfBytes);

  const { data: updated } = await supabase
    .from("prescriptions")
    .update({
      status: "assinado",
      signed_at: result.signedAt,
      signature_provider: provider.name,
      signature_provider_doc_id: result.providerDocumentId,
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
      clinic as Clinic,
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
