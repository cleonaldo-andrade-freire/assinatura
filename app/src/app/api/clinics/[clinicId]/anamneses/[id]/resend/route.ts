import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/evolution";

/** Reenvia o link da anamnese assinada por WhatsApp — mesmo padrão de
 * certificates/[id]/resend e prescriptions/[id]/resend. O link aponta pra
 * /assinatura (mesma página do fluxo de assinatura original), que já mostra
 * o estado "já assinado" com o botão de baixar o PDF quando reaberta. */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: anamnesis } = await supabase
    .from("anamneses")
    .select("id, token, patient_phone")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!anamnesis) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: signature } = await supabase.from("signatures").select("id").eq("anamnesis_id", anamnesis.id).maybeSingle();
  if (!signature) {
    return NextResponse.json({ error: "not_signed" }, { status: 409 });
  }
  if (!anamnesis.patient_phone) {
    return NextResponse.json({ error: "no_phone" }, { status: 400 });
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/assinatura?token=${anamnesis.token}`;
  const sent = await sendText(clinic, anamnesis.patient_phone, `📄 Sua anamnese assinada já está disponível: ${link}`);
  if (!sent) {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  await supabase.from("anamneses").update({ sent_whatsapp_at: new Date().toISOString() }).eq("id", params.id);
  return NextResponse.json({ ok: true });
}
