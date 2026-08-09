import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequestAuthorized } from "@/lib/adminSession";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  whatsapp_number: z.string().optional(),
  evolution_base_url: z.string().optional(),
  evolution_instance_name: z.string().optional(),
  evolution_api_key: z.string().optional(),
  notify_phone: z.string().optional(),
});

/** Atualiza a config de WhatsApp/Evolution API de uma clínica (preenchida à mão pelo operador hoje). */
export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const authorized = await isAdminRequestAuthorized(req.headers.get("x-admin-key"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Campos vazios viram null (permite limpar um valor já preenchido).
  const update = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [key, value?.trim() ? value.trim() : null])
  );

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("clinics").update(update).eq("id", params.clinicId);
  if (error) {
    console.error("Falha ao salvar config de WhatsApp/Evolution:", error);
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
