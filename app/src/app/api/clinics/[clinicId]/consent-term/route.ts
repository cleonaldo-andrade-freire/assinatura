import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  consent_term_text: z.string().min(1),
  consent_term_version: z.string().min(1),
});

/** Texto do Termo de Adesão Eletrônica — configurável por clínica, nunca
 * hardcoded no app (exigência explícita: cada clínica tem sua própria
 * redação/responsabilidade jurídica sobre o termo). Mudar a versão aqui não
 * invalida consentimentos já registrados — só passa a valer pros próximos. */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      consent_term_text: parsed.data.consent_term_text.trim(),
      consent_term_version: parsed.data.consent_term_version.trim(),
      consent_term_updated_at: new Date().toISOString(),
    })
    .eq("id", clinic.id);

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
