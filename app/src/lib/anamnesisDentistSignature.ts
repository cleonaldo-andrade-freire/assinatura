import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeContentHash } from "@/lib/documentSignatureEvents";
import { getSignatureProvider } from "@/lib/signature";
import { appendAnamnesisDentistDeclaration } from "@/lib/anamnesisDentistPdf";
import { saveAnamnesisDentistPdf } from "@/lib/anamnesisDentistPdfStorage";
import { readPdf } from "@/lib/pdfStorage";
import { sendText } from "@/lib/evolution";
import { formatValidationCode } from "@/lib/validationCode";
import type { Anamnesis, Clinic, Signature } from "@/lib/database.types";

export type IssueAnamnesisDentistSignatureResult =
  | { ok: true; externalSigning: { hashToSignBase64: string; signatureSessionId: string } }
  | { ok: true; finished: true }
  | { ok: false; error: string };

/** Congela o conteúdo que a dentista está prestes a confirmar — mesmo
 * motivo de `buildEvolutionSnapshot`: se a anamnese pudesse mudar depois, o
 * hash guardado deixaria de bater com o que foi efetivamente revisado. Não
 * é mais usado pra desenhar o PDF (a paciente já assinou o dela, ver
 * `appendAnamnesisDentistDeclaration`) — só pra auditoria/integridade. */
function buildAnamnesisDentistSnapshot(anamnesis: Anamnesis, clinic: Clinic) {
  return {
    schema: "anamnese-dentista/v1" as const,
    clinic: { name: clinic.name, logoUrl: clinic.logo_url },
    dentist: { name: clinic.dentist_name!, cro: clinic.dentist_cro!, croUf: clinic.dentist_cro_uf! },
    patient: { name: anamnesis.patient_name, cpf: anamnesis.patient_cpf, phone: anamnesis.patient_phone },
    answers: anamnesis.answers,
    anamnesisDate: anamnesis.created_at,
  };
}

/**
 * Passo 1 (assinatura ICP-Brasil da dentista, agente local — mesmo desenho
 * de `issueEvolutionDentistSignature`): a anamnese só pode ser
 * contra-assinada depois que a paciente já assinou (`signatures` precisa
 * existir). Diferente da evolução clínica, aqui a ordem (paciente primeiro,
 * dentista depois) já é a de sempre — é o que permite mesclar num único
 * arquivo: carregamos o PDF que a paciente assinou (sem nenhuma assinatura
 * criptográfica ainda) e aplicamos a assinatura ICP-Brasil da dentista em
 * cima dele, em vez de gerar um documento paralelo.
 */
export async function issueAnamnesisDentistSignature(
  clinicId: string,
  anamnesisId: string,
  signerCertificatePem?: string
): Promise<IssueAnamnesisDentistSignatureResult> {
  const supabase = createSupabaseAdminClient();

  const { data: anamnesisData } = await supabase.from("anamneses").select("*").eq("id", anamnesisId).eq("clinic_id", clinicId).maybeSingle();
  if (!anamnesisData) return { ok: false, error: "not_found" };
  const anamnesis = anamnesisData as Anamnesis;

  const { data: signatureData } = await supabase.from("signatures").select("*").eq("anamnesis_id", anamnesisId).maybeSingle();
  if (!signatureData) return { ok: false, error: "patient_not_signed" };
  const signature = signatureData as Signature;
  if (signature.dentist_signature_status === "assinada") return { ok: false, error: "already_signed" };

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;
  if (!clinic.dentist_name || !clinic.dentist_cro || !clinic.dentist_cro_uf) return { ok: false, error: "dentist_not_configured" };

  const snapshot = buildAnamnesisDentistSnapshot(anamnesis, clinic);
  const contentHash = computeContentHash(snapshot);
  await supabase.from("signatures").update({ dentist_content_snapshot: snapshot, dentist_content_hash: contentHash }).eq("id", signature.id);

  // Carrega o PDF que a paciente já assinou (sem assinatura criptográfica
  // nenhuma ainda — só o traço desenhado) e acrescenta a página de
  // contra-assinatura da dentista nele mesmo, em vez de montar um arquivo novo.
  const patientPdfBytes = await readPdf(signature.pdf_storage_key);
  const patientPdfDoc = await PDFDocument.load(patientPdfBytes);
  const pdfBytes = await appendAnamnesisDentistDeclaration(patientPdfDoc, {
    dentist: { name: clinic.dentist_name, cro: clinic.dentist_cro, croUf: clinic.dentist_cro_uf },
  });

  const provider = getSignatureProvider();
  const result = await provider.requestSignature({
    pdfBytes,
    documentId: anamnesisId,
    clinicId,
    signerName: clinic.dentist_name,
    signerDocument: `CRO ${clinic.dentist_cro}/${clinic.dentist_cro_uf}`,
    signerCpf: clinic.dentist_cpf ?? "",
    signerEmail: clinic.dentist_email ?? "",
    signerCertificatePem,
  });

  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status === "pendente") {
    // Mesma limitação de issueEvolutionDentistSignature — providers
    // assíncronos remotos (ex.: certisign) precisariam de um poller/webhook
    // próprio, que não existe ainda pra este documento.
    return { ok: false, error: "provider_not_supported_for_anamneses" };
  }
  if (result.status === "external_signing") {
    return { ok: true, externalSigning: { hashToSignBase64: result.hashToSignBase64, signatureSessionId: result.signatureSessionId } };
  }

  // "assinado" (provider mock, resolve na hora) — finaliza direto.
  await finishAndNotify(supabase, clinicId, anamnesisId, signature, clinic, result.signedPdfBytes, result.signedAt);
  return { ok: true, finished: true };
}

