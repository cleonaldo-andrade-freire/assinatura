import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildConsentTermPdf } from "@/lib/consentTermPdf";
import { savePdf } from "@/lib/pdfStorage";

const strokeSchema = z.object({ 
  index: z.number(), 
  points: z.array(z.object({ x: z.number(), y: z.number(), t: z.number(), p: z.number().nullable() })) 
});

const bodySchema = z.object({
  cpfInput: z.string().min(1),
  signature: z.object({
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
  }),
});

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!params.token || !/^[0-9a-f]{64}$/i.test(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: request } = await supabase
    .from("consent_term_signatures")
    .select("*")
    .eq("token", params.token)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (request.status !== "aguardando_assinatura") {
    return NextResponse.json({ error: "invalid_status", message: "Este link já foi utilizado ou está inválido." }, { status: 400 });
  }

  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired", message: "O link expirou." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const payload = parsed.data;

  const [{ data: clinic }, { data: patient }] = await Promise.all([
    supabase.from("clinics").select("name, logo_url, consent_term_text, cnpj").eq("id", request.clinic_id).single(),
    supabase.from("patients").select("id, name, cpf, phone").eq("id", request.patient_id).single()
  ]);

  if (!clinic || !patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Verificar o segundo fator (CPF)
  const onlyDigits = (str: string | null) => (str || "").replace(/\D/g, "");
  if (patient.cpf && onlyDigits(payload.cpfInput) !== onlyDigits(patient.cpf)) {
    return NextResponse.json({ error: "wrong_cpf", message: "O CPF informado não confere com o cadastro." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  const signedAtServer = new Date().toISOString();
  const verificationCode = crypto.randomBytes(6).toString("hex").toUpperCase();

  const processedHtml = (clinic.consent_term_text || "")
    .replace(/\{\{clinica_nome\}\}/g, clinic.name || "")
    .replace(/\{\{clinica_cnpj\}\}/g, clinic.cnpj || "Não informado")
    .replace(/\{\{paciente_nome\}\}/g, patient.name || "")
    .replace(/\{\{paciente_cpf\}\}/g, patient.cpf || "Não informado");

  // Gerar o PDF
  const pdfBytes = await buildConsentTermPdf({
    clinicName: clinic.name,
    clinicLogoUrl: clinic.logo_url,
    patientName: patient.name,
    patientCpf: patient.cpf,
    patientPhone: request.phone_e164 || patient.phone,
    consentTermHtml: processedHtml,
    signature: {
      signerName: payload.signature.signerName,
      signerCpf: payload.signature.signerCpf,
      signedAtServerIso: signedAtServer,
      ip,
      userAgent,
      strokeData: payload.signature.strokeData
    },
    verificationCode
  });

  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const fileName = `${request.clinic_id}/consent_term_${request.id}_${pdfHash.substring(0, 8)}.pdf`;

  const pdfStorageKey = await savePdf("treatment-evolutions", fileName, pdfBuffer); // reaproveitamos o bucket das evoluções ou anamneses (pode ser "anamneses" também se quiser, são PDFs)

  if (!pdfStorageKey) {
    return NextResponse.json({ error: "pdf_storage_failed" }, { status: 500 });
  }

  // Atualiza o request original
  await supabase.from("consent_term_signatures").update({
    status: "assinado",
    signer_name: payload.signature.signerName,
    signer_cpf: payload.signature.signerCpf,
    signed_at_client: payload.signature.strokeData.capturedAt,
    signed_at_server: signedAtServer,
    ip,
    user_agent: userAgent,
    stroke_data: payload.signature.strokeData as any,
    verification_code: verificationCode,
    pdf_storage_key: pdfStorageKey,
    sha256: pdfHash,
    updated_at: new Date().toISOString()
  }).eq("id", request.id);

  // Insere na tabela principal de consentimentos (que o sistema original usa)
  await supabase.from("electronic_consent_terms").insert({
    clinic_id: request.clinic_id,
    patient_id: request.patient_id,
    term_version: request.term_version,
    term_text_hash: request.term_text_hash,
    accepted_at: signedAtServer,
    accept_channel: "whatsapp",
    phone_e164: request.phone_e164,
    ip,
    user_agent: userAgent
  });

  return NextResponse.json({ ok: true, verification_code: verificationCode });
}
