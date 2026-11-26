import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { anamnesisFormSchema, saveAnamnesisForm } from "@/lib/anamnesisForm";

/**
 * Rascunho da Anamnese Web: o formulário chama a cada etapa concluída
 * (identificação → saúde → assinatura), pra clínica ter os dados do
 * paciente mesmo que ele não chegue a assinar. Bloqueado depois de
 * assinada — o registro tem que bater com o PDF assinado.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("id, clinic_id, patient_cpf, patient_phone")
    .eq("token", params.token)
    .maybeSingle();
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

  const parsed = anamnesisFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await saveAnamnesisForm(supabase, anamnesis, parsed.data);
  if (error) {
    return NextResponse.json({ error: "save_failed", message: error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
