import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidCPF } from "@/lib/validation";

const PAGE_SIZE = 10;

const bodySchema = z.object({
  name: z.string().min(1),
  cpf: z
    .string()
    .min(1)
    .optional()
    .refine((val) => !val || isValidCPF(val), { message: "CPF inválido" }),
  phone: z.string().min(10).optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});

/** Lista paginada (10/página) dos pacientes cadastrados pela clínica logada, com busca por nome. */
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
  let query = supabase.from("patients").select("*", { count: "exact" }).eq("clinic_id", clinic.id);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query.order("name", { ascending: true }).range(from, to);

  return NextResponse.json({ patients: data ?? [], count: count ?? 0, page, pageSize: PAGE_SIZE });
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
    .from("patients")
    .insert({
      clinic_id: clinic.id,
      name: parsed.data.name,
      cpf: parsed.data.cpf ?? null,
      phone: parsed.data.phone ?? null,
      birth_date: parsed.data.birth_date ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed", message: error?.message }, { status: 500 });
  }
  return NextResponse.json({ patient: data }, { status: 201 });
}
