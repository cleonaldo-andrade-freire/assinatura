import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeCertificateSignature } from "@/lib/certificates";

/**
 * Reconsulta a Certisign na hora, sem esperar o webhook ou o cron horário —
 * usado pelo botão "Verificar assinatura agora" (útil em dev local, onde o
 * webhook não alcança localhost, e em produção pra não fazer a dentista
 * esperar até 1h caso o callback se perca).
 */
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

  const updated = await finalizeCertificateSignature(params.id);
  return NextResponse.json({ certificate: updated });
}
