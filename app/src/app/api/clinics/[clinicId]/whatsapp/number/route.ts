import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  whatsapp_number: z.string().min(10).optional(),
  notify_phone: z.string().min(10).optional(),
  lead_alert_enabled: z.boolean().optional(),
});

/**
 * A própria clínica confirma/atualiza o número de WhatsApp conectado, o número
 * que recebe o aviso de mensagem de lead e se esse aviso está ligado. Cada
 * campo só é gravado quando vem no corpo — nada de default silencioso de
 * `notify_phone` pro número da clínica (isso apagava o alvo do alerta a cada
 * vez que a clínica salvava o número).
 */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const update: Record<string, string | boolean> = {};
  if (parsed.data.whatsapp_number !== undefined) {
    update.whatsapp_number = parsed.data.whatsapp_number;
    // Conveniência de onboarding: na primeira vez que a clínica confirma o
    // número, usa ele também como número de aviso. Se já houver um configurado,
    // respeita — não sobrescreve (isso apagava o alvo do alerta de lead).
    if (!clinic.notify_phone && parsed.data.notify_phone === undefined) {
      update.notify_phone = parsed.data.whatsapp_number;
    }
  }
  if (parsed.data.notify_phone !== undefined) update.notify_phone = parsed.data.notify_phone;
  if (parsed.data.lead_alert_enabled !== undefined) update.lead_alert_enabled = parsed.data.lead_alert_enabled;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("clinics").update(update).eq("id", clinic.id);

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
