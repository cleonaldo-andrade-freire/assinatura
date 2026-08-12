import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Sugestão de preenchimento pro formulário de atestado, buscando no cadastro de pacientes da clínica. */
export async function GET(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ patients: [] });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("patients")
    .select("id, name, cpf, phone")
    .eq("clinic_id", clinic.id)
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(8);

  return NextResponse.json({ patients: data ?? [] });
}
