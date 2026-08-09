import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentClinic } from "@/lib/auth";

const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(["text", "yesno"]),
});

const bodySchema = z.object({
  name: z.string().min(1),
  questions: z.array(questionSchema).min(1),
});

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; templateId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("question_templates")
    .update({ name: parsed.data.name, questions: parsed.data.questions })
    .eq("id", params.templateId)
    .eq("clinic_id", clinic.id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "update_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ template: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; templateId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("question_templates").delete().eq("id", params.templateId).eq("clinic_id", clinic.id);

  if (error) {
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
