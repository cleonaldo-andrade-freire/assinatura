import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { savePdf } from "@/lib/pdfStorage";
import { notifyClinicSigned } from "@/lib/evolution";

/**
 * Chamado pela página pública /assinatura quando o paciente confirma a
 * assinatura. Recebe multipart/form-data (PDF como arquivo binário), não
 * JSON com o PDF em base64 — base64 dentro de um corpo JSON grande é um
 * problema documentado do fetch() no Safari/WebKit (iOS), que falhava
 * consistentemente em iPhone mesmo com o mesmo fluxo funcionando certinho
 * no desktop. FormData evita o inchaço de ~33% do base64 e usa o caminho
 * nativo de upload binário, mesmo padrão já usado nas rotas de imagem
 * (evoluções, galeria do paciente).
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("id, clinic_id")
    .eq("token", params.token)
    .single();
  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: existingSignature } = await supabase
    .from("signatures")
    .select("id")
    .eq("anamnesis_id", anamnesis.id)
    .maybeSingle();
  if (existingSignature) {
    return NextResponse.json({ error: "already_signed" }, { status: 409 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const name = String(form.get("name") ?? "").trim();
  const cpf = String(form.get("cpf") ?? "").trim();
  const signedAtClient = String(form.get("signed_at_client") ?? "");
  const pdfFile = form.get("pdf");
  if (!name || !cpf || !signedAtClient || !(pdfFile instanceof File) || pdfFile.size === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const pdfStorageKey = await savePdf(anamnesis.clinic_id, anamnesis.id, pdfBuffer);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  const { error: insertError } = await supabase.from("signatures").insert({
    anamnesis_id: anamnesis.id,
    clinic_id: anamnesis.clinic_id,
    signer_name: name,
    signer_cpf: cpf,
    signed_at_client: new Date(signedAtClient).toISOString(),
    ip,
    user_agent: userAgent,
    sha256,
    pdf_storage_key: pdfStorageKey,
  });
  if (insertError) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", anamnesis.clinic_id).single();
  if (clinic) {
    await notifyClinicSigned(clinic, name);
  }

  return NextResponse.json({ ok: true });
}
