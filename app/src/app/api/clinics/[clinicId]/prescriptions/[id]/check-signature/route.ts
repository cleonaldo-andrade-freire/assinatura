import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizePrescriptionSignature } from "@/lib/prescriptions";

/**
 * Reconsulta a Certisign na hora, sem esperar o webhook ou o cron horário —
 * ver `certificates/[id]/check-signature/route.ts` (mesma ideia, espelhado
 * pra prescrição).
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("id")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!prescription) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updated = await finalizePrescriptionSignature(params.id);
  return NextResponse.json({ prescription: updated });
}
