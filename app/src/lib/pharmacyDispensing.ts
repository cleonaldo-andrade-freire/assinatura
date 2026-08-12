import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeValidationCode } from "@/lib/validationCode";
import type { Prescription, PrescriptionItem } from "@/lib/database.types";

export type PharmacyLookupResult =
  | { found: true; prescription: Prescription; clinicName: string }
  | { found: false; reason: "not_found" | "revoked" };

/**
 * Busca a prescrição pro fluxo de dispensação da farmácia. Diferente de
 * `lookupDocumentValidation` (que propositalmente esconde os itens), aqui a
 * farmácia precisa ver nome do medicamento, dosagem e posologia pra saber o
 * que dispensar — o código da prescrição é o próprio "acesso via código"
 * previsto no escopo original, no lugar de uma conta de farmacêutico.
 */
export async function lookupPrescriptionForDispensing(
  supabase: SupabaseClient,
  rawCode: string
): Promise<PharmacyLookupResult> {
  const code = normalizeValidationCode(rawCode);
  if (!code) return { found: false, reason: "not_found" };

  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("validation_code", code)
    .eq("status", "assinado")
    .maybeSingle();
  if (!prescription) return { found: false, reason: "not_found" };
  if (prescription.revoked_at) return { found: false, reason: "revoked" };

  const { data: clinic } = await supabase.from("clinics").select("name").eq("id", prescription.clinic_id).maybeSingle();

  return { found: true, prescription: prescription as Prescription, clinicName: clinic?.name ?? "" };
}

export type DispenseResult =
  | { ok: true; items: PrescriptionItem[] }
  | { ok: false; error: "prescription_not_found" | "item_not_found" | "already_dispensed" | "unknown" };

/** Chama a função `dispense_prescription_item` (ver `021_prescription_dispensing.sql`) — trava a linha da prescrição durante a checagem+update, evitando baixa duplicada por concorrência. */
export async function dispensePrescriptionItem(
  supabase: SupabaseClient,
  prescriptionId: string,
  itemIndex: number,
  crf: string,
  cnpj: string
): Promise<DispenseResult> {
  const { data, error } = await supabase.rpc("dispense_prescription_item", {
    p_prescription_id: prescriptionId,
    p_item_index: itemIndex,
    p_crf: crf,
    p_cnpj: cnpj,
  });

  if (error) {
    const message = error.message || "";
    if (message.includes("already_dispensed")) return { ok: false, error: "already_dispensed" };
    if (message.includes("item_not_found")) return { ok: false, error: "item_not_found" };
    if (message.includes("prescription_not_found")) return { ok: false, error: "prescription_not_found" };
    console.error("Falha ao dar baixa no item da prescrição:", error);
    return { ok: false, error: "unknown" };
  }

  return { ok: true, items: (data as PrescriptionItem[]) ?? [] };
}
