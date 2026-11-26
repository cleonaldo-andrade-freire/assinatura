import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { savePdf } from "@/lib/pdfStorage";
import { notifyClinicSigned } from "@/lib/evolution";
// Importe a função de geração de PDF depois que criarmos
import { buildAnamnesisSignedPdf } from "@/lib/anamnesisSignaturePdf";
import { ensureUniqueAnamnesisSignatureCode } from "@/lib/validationCode";
import { anamnesisFormSchema, saveAnamnesisForm } from "@/lib/anamnesisForm";

const strokeSchema = z.object({ 
  index: z.number(), 
  points: z.array(z.object({ x: z.number(), y: z.number(), t: z.number(), p: z.number().nullable() })) 
});

const signatureSchema = z.object({
  signerName: z.string().min(1),
  signerCpf: z.string(), // CPF é opcional no formulário ("CPF (opcional)") — vazio é válido
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
    return NextResponse.json({ error: "already_signed", message: "Esta anamnese já foi assinada anteriormente." }, { status: 409 });
  }

  // 3. Grava os dados do formulário ANTES de olhar a assinatura — se a
  // assinatura vier inválida ou algo falhar depois (PDF, storage), a clínica
  // já fica com as respostas e o cadastro do paciente pra atender.
  const raw = await req.json().catch(() => null);
  const formParsed = anamnesisFormSchema.required({ answers: true }).safeParse(raw);
  if (!formParsed.success) {
    console.error("Payload inválido no submit da anamnese:", formParsed.error.flatten());
    return NextResponse.json({ error: "invalid_body", message: "Dados do formulário inválidos.", details: formParsed.error.flatten() }, { status: 400 });
  }
  const form = formParsed.data;

  const { error: saveError } = await saveAnamnesisForm(supabase, anamnesis, form);
  if (saveError) {
    return NextResponse.json({ error: "update_anamnesis_failed", message: saveError }, { status: 500 });
  }

  // 4. Agora sim a assinatura
  const signatureParsed = signatureSchema.safeParse(raw?.signature);
  if (!signatureParsed.success) {
    console.error("Assinatura inválida no submit da anamnese (dados já gravados):", signatureParsed.error.flatten());
    return NextResponse.json(
      { error: "invalid_signature", message: "Suas respostas foram salvas, mas a assinatura não pôde ser registrada. Assine novamente.", details: signatureParsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = { ...form, answers: form.answers!, signature: signatureParsed.data };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  const signedAtServer = new Date().toISOString();

  // 6. Busca dados da clínica para o PDF
  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, logo_url, clinic_address, cnpj, dentist_name, dentist_cro, dentist_cro_uf, notify_phone, evolution_base_url, evolution_instance_name, evolution_api_key")
    .eq("id", anamnesis.clinic_id)
    .single();
  const dentist =
    clinic?.dentist_name && clinic.dentist_cro && clinic.dentist_cro_uf
      ? { name: clinic.dentist_name, cro: clinic.dentist_cro, croUf: clinic.dentist_cro_uf }
      : null;

  // Termo de Adesão Eletrônica: não bloqueia a assinatura da anamnese — a
  // aceitação do termo acontece depois, num momento separado (mesmo texto/
  // mecanismo de lib/electronicConsent.ts, já usado na assinatura de
  // evolução clínica, só que não encadeado aqui).

  // 7. Geração do PDF no backend
  const pdfBytes = await buildAnamnesisSignedPdf({
    clinicName: clinic?.name || "Clínica",
    clinicLogoUrl: clinic?.logo_url || null,
    clinicAddress: clinic?.clinic_address || null,
    cnpj: clinic?.cnpj || null,
    dentist,
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

  // 10. Avisa a dentista no WhatsApp (número de avisos em Configurações).
  // Best-effort: sendText nunca lança, e falha aqui não desfaz a assinatura.
  if (clinic) {
    await notifyClinicSigned(
      clinic,
      payload.patient_name,
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/anamneses/${anamnesis.id}`
    );
  }

  return NextResponse.json({ ok: true, signature_id: signatureData.id });
}
