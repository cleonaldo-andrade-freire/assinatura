import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issuePrescription } from "@/lib/prescriptions";

/** Reprocessa a assinatura de uma prescrição com `status = 'falha'` ("Tentar novamente" no dashboard). */
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

  const issued = await issuePrescription(params.id);
  return NextResponse.json({ prescription: issued });
}
