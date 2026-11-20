import { NextRequest, NextResponse } from "next/server";
import { requireCampaignOwner } from "@/lib/campaignsAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CAMPAIGN_MEDIA_BUCKET } from "@/lib/campaignsServer";

/** Prévia da mídia da campanha na tela — redireciona pra uma URL assinada curta (o bucket é privado). */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("marketing_campaigns").select("media_key").eq("id", params.id).eq("clinic_id", auth.clinic.id).maybeSingle();
  if (!data?.media_key) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: signed, error } = await createSupabaseAdminClient().storage.from(CAMPAIGN_MEDIA_BUCKET).createSignedUrl(data.media_key, 10 * 60);
  if (error || !signed) return NextResponse.json({ error: "media_failed", message: error?.message }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
