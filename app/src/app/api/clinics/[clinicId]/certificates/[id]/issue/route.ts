import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueCertificate } from "@/lib/certificates";

/** Reprocessa a assinatura de um atestado com `status = 'falha'` ("Tentar novamente" no dashboard). */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase
    .from("certificates")
    .select("id")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!certificate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body;
  try {
    body = await _req.json();
  } catch (e) {
    body = {};
  }

  const issued = await issueCertificate(params.id, body.signerCertificatePem);
  return NextResponse.json({ certificate: issued });
}
