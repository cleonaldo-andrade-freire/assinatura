import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { savePdf } from "@/lib/pdfStorage";
import { notifyClinicSigned } from "@/lib/evolution";

const bodySchema = z.object({
  name: z.string().min(1),
  cpf: z.string().min(1),
  signed_at_client: z.string(),
  pdf_base64: z.string().min(1),
});

/** Chamado pela página pública /assinatura quando o paciente confirma a assinatura. */
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const pdfBuffer = Buffer.from(input.pdf_base64, "base64");
  const sha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
  const pdfStorageKey = await savePdf(anamnesis.clinic_id, anamnesis.id, pdfBuffer);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  const { error: insertError } = await supabase.from("signatures").insert({
    anamnesis_id: anamnesis.id,
    clinic_id: anamnesis.clinic_id,
    signer_name: input.name,
    signer_cpf: input.cpf,
    signed_at_client: new Date(input.signed_at_client).toISOString(),
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
    await notifyClinicSigned(clinic, input.name);
  }

  return NextResponse.json({ ok: true });
}
