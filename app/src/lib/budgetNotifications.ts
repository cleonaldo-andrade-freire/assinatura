import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBudgetPdf } from "@/lib/budgetPdf";
import { saveBudgetPdf } from "@/lib/budgetPdfStorage";
import { loadClinicLogoForPdf } from "@/lib/pdfLogo";
import { sendText } from "@/lib/evolution";
import type { Budget, BudgetItem, Clinic } from "@/lib/database.types";

/**
 * Gera o PDF do orçamento e salva `pdf_storage_key`/`sha256` na linha —
 * idempotente (pode ser chamado de novo pra regenerar, ex.: se a primeira
 * geração falhou na criação do orçamento). Retorna o orçamento atualizado.
 */
export async function issueBudgetPdf(supabase: SupabaseClient, clinic: Clinic, budget: Budget, items: BudgetItem[]): Promise<Budget> {
  const logo = await loadClinicLogoForPdf(clinic.logo_url);
  const dentist = clinic.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf
    ? { name: clinic.dentist_name, cro: clinic.dentist_cro, croUf: clinic.dentist_cro_uf }
    : null;
  const pdfBytes = await buildBudgetPdf(budget, items, clinic, logo, dentist);
  const sha256 = crypto.createHash("sha256").update(Buffer.from(pdfBytes)).digest("hex");
  const pdfStorageKey = await saveBudgetPdf(clinic.id, budget.id, pdfBytes);

  const { data: updated, error } = await supabase
    .from("budgets")
    .update({ pdf_storage_key: pdfStorageKey, sha256, updated_at: new Date().toISOString() })
    .eq("id", budget.id)
    .select("*")
    .single();
  if (error || !updated) throw new Error(`Falha ao salvar PDF do orçamento: ${error?.message}`);
  return updated as Budget;
}

/**
 * Envia o orçamento por WhatsApp com um link de download do PDF — disparado
 * manualmente pelo botão na aba "Orçamentos" do paciente. Gera o PDF na hora
 * se ainda não existir (defensivo: a geração na criação é best-effort).
 */
export async function sendBudgetWhatsApp(
  supabase: SupabaseClient,
  clinic: Clinic,
  budget: Budget,
  items: BudgetItem[]
): Promise<void> {
  const current = budget.pdf_storage_key ? budget : await issueBudgetPdf(supabase, clinic, budget, items);
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/orcamento?token=${current.token}`;
  const text = `📋 Seu orçamento odontológico (${current.description}) já está disponível: ${link}`;
  const sent = await sendText(clinic, current.patient_phone, text);
  if (sent) {
    await supabase.from("budgets").update({ sent_whatsapp_at: new Date().toISOString() }).eq("id", budget.id);
  }
}
