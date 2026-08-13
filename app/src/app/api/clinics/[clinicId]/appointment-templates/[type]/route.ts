import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TEMPLATE_TYPES } from "@/lib/appointmentTemplates";
import type { AppointmentMessageTemplateType } from "@/lib/database.types";

const bodySchema = z.object({ body: z.string().min(1) });

function isValidType(type: string): type is AppointmentMessageTemplateType {
  return (TEMPLATE_TYPES as string[]).includes(type);
}

/** Salva (upsert) o modelo customizado da clínica pra um momento do fluxo da agenda. */
export async function PUT(req: NextRequest, { params }: { params: { clinicId: string; type: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidType(params.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointment_message_templates")
    .upsert(
      { clinic_id: clinic.id, template_type: params.type, body: parsed.data.body, updated_at: new Date().toISOString() },
      { onConflict: "clinic_id,template_type" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "save_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ template: data });
}

/** Volta a usar o texto padrão pra esse momento do fluxo (apaga a personalização da clínica). */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; type: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidType(params.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("appointment_message_templates").delete().eq("clinic_id", clinic.id).eq("template_type", params.type);
  return NextResponse.json({ ok: true });
}
