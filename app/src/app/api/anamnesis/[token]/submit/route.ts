import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { savePdf } from "@/lib/pdfStorage";
import { notifyClinicSigned } from "@/lib/evolution"; // Pode ser ajustado para anamnese
// Importe a função de geração de PDF depois que criarmos
import { buildAnamnesisSignedPdf } from "@/lib/anamnesisSignaturePdf";
import { clinicHasConfiguredConsentTerm, hashConsentText, patientHasActiveConsent, recordConsentAcceptance } from "@/lib/electronicConsent";
import { ensureUniqueAnamnesisSignatureCode } from "@/lib/validationCode";

const answerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const strokeSchema = z.object({ 
  index: z.number(), 
  points: z.array(z.object({ x: z.number(), y: z.number(), t: z.number(), p: z.number().nullable() })) 
});

const signatureSchema = z.object({
  signerName: z.string().min(1),
  signerCpf: z.string().min(1),
  dataUrl: z.string().min(1),
  strokeData: z.object({
    schema: z.literal("tracado/v1"),
    canvas: z.object({ cssWidth: z.number(), cssHeight: z.number(), dpr: z.number() }),
    capturedAt: z.string(),
    pointerType: z.string(),
    strokes: z.array(strokeSchema),
    metrics: z.object({
      durationTotalMs: z.number(),
      pointsTotal: z.number(),
      numStrokes: z.number(),
      bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    }),
  }),
});

