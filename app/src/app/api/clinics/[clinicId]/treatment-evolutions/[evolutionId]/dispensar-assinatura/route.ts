import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({ waived: z.boolean() });

/** Dispensa (ou reativa) a assinatura do paciente numa evolução — tira da
 * tela "Evoluções pendentes de assinatura" e do lembrete automático (ver
 * migration 072). Evolução já assinada pelo paciente não pode ser
 * dispensada: ali só falta a contra-assinatura da dentista. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; evolutionId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("id, signature_status")
    .eq("id", params.evolutionId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!evolution) {
    return NextResponse.json({ error: "not_found", message: "Evolução não encontrada." }, { status: 404 });
  }
  if (evolution.signature_status === "assinada") {
    return NextResponse.json(
      { error: "already_signed", message: "O paciente já assinou esta evolução — falta só a assinatura da dentista." },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("treatment_evolutions")
    .update({ signature_waived_at: parsed.data.waived ? new Date().toISOString() : null })
    .eq("id", params.evolutionId)
    .eq("clinic_id", clinic.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
