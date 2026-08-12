import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "certificate-pdfs";

export function certificatePdfKeyFor(clinicId: string, certificateId: string): string {
  return `${clinicId}/${certificateId}.pdf`;
}

export async function saveCertificatePdf(clinicId: string, certificateId: string, pdfBytes: Uint8Array): Promise<string> {
  const key = certificatePdfKeyFor(clinicId, certificateId);
  const supabase = createSupabaseAdminClient();
  // upsert: true (diferente de pdfStorage.ts) porque um atestado com falha na
  // assinatura pode ser reprocessado (`issueCertificate` de novo), reescrevendo
  // o mesmo storageKey — a assinatura de anamnese nunca é reemitida, esta é.
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar PDF de atestado no Supabase Storage: ${error.message}`);
  return key;
}

export async function readCertificatePdf(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler PDF de atestado do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
