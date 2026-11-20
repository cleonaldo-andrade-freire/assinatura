import { NextRequest, NextResponse } from "next/server";
import { requireCampaignOwner } from "@/lib/campaignsAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildCampaignAudience } from "@/lib/campaignsServer";
import { CAMPAIGN_DAILY_LIMIT } from "@/lib/campaigns";

/** Quantos contatos o público escolhido teria hoje (já sem opt-out e sem duplicados) — pra prévia no formulário. */
export async function GET(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const audienceParam = req.nextUrl.searchParams.get("audience");
  const audience = audienceParam === "leads" || audienceParam === "todos" ? audienceParam : "pacientes";
  const onlyAttended = req.nextUrl.searchParams.get("only_attended") === "1";

  const supabase = await createSupabaseServerClient();
  try {
    const members = await buildCampaignAudience(supabase, auth.clinic, { audience, only_attended: onlyAttended });
    return NextResponse.json({ count: members.length, days: Math.ceil(members.length / CAMPAIGN_DAILY_LIMIT) });
  } catch (err) {
    return NextResponse.json({ error: "query_failed", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
