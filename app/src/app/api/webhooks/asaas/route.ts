import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ASAAS_ACTIVATING_EVENTS, ASAAS_OVERDUE_EVENTS, type AsaasWebhookPayload } from "@/lib/asaas";
import { safeEqual } from "@/lib/safeEqual";

/**
 * Recebe eventos de pagamento do Asaas. Configure no painel do Asaas (Webhooks) essa URL
 * e um "Token de autenticação" com o mesmo valor de ASAAS_WEBHOOK_TOKEN.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("asaas-access-token");
  if (!token || !process.env.ASAAS_WEBHOOK_TOKEN || !safeEqual(token, process.env.ASAAS_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as AsaasWebhookPayload | null;
  const subscriptionId = payload?.payment?.subscription;
  if (!payload || !subscriptionId) {
    // Evento que não é sobre uma assinatura (ex.: cobrança avulsa) — nada a fazer.
    return NextResponse.json({ ok: true });
  }

  const supabase = createSupabaseAdminClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, past_due_since")
    .eq("asaas_subscription_id", subscriptionId)
    .maybeSingle();
  if (!clinic) {
    return NextResponse.json({ ok: true });
  }

  if (ASAAS_ACTIVATING_EVENTS.has(payload.event)) {
    await supabase.from("clinics").update({ subscription_status: "active", past_due_since: null }).eq("id", clinic.id);
  } else if (ASAAS_OVERDUE_EVENTS.has(payload.event)) {
    await supabase
      .from("clinics")
      .update({
        subscription_status: "past_due",
        past_due_since: clinic.past_due_since ?? new Date().toISOString(),
      })
      .eq("id", clinic.id);
  }

  return NextResponse.json({ ok: true });
}
