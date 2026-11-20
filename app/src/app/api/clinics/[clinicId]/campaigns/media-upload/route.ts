import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCampaignOwner } from "@/lib/campaignsAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CAMPAIGN_MEDIA_BUCKET } from "@/lib/campaignsServer";
import { CAMPAIGN_MEDIA_MAX_BYTES, CAMPAIGN_MEDIA_TYPES } from "@/lib/campaigns";

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" };

const bodySchema = z.object({
  mime: z.string().refine((m) => m in CAMPAIGN_MEDIA_TYPES, "Use imagem JPG, PNG, WEBP ou vídeo MP4."),
  size: z.number().int().positive().max(CAMPAIGN_MEDIA_MAX_BYTES, "Arquivo acima de 16MB — o WhatsApp não entrega vídeo maior que isso."),
});

/**
 * URL assinada pro navegador subir a mídia DIRETO no Storage — vídeo de
 * vários MB passaria do limite de corpo das funções da Vercel (4,5MB) se
 * viesse por aqui.
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const path = `${auth.clinic.id}/${randomUUID()}.${EXTENSION[parsed.data.mime]}`;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: "upload_url_failed", message: error?.message ?? "Bucket campaign-media existe?" }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
