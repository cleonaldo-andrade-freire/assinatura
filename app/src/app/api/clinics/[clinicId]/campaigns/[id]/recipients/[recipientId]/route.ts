import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCampaignOwner } from "@/lib/campaignsAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRecipientAction } from "@/lib/campaignsServer";
import type { MarketingCampaign } from "@/lib/database.types";

const bodySchema = z.object({ action: z.enum(["yes", "no", "handled", "wrong_number", "retry"]) });

/** Ação manual da clínica sobre um contato (marcar SIM/NÃO, já respondi, número errado, reenviar). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string; recipientId: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("marketing_campaigns").select("*").eq("id", params.id).eq("clinic_id", auth.clinic.id).maybeSingle();
  const campaign = data as MarketingCampaign | null;
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await applyRecipientAction(supabase, auth.clinic, campaign, params.recipientId, parsed.data.action);
  return result.ok
    ? NextResponse.json({ ok: true, warning: result.warning ?? null })
    : NextResponse.json({ error: "update_failed", message: result.message }, { status: result.status });
}
