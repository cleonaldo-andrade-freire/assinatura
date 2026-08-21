import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSignatureProvider } from "@/lib/signature";
import { computeContentHash, appendSignatureEvent } from "@/lib/documentSignatureEvents";
import { appendEvolutionDentistDeclaration } from "@/lib/evolutionDentistPdf";
import { saveEvolutionDentistPdf } from "@/lib/evolutionDentistPdfStorage";
import { readPdf } from "@/lib/pdfStorage";
import { buildEvolutionSnapshot } from "@/lib/evolutionSignature";
import { sendText } from "@/lib/evolution";
import { formatValidationCode } from "@/lib/validationCode";
import type { Clinic, TreatmentEvolution, TreatmentEvolutionSignature } from "@/lib/database.types";

export type IssueDentistSignatureResult =
  | { ok: true; externalSigning: { hashToSignBase64: string; signatureSessionId: string } }
  | { ok: true; finished: true; sentToPatient: boolean }
  | { ok: false; error: string };

/**
 * Passo 1 (assinatura ICP-Brasil da dentista, agente local — mesmo desenho
 * de `issueAnamnesisDentistSignature`): a evolução só pode ser
 * contra-assinada depois que o PACIENTE já assinou (ordem invertida em
 * relação ao comportamento antigo — antes a dentista assinava primeiro e
 * disparava automaticamente o pedido ao paciente; agora é o contrário,
 * porque só assim dá pra mesclar as duas assinaturas num único PDF sem
 * quebrar o hash criptográfico da dentista: carregamos o PDF que o paciente
 * já assinou — sem nenhuma assinatura ICP-Brasil ainda — e aplicamos a
 * assinatura da dentista em cima dele).
 */
export async function issueEvolutionDentistSignature(
  clinicId: string,
  evolutionId: string,
  signerCertificatePem?: string
): Promise<IssueDentistSignatureResult> {
  const supabase = createSupabaseAdminClient();

  const { data: evolutionData } = await supabase.from("treatment_evolutions").select("*").eq("id", evolutionId).eq("clinic_id", clinicId).maybeSingle();
  if (!evolutionData) return { ok: false, error: "not_found" };
  const ev = evolutionData as TreatmentEvolution;
  if (ev.dentist_signature_status === "assinada") return { ok: false, error: "already_signed" };

  const { data: patientSignatureData } = await supabase
    .from("treatment_evolution_signatures")
    .select("*")
    .eq("treatment_evolution_id", evolutionId)
    .maybeSingle();
  if (!patientSignatureData) return { ok: false, error: "patient_not_signed" };
  const patientSignature = patientSignatureData as TreatmentEvolutionSignature;

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;
  if (!clinic.dentist_name || !clinic.dentist_cro || !clinic.dentist_cro_uf) return { ok: false, error: "dentist_not_configured" };

  const { data: patient } = await supabase.from("patients").select("name, cpf, phone").eq("id", ev.patient_id).eq("clinic_id", clinicId).maybeSingle();
  if (!patient) return { ok: false, error: "patient_not_found" };

  // Reaproveita o snapshot já congelado quando o paciente assinou — não
  // recalcula (mesmo motivo do content_snapshot em requestEvolutionSignature).
  const snapshot = ev.content_snapshot
    ? ev.content_snapshot
    : await buildEvolutionSnapshot(supabase, ev, clinic, patient as { name: string; cpf: string | null });
  const contentHash = ev.content_hash ?? computeContentHash(snapshot);
  if (!ev.content_snapshot) {
    await supabase.from("treatment_evolutions").update({ content_snapshot: snapshot, content_hash: contentHash }).eq("id", evolutionId);
  }

  // Carrega o PDF que o paciente já assinou (sem assinatura criptográfica
  // nenhuma ainda) e acrescenta a página de contra-assinatura da dentista.
  const patientPdfBytes = await readPdf(patientSignature.pdf_storage_key);
  const patientPdfDoc = await PDFDocument.load(patientPdfBytes);
  const pdfBytes = await appendEvolutionDentistDeclaration(patientPdfDoc, {
    dentist: { name: clinic.dentist_name, cro: clinic.dentist_cro, croUf: clinic.dentist_cro_uf },
  });

  const provider = getSignatureProvider();
  const result = await provider.requestSignature({
    pdfBytes,
    documentId: evolutionId,
    clinicId,
    signerName: clinic.dentist_name,
    signerDocument: `CRO ${clinic.dentist_cro}/${clinic.dentist_cro_uf}`,
    signerCpf: clinic.dentist_cpf ?? "",
    signerEmail: clinic.dentist_email ?? "",
    signerCertificatePem,
  });

  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status === "pendente") {
    // Providers assíncronos remotos (ex.: certisign) precisariam de um
    // poller/webhook próprio pra evolução, que não existe ainda — só
    // local_agent (síncrono do ponto de vista do fluxo, via agente
    // Windows) está com o fluxo completo pra este documento.
    return { ok: false, error: "provider_not_supported_for_evolutions" };
  }
  if (result.status === "external_signing") {
    return { ok: true, externalSigning: { hashToSignBase64: result.hashToSignBase64, signatureSessionId: result.signatureSessionId } };
  }

  // "assinado" (provider mock, resolve na hora) — finaliza direto.
  const sentToPatient = await finishAndNotify(supabase, clinicId, evolutionId, clinic, patientSignature, result.signedPdfBytes, result.signedAt);
  return { ok: true, finished: true, sentToPatient };
}

