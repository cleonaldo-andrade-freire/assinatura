import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "signed-pdfs";

export function evolutionDentistPdfKeyFor(clinicId: string, evolutionId: string): string {
  return `${clinicId}/evolucao-dentista-${evolutionId}.pdf`;
}

export async function saveEvolutionDentistPdf(clinicId: string, evolutionId: string, pdfBytes: Uint8Array): Promise<string> {
  const key = evolutionDentistPdfKeyFor(clinicId, evolutionId);
  const supabase = createSupabaseAdminClient();
  // upsert: true — reassinar (ex.: depois de um erro na finalização) reescreve o mesmo storageKey.
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar PDF assinado pela dentista no Supabase Storage: ${error.message}`);
  return key;
}

export async function readEvolutionDentistPdf(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler PDF assinado pela dentista do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
