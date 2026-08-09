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

/** Lista os modelos de anamnese da clínica logada. RLS já garante que só vem o que é dela. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("question_templates")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { clinicId: string } }) {
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
    .insert({ clinic_id: clinic.id, name: parsed.data.name, questions: parsed.data.questions })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ template: data }, { status: 201 });
}
