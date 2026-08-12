import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const itemSchema = z.object({
  drug_name: z.string().min(1),
  dosage: z.string().min(1),
  instructions: z.string().min(1),
  generic_allowed: z.boolean().default(false),
  control_type: z.enum(["comum", "antimicrobiano_retencao", "controlado_especial"]).default("comum"),
});

const bodySchema = z.object({
  name: z.string().min(1),
  items: z.array(itemSchema).default([]),
  notes_template: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("prescription_templates")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ template: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.items.some((item) => item.control_type === "controlado_especial")) {
    return NextResponse.json({ error: "controlado_especial_nao_suportado" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("prescription_templates")
    .update({
      name: parsed.data.name,
      items: parsed.data.items,
      notes_template: parsed.data.notes_template ?? null,
    })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ template: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("prescription_templates")
    .delete({ count: "exact" })
    .eq("id", params.id)
    .eq("clinic_id", clinic.id);

  if (error) {
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