const bodySchema = z.object({
  patient_name: z.string().min(1),
  patient_cpf: z.string().optional().nullable(),
  patient_phone: z.string().optional().nullable(),
  birth_date: z.string().optional().nullable(),
  rg: z.string().optional().nullable(),
  occupation: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  answers: z.array(answerSchema),
  signature: signatureSchema,
  consent_accepted: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();

  // 1. Busca a anamnese pendente
  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("id, clinic_id, patient_cpf, patient_phone")
    .eq("token", params.token)
    .single();

  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 2. Verifica se já assinou
  const { data: existingSignature } = await supabase
    .from("signatures")
    .select("id")
    .eq("anamnesis_id", anamnesis.id)
    .maybeSingle();

  if (existingSignature) {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }

  // 3. Valida o payload
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  const signedAtServer = new Date().toISOString();

  // 4. Atualiza os dados da Anamnese (Answers)
  const { error: updateError } = await supabase
    .from("anamneses")
    .update({ 
      patient_name: payload.patient_name,
      patient_cpf: payload.patient_cpf || anamnesis.patient_cpf,
      patient_phone: payload.patient_phone || anamnesis.patient_phone,
      answers: payload.answers 
    })
    .eq("id", anamnesis.id);

  if (updateError) {
    console.error("Falha ao atualizar a anamnese no submit:", updateError);
    return NextResponse.json({ error: "update_anamnesis_failed", message: updateError.message }, { status: 500 });
  }

  // 5. Enriquecimento do Paciente (Patients) — acha ou cria (find-or-create,
  // não só update): sem isso, uma anamnese de paciente que nunca existiu no
  // sistema não deixava nenhum registro em `patients`, e o aceite do Termo
  // de Adesão (passo 6b abaixo) precisa de um patient_id pra existir.
  let patientQuery = supabase.from("patients").select("id").eq("clinic_id", anamnesis.clinic_id);
  if (payload.patient_cpf) {
    patientQuery = patientQuery.eq("cpf", payload.patient_cpf);
  } else if (payload.patient_phone) {
    patientQuery = patientQuery.eq("phone", payload.patient_phone);
  }
  const { data: patientMatches } = await patientQuery;

  let patientId: string | null = null;
  if (patientMatches && patientMatches.length > 0) {
    patientId = patientMatches[0].id;
    await supabase.from("patients").update({
      name: payload.patient_name,
      cpf: payload.patient_cpf,
      phone: payload.patient_phone,
      birth_date: payload.birth_date,
      rg: payload.rg,
      occupation: payload.occupation,
      address: payload.address,
      updated_at: new Date().toISOString()
    }).eq("id", patientId);
  } else {
    const { data: newPatient, error: createError } = await supabase
      .from("patients")
      .insert({
        clinic_id: anamnesis.clinic_id,
        name: payload.patient_name,
        cpf: payload.patient_cpf,
        phone: payload.patient_phone || anamnesis.patient_phone,
        birth_date: payload.birth_date,
        rg: payload.rg,
        occupation: payload.occupation,
        address: payload.address,
      })
      .select("id")
      .single();
    if (createError) {
      console.error("Falha ao criar paciente a partir da anamnese:", createError);
    } else {
      patientId = newPatient.id;
    }
  }

  // 6. Busca dados da clínica para o PDF e pro Termo de Adesão
  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, logo_url, consent_term_text, consent_term_version")
    .eq("id", anamnesis.clinic_id)
    .single();

  // 6b. Termo de Adesão Eletrônica — mesma exigência já aplicada à
  // assinatura de evolução clínica (lib/electronicConsent.ts). Só passa a
  // valer quando a clínica configurou o texto em Configurações; enquanto
  // não configurar, comportamento idêntico ao de antes desta mudança.
  if (clinic && clinicHasConfiguredConsentTerm(clinic) && patientId) {
    const alreadyConsented = await patientHasActiveConsent(supabase, patientId);
    if (!alreadyConsented) {
      if (!payload.consent_accepted) {
        return NextResponse.json({ error: "consent_required" }, { status: 400 });
      }
      try {
        await recordConsentAcceptance(supabase, {
          clinicId: anamnesis.clinic_id,
          patientId,
          termVersion: clinic.consent_term_version!,
          termTextHash: hashConsentText(clinic.consent_term_text!),
          phoneE164: payload.patient_phone || anamnesis.patient_phone || "",
          ip,
          userAgent,
        });
      } catch (err) {
        console.error("Falha ao registrar aceite do Termo de Adesão na anamnese:", err);
        return NextResponse.json({ error: "consent_record_failed", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }
  }

  // 7. Geração do PDF no backend
  const pdfBytes = await buildAnamnesisSignedPdf({
    clinicName: clinic?.name || "Clínica",
    clinicLogoUrl: clinic?.logo_url || null,
    patient: {
      name: payload.patient_name,
      cpf: payload.patient_cpf || null,
      phone: payload.patient_phone || anamnesis.patient_phone || null,
      birthDate: payload.birth_date || null,
      rg: payload.rg || null,
      occupation: payload.occupation || null,
      address: payload.address || null
    },
    answers: payload.answers,
    signature: {
      signerName: payload.signature.signerName,
      signerCpf: payload.signature.signerCpf,
      signedAt: signedAtServer,
      ip: ip,
      userAgent: userAgent,
      dataUrl: payload.signature.dataUrl
    }
  });

  const pdfBuffer = Buffer.from(pdfBytes);
  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  // 8. Salvar PDF no Storage — envolvido em try/catch porque savePdf/
  // ensureUniqueAnamnesisSignatureCode lançam exceção (não devolvem
  // {error}), o que sem isso vira uma resposta 500 genérica do Next.js
  // (não JSON), quebrando o `res.json()` do cliente.
  let pdfStorageKey: string;
  let verificationCode: string;
  try {
    pdfStorageKey = await savePdf(anamnesis.clinic_id, anamnesis.id, pdfBuffer);
    verificationCode = await ensureUniqueAnamnesisSignatureCode(supabase);
  } catch (err) {
    console.error("Falha ao salvar o PDF/gerar código de verificação da anamnese:", err);
    return NextResponse.json({ error: "pdf_save_failed", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  // 9. Registrar Assinatura
  const { data: signatureData, error: signatureError } = await supabase
    .from("signatures")
    .insert({
      anamnesis_id: anamnesis.id,
      clinic_id: anamnesis.clinic_id,
      signer_name: payload.signature.signerName,
      signer_cpf: payload.signature.signerCpf,
      signed_at_client: payload.signature.strokeData.capturedAt,
      signed_at_server: signedAtServer,
      ip,
      user_agent: userAgent,
      sha256,
      pdf_storage_key: pdfStorageKey,
      stroke_data: payload.signature.strokeData as any,
      verification_code: verificationCode,
    })
    .select("id")
    .single();

  if (signatureError) {
    console.error("Falha ao gravar a assinatura da anamnese:", signatureError);
    return NextResponse.json({ error: "signature_failed", message: signatureError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, signature_id: signatureData.id });
}
