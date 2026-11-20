import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCampaignOwner } from "@/lib/campaignsAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CAMPAIGN_MEDIA_BUCKET, sendCampaignTest, startCampaign } from "@/lib/campaignsServer";
import type { CampaignStatus, MarketingCampaign } from "@/lib/database.types";

const bodySchema = z.object({ action: z.enum(["start", "pause", "resume", "cancel", "test"]) });

/** De qual status cada ação pode partir, e pra onde vai. "start" é especial (monta a fila). */
const TRANSITIONS: Record<"pause" | "resume" | "cancel", { from: CampaignStatus[]; to: CampaignStatus }> = {
  pause: { from: ["enviando"], to: "pausada" },
  resume: { from: ["pausada"], to: "enviando" },
  cancel: { from: ["rascunho", "enviando", "pausada"], to: "cancelada" },
};

async function loadCampaign(clinicId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("marketing_campaigns").select("*").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
  return { supabase, campaign: data as MarketingCampaign | null };
}

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { action } = parsed.data;

  const { supabase, campaign } = await loadCampaign(auth.clinic.id, params.id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "test") {
    const result = await sendCampaignTest(auth.clinic, campaign);
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "test_failed", message: result.message }, { status: 400 });
  }

  if (action === "start") {
    if (campaign.status !== "rascunho") return NextResponse.json({ error: "invalid_status", message: "Esta campanha já foi iniciada." }, { status: 409 });
    try {
      const { count } = await startCampaign(supabase, auth.clinic, campaign);
      return NextResponse.json({ ok: true, count });
    } catch (err) {
      return NextResponse.json({ error: "start_failed", message: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
  }

  const transition = TRANSITIONS[action];
  if (!transition.from.includes(campaign.status)) {
    return NextResponse.json({ error: "invalid_status", message: "Ação não disponível no status atual." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("marketing_campaigns")
    .update({
      status: transition.to,
      updated_at: now,
      ...(action === "resume" ? { pause_reason: null, consecutive_failures: 0 } : {}),
      ...(action === "pause" ? { pause_reason: "Pausada manualmente." } : {}),
      ...(action === "cancel" ? { finished_at: now } : {}),
    })
    .eq("id", campaign.id)
    .eq("status", campaign.status);
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  // Cancelar tira da fila quem ainda não recebeu.
  if (action === "cancel") {
    await supabase
      .from("marketing_campaign_recipients")
      .update({ status: "skipped", skip_reason: "Campanha cancelada" })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending");
  }
  return NextResponse.json({ ok: true });
}

/** Exclui um rascunho (nada foi enviado ainda). Campanha iniciada só pode ser cancelada — o histórico fica. */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const { supabase, campaign } = await loadCampaign(auth.clinic.id, params.id);
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (campaign.status !== "rascunho") {
    return NextResponse.json({ error: "invalid_status", message: "Só rascunhos podem ser excluídos — cancele a campanha." }, { status: 409 });
  }

  const { error } = await supabase.from("marketing_campaigns").delete().eq("id", campaign.id);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  if (campaign.media_key) await createSupabaseAdminClient().storage.from(CAMPAIGN_MEDIA_BUCKET).remove([campaign.media_key]);
  return NextResponse.json({ ok: true });
}
