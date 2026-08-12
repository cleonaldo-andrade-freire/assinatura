import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeValidationCode } from "@/lib/validationCode";

export interface DocumentValidationResult {
  found: boolean;
  documentType?: "atestado" | "prescricao";
  clinicName?: string;
  dentistName?: string;
  dentistCro?: string;
  dentistCroUf?: string;
  patientName?: string;
  issuedAt?: string;
  sha256?: string | null;
  revoked?: boolean;
  revokedAt?: string | null;
}

/**
 * Consulta um código de validação (portal público — ver `app/validar/[code]/page.tsx`)
 * contra `certificates` e `prescriptions`, sempre com a chave de serviço (não
 * existe sessão nesse contexto). Nunca retorna CID nem medicamento — só o que
 * confirma autenticidade pra quem recebeu o documento em mãos (farmácia, RH).
 */
export async function lookupDocumentValidation(supabase: SupabaseClient, rawCode: string): Promise<DocumentValidationResult> {
  const code = normalizeValidationCode(rawCode);
  if (!code) return { found: false };

  const [{ data: certificate }, { data: prescription }] = await Promise.all([
    supabase.from("certificates").select("*").eq("validation_code", code).eq("status", "assinado").maybeSingle(),
    supabase.from("prescriptions").select("*").eq("validation_code", code).eq("status", "assinado").maybeSingle(),
  ]);

  const doc = certificate ?? prescription;
  if (!doc) return { found: false };

  const { data: clinic } = await supabase.from("clinics").select("name").eq("id", doc.clinic_id).maybeSingle();

  return {
    found: true,
    documentType: certificate ? "atestado" : "prescricao",
    clinicName: clinic?.name,
    dentistName: doc.dentist_name,
    dentistCro: doc.dentist_cro,
    dentistCroUf: doc.dentist_cro_uf,
    patientName: doc.patient_name,
    issuedAt: doc.created_at,
    sha256: doc.sha256,
    revoked: !!doc.revoked_at,
    revokedAt: doc.revoked_at,
  };
}