/** Passo 2 — chamado depois que o navegador assinou o hash com o agente
 * local (ver useAgent/signHash no frontend, mesmo padrão de
 * certificates/[id]/sign-local/finish). */
export async function finishEvolutionDentistSignature(
  clinicId: string,
  evolutionId: string,
  signatureSessionId: string,
  signatureBase64: string
): Promise<{ ok: true; sentToPatient: boolean } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;

  const { data: patientSignatureData } = await supabase
    .from("treatment_evolution_signatures")
    .select("*")
    .eq("treatment_evolution_id", evolutionId)
    .maybeSingle();
  if (!patientSignatureData) return { ok: false, error: "patient_not_signed" };

  const provider = getSignatureProvider();
  if (!provider.completeExternalSignature) return { ok: false, error: "provider_not_supported_for_evolutions" };

  const result = await provider.completeExternalSignature(signatureSessionId, signatureBase64);
  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status !== "assinado") return { ok: false, error: "signature_incomplete" };

  const sentToPatient = await finishAndNotify(
    supabase,
    clinicId,
    evolutionId,
    clinic,
    patientSignatureData as TreatmentEvolutionSignature,
    result.signedPdfBytes,
    result.signedAt
  );
  return { ok: true, sentToPatient };
}

async function finishAndNotify(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  clinicId: string,
  evolutionId: string,
  clinic: Clinic,
  patientSignature: TreatmentEvolutionSignature,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<boolean> {
  const sha256 = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");
  const pdfStorageKey = await saveEvolutionDentistPdf(clinicId, evolutionId, signedPdfBytes);

  await supabase
    .from("treatment_evolutions")
    .update({
      dentist_signature_status: "assinada",
      dentist_signed_at: signedAt,
      dentist_pdf_storage_key: pdfStorageKey,
      dentist_pdf_sha256: sha256,
    })
    .eq("id", evolutionId);

  await appendSignatureEvent(supabase, {
    clinicId,
    documentType: "treatment_evolution",
    documentId: evolutionId,
    eventType: "dentista_assinou",
    actor: "dentist",
    payload: { sha256 },
  });

  // Best-effort — mesma lógica de requestEvolutionSignature/signEvolution:
  // uma falha de WhatsApp não pode travar a finalização, que já foi salva.
  try {
    const { data: evolution } = await supabase.from("treatment_evolutions").select("patient_id").eq("id", evolutionId).maybeSingle();
    const { data: patient } = evolution
      ? await supabase.from("patients").select("name, phone").eq("id", evolution.patient_id).maybeSingle()
      : { data: null };
    if (patient?.phone) {
      const link = `${process.env.NEXT_PUBLIC_APP_URL}/validar-evolucao/${patientSignature.verification_code}`;
      return await sendText(
        clinic,
        patient.phone,
        `✅ A doutora confirmou o registro do seu atendimento. O documento completo (com as duas assinaturas) está disponível aqui: ${link}\n\nCódigo de verificação: ${formatValidationCode(patientSignature.verification_code)}`
      );
    }
    return false;
  } catch (err) {
    console.error("Falha ao notificar o paciente sobre a contra-assinatura da evolução:", err);
    return false;
  }
}
