import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { finalizeCertificateSignature } from "@/lib/certificates";
import { finalizePrescriptionSignature } from "@/lib/prescriptions";

/**
 * Rede de segurança pro webhook (`/api/webhooks/certisign`): reconsulta na
 * Certisign os atestados/prescrições que ficaram `aguardando_assinatura` com
 * pedido já disparado, pro caso do callback ter se perdido (a Certisign
 * reenvia por 24h, mas nada é 100%). Protegido pelo header que a Vercel Cron
 * injeta quando CRON_SECRET está configurada — mesmo padrão de
 * /api/cron/generate-recurring-expenses.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const [{ data: pendingCertificates }, { data: pendingPrescriptions }] = await Promise.all([
    supabase
      .from("certificates")
      .select("id")
      .eq("status", "aguardando_assinatura")
      .not("signature_provider_doc_id", "is", null),
    supabase
      .from("prescriptions")
      .select("id")
      .eq("status", "aguardando_assinatura")
      .not("signature_provider_doc_id", "is", null),
  ]);

  let checked = 0;
  let resolved = 0;

  for (const certificate of pendingCertificates ?? []) {
    checked++;
    const result = await finalizeCertificateSignature(certificate.id);
    if (result.status !== "aguardando_assinatura") resolved++;
  }
  for (const prescription of pendingPrescriptions ?? []) {
    checked++;
    const result = await finalizePrescriptionSignature(prescription.id);
    if (result.status !== "aguardando_assinatura") resolved++;
  }

  return NextResponse.json({ ok: true, checked, resolved });
}
