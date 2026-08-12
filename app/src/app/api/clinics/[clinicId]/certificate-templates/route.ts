import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 10;

const bodySchema = z.object({
  name: z.string().min(1),
  reason_template: z.string().min(1),
  rest_days_default: z.number().int().min(0).optional(),
});

/** Lista paginada (10/página) dos templates de atestado da clínica logada, com busca por nome. */
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
  let query = supabase.from("certificate_templates").select("*", { count: "exact" }).eq("clinic_id", clinic.id);
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("certificate_templates")
    .insert({
      clinic_id: clinic.id,
      name: parsed.data.name,
      reason_template: parsed.data.reason_template,
      rest_days_default: parsed.data.rest_days_default ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ template: data }, { status: 201 });
}
