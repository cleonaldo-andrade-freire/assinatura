import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PROSTHESIS_STAGES } from "@/lib/prosthesisTemplates";
import type { ProsthesisStage } from "@/lib/database.types";

const bodySchema = z.object({ body: z.string().min(1) });

function isValidStage(stage: string): stage is ProsthesisStage {
  return (PROSTHESIS_STAGES as string[]).includes(stage);
}

/** Salva (upsert) o modelo customizado da clínica pra um estágio de prótese. */
export async function PUT(req: NextRequest, { params }: { params: { clinicId: string; stage: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidStage(params.stage)) {
    return NextResponse.json({ error: "invalid_stage" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("prosthesis_stage_templates")
    .upsert(
      { clinic_id: clinic.id, stage: params.stage, body: parsed.data.body, updated_at: new Date().toISOString() },
      { onConflict: "clinic_id,stage" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "save_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ template: data });
}

/** Volta a usar o texto padrão pra esse estágio (apaga a personalização da clínica). */
export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; stage: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidStage(params.stage)) {
    return NextResponse.json({ error: "invalid_stage" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("prosthesis_stage_templates").delete().eq("clinic_id", clinic.id).eq("stage", params.stage);
  return NextResponse.json({ ok: true });
}
