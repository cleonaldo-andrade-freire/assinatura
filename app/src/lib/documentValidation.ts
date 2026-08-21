import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeValidationCode } from "@/lib/validationCode";
import { verifySignatureChain } from "@/lib/documentSignatureEvents";
import { formatTreatmentsLabel } from "@/lib/treatments";

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

export interface EvolutionValidationResult {
  found: boolean;
  clinicName?: string;
  dentistName?: string;
  dentistCro?: string;
  dentistCroUf?: string;
  patientName?: string;
  treatmentName?: string;
  evolutionDate?: string;
  signedAt?: string;
  sha256?: string;
  chainIntact?: boolean;
  /** true quando a dentista já contra-assinou — nesse caso `sha256` aponta
   * pro arquivo final (paciente + dentista), não só o da paciente. */
  dentistSigned?: boolean;
}

/** Mesma ideia de `lookupDocumentValidation`, mas pro código impresso no
 * manifesto de assinatura da evolução clínica (portal público — ver
 * `app/validar-evolucao/[code]/page.tsx`). Reconfere a cadeia de eventos de
 * auditoria na hora, não confia só no que ficou embutido no PDF na época. */
export async function lookupEvolutionValidation(supabase: SupabaseClient, rawCode: string): Promise<EvolutionValidationResult> {
  const code = normalizeValidationCode(rawCode);
  if (!code) return { found: false };

  const { data: signature } = await supabase
    .from("treatment_evolution_signatures")
    .select("*")
    .eq("verification_code", code)
    .maybeSingle();
  if (!signature) return { found: false };

  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("clinic_id, content_snapshot, dentist_signature_status, dentist_pdf_sha256")
    .eq("id", signature.treatment_evolution_id)
    .maybeSingle();
  if (!evolution) return { found: false };

  const { data: clinic } = await supabase.from("clinics").select("name").eq("id", evolution.clinic_id).maybeSingle();
  const snapshot = evolution.content_snapshot as {
    dentist: { name: string; cro: string; croUf: string };
    patient: { name: string };
    treatments: { name: string; toothRegion: string | null }[];
    evolutionDate: string;
  } | null;

  const chainCheck = await verifySignatureChain(supabase, "treatment_evolution", signature.treatment_evolution_id);

  // O arquivo final é o que a dentista contra-assinou (paciente + dentista
  // no mesmo PDF) quando existir; senão, ainda só o da paciente sozinha —
  // ver evolutionDentistSignature.ts.
  const hasDentistSignature = evolution.dentist_signature_status === "assinada";

  return {
    found: true,
    clinicName: clinic?.name,
    dentistName: snapshot?.dentist.name,
    dentistCro: snapshot?.dentist.cro,
    dentistCroUf: snapshot?.dentist.croUf,
    patientName: snapshot?.patient.name,
    treatmentName: snapshot?.treatments ? formatTreatmentsLabel(snapshot.treatments) : undefined,
    evolutionDate: snapshot?.evolutionDate,
    signedAt: signature.signed_at_server,
    sha256: hasDentistSignature ? evolution.dentist_pdf_sha256 : signature.sha256,
    chainIntact: chainCheck.ok,
    dentistSigned: hasDentistSignature,
  };
}

export interface AnamnesisValidationResult {
  found: boolean;
  clinicName?: string;
  dentistName?: string | null;
  dentistCro?: string | null;
  dentistCroUf?: string | null;
  patientName?: string;
  signedAt?: string;
  sha256?: string | null;
  dentistSigned?: boolean;
}

/** Mesma ideia de `lookupEvolutionValidation`, mas pro código de validação
 * pública da anamnese (portal — ver `app/validar-anamnese/[code]/page.tsx`).
 * Sem cadeia de eventos de auditoria pra conferir aqui (a anamnese não usa
 * `document_signature_events` hoje) — só o hash do arquivo. */
export async function lookupAnamnesisValidation(supabase: SupabaseClient, rawCode: string): Promise<AnamnesisValidationResult> {
  const code = normalizeValidationCode(rawCode);
  if (!code) return { found: false };

  const { data: signature } = await supabase.from("signatures").select("*").eq("verification_code", code).maybeSingle();
  if (!signature) return { found: false };

  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("clinic_id, patient_name")
    .eq("id", signature.anamnesis_id)
    .maybeSingle();
  if (!anamnesis) return { found: false };

  const { data: clinic } = await supabase.from("clinics").select("name").eq("id", anamnesis.clinic_id).maybeSingle();

  const dentistSigned = signature.dentist_signature_status === "assinada";
  const snapshot = signature.dentist_content_snapshot as { dentist: { name: string; cro: string; croUf: string } } | null;

  return {
    found: true,
    clinicName: clinic?.name,
    dentistName: dentistSigned ? snapshot?.dentist.name ?? null : null,
    dentistCro: dentistSigned ? snapshot?.dentist.cro ?? null : null,
    dentistCroUf: dentistSigned ? snapshot?.dentist.croUf ?? null : null,
    patientName: anamnesis.patient_name,
    signedAt: dentistSigned ? signature.dentist_signed_at : signature.signed_at_server,
    sha256: dentistSigned ? signature.dentist_pdf_sha256 : signature.sha256,
    dentistSigned,
  };
}
