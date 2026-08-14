import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "expense-receipts";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8MB

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Comprovante de pagamento anexado a uma despesa — bucket privado, uma chave por arquivo (substitui a anterior se reenviado). */
export async function saveExpenseReceipt(clinicId: string, expenseId: string, file: File): Promise<string> {
  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    throw new Error("Formato não suportado — use PNG, JPEG, WEBP ou PDF.");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error("Arquivo muito grande — o limite é 8MB.");
  }

  const supabase = createSupabaseAdminClient();
  const key = `${clinicId}/${expenseId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar comprovante no Supabase Storage: ${error.message}`);
  return key;
}

export async function readExpenseReceipt(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler comprovante do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteExpenseReceipt(storageKey: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storageKey]);
  if (error) console.error("Falha ao excluir comprovante do Storage:", error.message);
}
