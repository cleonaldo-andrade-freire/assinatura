import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runCampaignTick } from "@/lib/campaignsServer";

/**
 * Envia os convites das campanhas de promoção, um por clínica por chamada.
 * Chamado a cada minuto pelo pg_cron do Supabase (migration 076) — quem
 * decide horário comercial, limite diário e o intervalo de 4–7 min entre
 * mensagens é `runCampaignTick`, não a frequência do cron.
 *
 * Protegido pelo mesmo CRON_SECRET dos lembretes de consulta.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runCampaignTick(createSupabaseAdminClient());
  return NextResponse.json(result);
}
