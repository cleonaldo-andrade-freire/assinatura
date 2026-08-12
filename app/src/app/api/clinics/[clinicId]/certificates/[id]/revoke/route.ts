import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  reason: z.string().optional(),
});

/** Revoga um atestado assinado — deixa de ser confirmado como válido no portal público de validação. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase
    .from("certificates")
    .select("id, status, revoked_at")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!certificate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (certificate.status !== "assinado") {
    return NextResponse.json({ error: "not_signed" }, { status: 409 });
  }
  if (certificate.revoked_at) {
    return NextResponse.json({ error: "already_revoked" }, { status: 409 });
  }

  const { error } = await supabase
    .from("certificates")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: parsed.data.reason?.trim() || null })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
