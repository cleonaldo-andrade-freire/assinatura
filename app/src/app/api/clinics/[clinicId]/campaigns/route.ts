import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCampaignOwner } from "@/lib/campaignsAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CAMPAIGN_CONTENT_MAX_CHARS, CAMPAIGN_MEDIA_TYPES } from "@/lib/campaigns";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Dê um nome para a campanha.").max(120),
  audience: z.enum(["pacientes", "leads", "todos"]),
  only_attended: z.boolean().default(false),
  invite_text: z.string().trim().min(1, "Escreva a mensagem de convite.").max(500, "O convite deve ser curto (até 500 caracteres)."),
  content_text: z.string().trim().min(1, "Escreva o conteúdo da oferta.").max(CAMPAIGN_CONTENT_MAX_CHARS, `O conteúdo vai até ${CAMPAIGN_CONTENT_MAX_CHARS} caracteres.`),
  media: z
    .object({
      key: z.string().min(1),
      mime: z.string().refine((m) => m in CAMPAIGN_MEDIA_TYPES, "Formato de mídia não suportado."),
      name: z.string().max(200),
    })
    .nullable()
    .default(null),
});

/** Cria a campanha como rascunho — nada é enviado até "Iniciar envio". */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const auth = await requireCampaignOwner(params.clinicId);
  if ("error" in auth) return auth.error;
  const { clinic } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { media, ...fields } = parsed.data;
  // A mídia foi enviada pra uma pasta da própria clínica (ver media-upload).
  if (media && !media.key.startsWith(`${clinic.id}/`)) {
    return NextResponse.json({ error: "invalid_media" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      clinic_id: clinic.id,
      ...fields,
      only_attended: fields.audience === "leads" ? false : fields.only_attended,
      media_key: media?.key ?? null,
      media_type: media ? CAMPAIGN_MEDIA_TYPES[media.mime] : null,
      media_mime: media?.mime ?? null,
      media_name: media?.name ?? null,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}
