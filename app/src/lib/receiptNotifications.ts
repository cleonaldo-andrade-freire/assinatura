import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReceiptPdf } from "@/lib/receiptPdf";
import { saveReceiptPdf } from "@/lib/receiptPdfStorage";
import { loadClinicLogoForPdf } from "@/lib/pdfLogo";
import { sendText } from "@/lib/evolution";
import type { Clinic, Receipt, TreatmentDebit } from "@/lib/database.types";

/** Gera o PDF do recibo e salva `pdf_storage_key`/`sha256` — mesmo padrão de `issueBudgetPdf`. */
export async function issueReceiptPdf(supabase: SupabaseClient, clinic: Clinic, receipt: Receipt, debits: TreatmentDebit[]): Promise<Receipt> {
  const logo = await loadClinicLogoForPdf(clinic.logo_url);
  const dentist = clinic.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf
    ? { name: clinic.dentist_name, cro: clinic.dentist_cro, croUf: clinic.dentist_cro_uf }
    : null;
  const pdfBytes = await buildReceiptPdf(receipt, debits, clinic, logo, dentist);
  const sha256 = crypto.createHash("sha256").update(Buffer.from(pdfBytes)).digest("hex");
  const pdfStorageKey = await saveReceiptPdf(clinic.id, receipt.id, pdfBytes);

  const { data: updated, error } = await supabase
    .from("receipts")
    .update({ pdf_storage_key: pdfStorageKey, sha256, updated_at: new Date().toISOString() })
    .eq("id", receipt.id)
    .select("*")
    .single();
  if (error || !updated) throw new Error(`Falha ao salvar PDF do recibo: ${error?.message}`);
  return updated as Receipt;
}

/** Envia o recibo por WhatsApp com um link de download — mesmo padrão de `sendBudgetWhatsApp`. */
export async function sendReceiptWhatsApp(supabase: SupabaseClient, clinic: Clinic, receipt: Receipt, debits: TreatmentDebit[]): Promise<void> {
  const patientPhone = receipt.patient_phone;
  if (!patientPhone) return;
  const current = receipt.pdf_storage_key ? receipt : await issueReceiptPdf(supabase, clinic, receipt, debits);
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/recibo?token=${current.token}`;
  const text = `🧾 Seu recibo de pagamento já está disponível: ${link}`;
  const sent = await sendText(clinic, patientPhone, text);
  if (sent) {
    await supabase.from("receipts").update({ sent_whatsapp_at: new Date().toISOString() }).eq("id", receipt.id);
  }
}
