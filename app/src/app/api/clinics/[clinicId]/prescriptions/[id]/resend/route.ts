import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/evolution";

/** Reenvia o link da prescrição assinada por WhatsApp, sem reprocessar a assinatura. */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: prescription } = await supabase
    .from("prescriptions")
    .select("id, token, status, patient_phone")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!prescription) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (prescription.status !== "assinado") {
    return NextResponse.json({ error: "not_signed" }, { status: 409 });
  }
  if (!prescription.patient_phone) {
    return NextResponse.json({ error: "no_phone" }, { status: 400 });
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/prescricao?token=${prescription.token}`;
  const sent = await sendText(clinic, prescription.patient_phone, `💊 Seu receituário odontológico já está disponível: ${link}`);
  if (!sent) {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  await supabase.from("prescriptions").update({ sent_whatsapp_at: new Date().toISOString() }).eq("id", params.id);
  return NextResponse.json({ ok: true });
}
