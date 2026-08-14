import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "receipt-pdfs";

export function receiptPdfKeyFor(clinicId: string, receiptId: string): string {
  return `${clinicId}/${receiptId}.pdf`;
}

export async function saveReceiptPdf(clinicId: string, receiptId: string, pdfBytes: Uint8Array): Promise<string> {
  const key = receiptPdfKeyFor(clinicId, receiptId);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar PDF de recibo no Supabase Storage: ${error.message}`);
  return key;
}

export async function readReceiptPdf(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler PDF de recibo do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
