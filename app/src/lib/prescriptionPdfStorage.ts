import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "prescription-pdfs";

export function prescriptionPdfKeyFor(clinicId: string, prescriptionId: string): string {
  return `${clinicId}/${prescriptionId}.pdf`;
}

export async function savePrescriptionPdf(clinicId: string, prescriptionId: string, pdfBytes: Uint8Array): Promise<string> {
  const key = prescriptionPdfKeyFor(clinicId, prescriptionId);
  const supabase = createSupabaseAdminClient();
  // upsert: true — uma prescrição com falha na assinatura pode ser reprocessada
  // (`issuePrescription` de novo), reescrevendo o mesmo storageKey.
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar PDF de prescrição no Supabase Storage: ${error.message}`);
  return key;
}

export async function readPrescriptionPdf(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler PDF de prescrição do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
