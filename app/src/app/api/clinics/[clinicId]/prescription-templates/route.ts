import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 10;

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

/** Lista paginada (10/página) dos templates de prescrição da clínica logada, com busca por nome. */
export async function GET(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("prescription_templates").select("*", { count: "exact" }).eq("clinic_id", clinic.id);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query.order("name", { ascending: true }).range(from, to);

  return NextResponse.json({ templates: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
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
  if (parsed.data.items.some((item) => item.control_type === "controlado_especial")) {
    return NextResponse.json({ error: "controlado_especial_nao_suportado" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("prescription_templates")
    .insert({
      clinic_id: clinic.id,
      name: parsed.data.name,
      items: parsed.data.items,
      notes_template: parsed.data.notes_template ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ template: data }, { status: 201 });
}
