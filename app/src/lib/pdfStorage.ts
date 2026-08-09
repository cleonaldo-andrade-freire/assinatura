import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "signed-pdfs";

export function pdfKeyFor(clinicId: string, anamnesisId: string): string {
  return `${clinicId}/${anamnesisId}.pdf`;
}

export async function savePdf(clinicId: string, anamnesisId: string, pdfBuffer: Buffer): Promise<string> {
  const key = pdfKeyFor(clinicId, anamnesisId);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(key, pdfBuffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar PDF no Supabase Storage: ${error.message}`);
  return key;
}

export async function readPdf(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler PDF do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