/** Passo 2 — chamado depois que o navegador assinou o hash com o agente
 * local (ver useAgent/signHash no frontend, mesmo padrão de
 * evolutionDentistSignature.ts/finishEvolutionDentistSignature). */
export async function finishAnamnesisDentistSignature(
  clinicId: string,
  anamnesisId: string,
  signatureSessionId: string,
  signatureBase64: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: signatureData } = await supabase.from("signatures").select("*").eq("anamnesis_id", anamnesisId).maybeSingle();
  if (!signatureData) return { ok: false, error: "patient_not_signed" };
  const signature = signatureData as Signature;

  const { data: clinicData } = await supabase.from("clinics").select("*").eq("id", clinicId).single();
  if (!clinicData) return { ok: false, error: "clinic_not_found" };
  const clinic = clinicData as Clinic;

  const provider = getSignatureProvider();
  if (!provider.completeExternalSignature) return { ok: false, error: "provider_not_supported_for_anamneses" };

  const result = await provider.completeExternalSignature(signatureSessionId, signatureBase64);
  if (result.status === "falha") return { ok: false, error: result.errorMessage };
  if (result.status !== "assinado") return { ok: false, error: "signature_incomplete" };

  await finishAndNotify(supabase, clinicId, anamnesisId, signature, clinic, result.signedPdfBytes, result.signedAt);
  return { ok: true };
}

async function finishAndNotify(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  clinicId: string,
  anamnesisId: string,
  signature: Signature,
  clinic: Clinic,
  signedPdfBytes: Uint8Array,
  signedAt: string
): Promise<void> {
  const sha256 = crypto.createHash("sha256").update(Buffer.from(signedPdfBytes)).digest("hex");
  const pdfStorageKey = await saveAnamnesisDentistPdf(clinicId, anamnesisId, signedPdfBytes);

  await supabase
    .from("signatures")
    .update({
      dentist_signature_status: "assinada",
      dentist_signed_at: signedAt,
      dentist_pdf_storage_key: pdfStorageKey,
      dentist_pdf_sha256: sha256,
    })
    .eq("id", signature.id);

  // Best-effort — mesmo padrão de notifyClinicSigned: uma falha de WhatsApp
  // não pode travar a finalização da assinatura, que já foi salva acima.
  // Sem código de verificação (assinatura da paciente feita antes da
  // migration 060), não tem link público pra mandar — segue sem notificar.
  if (signature.verification_code) {
    try {
      const link = `${process.env.NEXT_PUBLIC_APP_URL}/validar-anamnese/${signature.verification_code}`;
      const phone = await resolveAnamnesisPatientPhone(supabase, anamnesisId);
      if (phone) {
        await sendText(
          clinic,
          phone,
          `✅ A doutora confirmou sua anamnese. O documento completo (com as duas assinaturas) está disponível aqui: ${link}\n\nCódigo de verificação: ${formatValidationCode(signature.verification_code)}`
        );
      }
    } catch (err) {
      console.error("Falha ao notificar a paciente sobre a contra-assinatura da anamnese:", err);
    }
  }
}

async function resolveAnamnesisPatientPhone(supabase: ReturnType<typeof createSupabaseAdminClient>, anamnesisId: string): Promise<string | null> {
  const { data } = await supabase.from("anamneses").select("patient_phone").eq("id", anamnesisId).maybeSingle();
  return data?.patient_phone ?? null;
}
