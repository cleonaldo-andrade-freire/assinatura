import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCampaignOwner } from "@/lib/campaignsAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listDraftAudience, setCampaignContactRemoved } from "@/lib/campaignsServer";
import { canonicalCampaignPhone } from "@/lib/campaigns";
import type { MarketingCampaign } from "@/lib/database.types";

async function loadCampaign(clinicId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("marketing_campaigns").select("*").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
  return { supabase, campaign: data as MarketingCampaign | null };
}

/** Rascunho: lista de quem vai receber, com quem já foi retirado marcado. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const { supabase, campaign } = await loadCampaign(auth.clinic.id, params.id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (campaign.status !== "rascunho") return NextResponse.json({ error: "invalid_status" }, { status: 409 });

  try {
    return NextResponse.json({ members: await listDraftAudience(supabase, auth.clinic, campaign) });
  } catch (err) {
    return NextResponse.json({ error: "query_failed", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

const bodySchema = z.object({ phone: z.string().min(8).max(20), removed: z.boolean() });

/** Tira ou devolve um contato desta campanha. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? canonicalCampaignPhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { supabase, campaign } = await loadCampaign(auth.clinic.id, params.id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await setCampaignContactRemoved(supabase, auth.clinic, campaign, phone, parsed.data.removed);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "update_failed", message: result.message }, { status: result.status });
}
