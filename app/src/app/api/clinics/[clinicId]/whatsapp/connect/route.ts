import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createInstanceWithQr, evolutionAdminConfigured, setInstanceWebhook } from "@/lib/evolutionAdmin";

/**
 * Self-service: a própria clínica dispara a criação/conexão da instância dela na
 * Evolution API e recebe o QR Code de volta pra escanear — sem precisar do operador.
 */
export async function POST(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!evolutionAdminConfigured()) {
    return NextResponse.json({ error: "evolution_admin_not_configured" }, { status: 500 });
  }

  const instanceName = clinic.evolution_instance_name || `anamnese-${clinic.slug}`;
  const result = await createInstanceWithQr(instanceName);
  if (!result || !result.qrcodeBase64) {
    return NextResponse.json({ error: "qrcode_unavailable" }, { status: 502 });
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("clinics")
    .update({
      evolution_instance_name: instanceName,
      evolution_base_url: process.env.EVOLUTION_ADMIN_BASE_URL,
      evolution_api_key: process.env.EVOLUTION_ADMIN_API_KEY,
    })
    .eq("id", clinic.id);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution/${instanceName}`;
  await setInstanceWebhook(instanceName, webhookUrl);

  return NextResponse.json({ qrcode_base64: result.qrcodeBase64, instance_name: instanceName });
}
