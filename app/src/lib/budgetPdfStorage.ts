import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "budget-pdfs";

export function budgetPdfKeyFor(clinicId: string, budgetId: string): string {
  return `${clinicId}/${budgetId}.pdf`;
}

export async function saveBudgetPdf(clinicId: string, budgetId: string, pdfBytes: Uint8Array): Promise<string> {
  const key = budgetPdfKeyFor(clinicId, budgetId);
  const supabase = createSupabaseAdminClient();
  // upsert: true — o orçamento pode ter o PDF regenerado (ex.: reenvio por
  // WhatsApp sem PDF ainda salvo), reescrevendo o mesmo storageKey.
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar PDF de orçamento no Supabase Storage: ${error.message}`);
  return key;
}

export async function readBudgetPdf(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler PDF de orçamento do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
